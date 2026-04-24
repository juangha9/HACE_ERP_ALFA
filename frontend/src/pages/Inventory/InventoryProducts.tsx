import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { InventoryProduct } from '../../services/types';
import { exportToPDF, exportToExcel } from '../../utils/exportUtils';

export default function InventoryProducts() {
    const [products, setProducts] = useState<InventoryProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const prods = await api.getInventoryProducts();
            setProducts(prods);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleExportPDF = () => {
        const columns = ["SKU", "Producto", "Categoría", "Ubicación", "Stock", "Costo Prom."];
        const data = filtered.map(p => [
            p.sku || '-',
            p.name,
            p.category,
            p.location?.name || '-',
            `${p.stock_current} ${p.unit}`,
            `S/ ${Number(p.average_cost).toFixed(2)}`
        ]);
        exportToPDF("Inventario de Materiales", columns, data, "Inventario_Materiales");
    };

    const handleExportExcel = () => {
        const data = filtered.map(p => ({
            SKU: p.sku,
            Producto: p.name,
            Categoría: p.category,
            Ubicación: p.location?.name,
            Stock: p.stock_current,
            Unidad: p.unit,
            Costo_Promedio: p.average_cost
        }));
        exportToExcel(data, "Inventario_Materiales");
    };

    return (
        <div key={loading ? 'loading' : 'content'} className="animate-premium-fade space-y-6 text-sm">
            <header className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Inventario</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Catálogo de materiales y productos</p>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-lg text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 transition-all"
                    >
                        <span className="material-symbols-outlined text-lg">description</span>
                        EXCEL
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-lg text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400 transition-all border-l border-slate-200 dark:border-slate-700"
                    >
                        <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                        PDF
                    </button>
                </div>
            </header>

            <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex gap-4 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="relative flex-1 max-w-md">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">search</span>
                        <input
                            type="text"
                            placeholder="Buscar por nombre o SKU..."
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-slate-200"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                        <tr>
                            <th className="px-6 py-4">SKU</th>
                            <th className="px-6 py-4">Producto</th>
                            <th className="px-6 py-4">Categoría</th>
                            <th className="px-6 py-4">Ubicación</th>
                            <th className="px-6 py-4 text-center">Stock</th>
                            <th className="px-6 py-4 text-right">Costo Prom.</th>
                            <th className="px-6 py-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={7} className="text-center py-8 text-slate-400 italic">Cargando...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-8 text-slate-400 italic">No se encontraron productos.</td></tr>
                        ) : (
                            filtered.map(p => (
                                <tr key={p.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group">
                                    <td className="px-6 py-4 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">{p.sku || '-'}</td>
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-900 dark:text-white">{p.name}</p>
                                        {p.description && <p className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[200px]">{p.description}</p>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-800 rounded-lg px-2 py-1">{p.category}</span>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">{p.location?.name || '-'}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 rounded-lg text-xs font-black ${p.stock_current <= p.min_stock ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
                                            {p.stock_current} {p.unit}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-600 dark:text-slate-400">
                                        S/ {Number(p.average_cost).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {/* View details or edit link could go here */}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>


        </div>
    );
}
