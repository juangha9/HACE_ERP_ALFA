import { useState, useEffect } from 'react';
import { catalogService } from '../../../services/catalogService';
import type { CatalogProduct } from '../../../services/catalogService';
import { AddProductModal } from './AddProductModal';
import { MassUploadModal } from './MassUploadModal';
import { exportToPDF, exportToExcel } from '../../../utils/exportUtils';

export const CatalogPage = () => {
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isMassUploadModalOpen, setIsMassUploadModalOpen] = useState(false);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const data = await catalogService.getProducts();
            setProducts(data);
        } catch (error) {
            console.error('Error fetching products:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const handleExportPDF = () => {
        const columns = ["SKU", "Nombre Base", "Presentación", "Categoría", "Stock Mínimo"];
        const data = products.map(p => [
            p.sku,
            p.base_name,
            p.presentation,
            `${p.product_subfamilies?.product_families?.name} - ${p.product_subfamilies?.name}`,
            p.min_stock.toString()
        ]);
        exportToPDF("Catálogo de Productos", columns, data, "Catalogo_Productos");
    };

    const handleExportExcel = () => {
        const data = products.map(p => ({
            SKU: p.sku,
            Nombre: p.base_name,
            Presentación: p.presentation,
            Categoría: p.product_subfamilies?.product_families?.product_categories?.name,
            Subfamilia: p.product_subfamilies?.name,
            Marca: p.brand,
            Características: p.features,
            Stock_Minimo: p.min_stock
        }));
        exportToExcel(data, "Catalogo_Productos");
    };

    return (
        <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 mb-8">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Catálogo de Productos</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
                        Gestiona las características y SKU de todos tus productos y materiales.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                        <button
                            onClick={handleExportExcel}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-lg text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 transition-all"
                        >
                            <span className="material-symbols-outlined text-lg">description</span>
                            EXCEL
                        </button>
                        <button
                            onClick={handleExportPDF}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-lg text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400 transition-all border-l border-slate-200 dark:border-slate-800"
                        >
                            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                            PDF
                        </button>
                    </div>
                    
                    <button
                        onClick={() => setIsMassUploadModalOpen(true)}
                        className="flex items-center px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold transition-colors shadow-sm"
                    >
                        <span className="material-symbols-outlined mr-2 text-[20px]">cloud_upload</span>
                        Carga Masiva
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md shadow-blue-500/20"
                    >
                        <span className="material-symbols-outlined mr-2 text-[20px]">add</span>
                        Nuevo Producto
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-sm">
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">SKU</th>
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Nombre Base</th>
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Presentación</th>
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Categoría</th>
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Marca/Features</th>
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Stock Min</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">Cargando catálogo...</td>
                                </tr>
                            ) : products.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">No hay productos en el catálogo. Usa "Nuevo Producto" para añadir uno.</td>
                                </tr>
                            ) : (
                                products.map((product) => (
                                    <tr key={product.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="p-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                                {product.sku}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="font-semibold text-slate-900 dark:text-white">{product.base_name}</div>
                                        </td>
                                        <td className="p-4 text-slate-600 dark:text-slate-400 text-sm">
                                            {product.presentation}
                                        </td>
                                        <td className="p-4 text-xs">
                                            <div className="text-slate-900 dark:text-slate-300 font-medium">
                                                {product.product_subfamilies?.product_families?.product_categories?.name}
                                            </div>
                                            <div className="text-slate-500">
                                                {product.product_subfamilies?.product_families?.name} - {product.product_subfamilies?.name}
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm text-slate-600 dark:text-slate-400">
                                            {product.brand && <div className="font-medium">{product.brand}</div>}
                                            {product.features && <div className="text-xs text-slate-500">{product.features}</div>}
                                        </td>
                                        <td className="p-4 text-sm font-medium text-slate-700 dark:text-slate-300">
                                            {product.min_stock}
                                            {product.stock_alerts && <span className="ml-2 text-red-500" title="Alertas Activadas">⚠</span>}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isAddModalOpen && (
                <AddProductModal
                    onClose={() => setIsAddModalOpen(false)}
                    onSuccess={() => {
                        setIsAddModalOpen(false);
                        fetchProducts();
                    }}
                />
            )}

            {isMassUploadModalOpen && (
                <MassUploadModal
                    onClose={() => setIsMassUploadModalOpen(false)}
                    onSuccess={() => {
                        setIsMassUploadModalOpen(false);
                        fetchProducts();
                    }}
                />
            )}
        </div>
    );
};
