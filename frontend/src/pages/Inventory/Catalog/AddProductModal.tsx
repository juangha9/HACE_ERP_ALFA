import React, { useState, useEffect } from 'react';
import { catalogService } from '../../../services/catalogService';
import type { ProductCategory, ProductFamily, ProductSubfamily } from '../../../services/catalogService';

interface AddProductModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({ onClose, onSuccess }) => {
    // All raw data
    const [allFamilies, setAllFamilies] = useState<ProductFamily[]>([]);
    const [allSubfamilies, setAllSubfamilies] = useState<ProductSubfamily[]>([]);

    // Filtered data for dropdowns
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [families, setFamilies] = useState<ProductFamily[]>([]);
    const [subfamilies, setSubfamilies] = useState<ProductSubfamily[]>([]);

    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedFamily, setSelectedFamily] = useState('');
    const [selectedSubfamily, setSelectedSubfamily] = useState('');

    const [formData, setFormData] = useState({
        base_name: '',
        presentation: '',
        brand: '',
        features: '',
        min_stock: '' as number | '',
        stock_alerts: false,
        unit: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            catalogService.getCategories(),
            catalogService.getFamilies(),
            catalogService.getSubfamilies()
        ]).then(([cats, fams, subfams]) => {
            setAllFamilies(fams);
            setAllSubfamilies(subfams);

            // Filtrar familias que tienen al menos una subfamilia
            const validFamilies = fams.filter(f => subfams.some(s => s.family_id === f.id));
            // Filtrar categorías que tienen al menos una familia válida
            const validCategories = cats.filter(c => validFamilies.some(f => f.category_id === c.id));

            setCategories(validCategories);
        }).catch(console.error);
    }, []);

    useEffect(() => {
        if (selectedCategory) {
            const validFams = allFamilies.filter(
                f => f.category_id === selectedCategory && allSubfamilies.some(s => s.family_id === f.id)
            );
            setFamilies(validFams);
            setSelectedFamily('');
            setSelectedSubfamily('');
            setSubfamilies([]);
        } else {
            setFamilies([]);
            setSubfamilies([]);
            setSelectedFamily('');
            setSelectedSubfamily('');
        }
    }, [selectedCategory, allFamilies, allSubfamilies]);

    useEffect(() => {
        if (selectedFamily) {
            const validSubfams = allSubfamilies.filter(s => s.family_id === selectedFamily);
            setSubfamilies(validSubfams);
            setSelectedSubfamily('');
        } else {
            setSubfamilies([]);
            setSelectedSubfamily('');
        }
    }, [selectedFamily, allSubfamilies]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (!selectedSubfamily) throw new Error("Debes seleccionar una subfamilia");
            if (formData.stock_alerts && (!formData.min_stock || formData.min_stock <= 0)) {
                throw new Error("Debes ingresar un stock mínimo mayor a 0 si las alertas están activadas.");
            }

            await catalogService.createProduct({
                subfamily_id: selectedSubfamily,
                base_name: formData.base_name,
                presentation: formData.presentation,
                brand: formData.brand,
                features: formData.features,
                min_stock: formData.min_stock === '' ? 0 : formData.min_stock,
                stock_alerts: formData.stock_alerts,
                status: 'Activo',
                unit: formData.unit
            });

            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Error al crear producto');
        } finally {
            setLoading(false);
        }
    };

    const isSection1Complete = Boolean(selectedCategory && selectedFamily && selectedSubfamily);
    const isSection2Complete = Boolean(isSection1Complete && formData.base_name.trim() && formData.presentation.trim() && formData.unit);

    return (
        // Modeless Dialog (es fijo, pero permite interacción detrás si se quisiera; aquí estilo oscuro y modal por z-index)
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm pointer-events-auto">
            <div
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform scale-100 transition-all pointer-events-auto flex flex-col max-h-[90vh]"
            >
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Nuevo Producto en Catálogo
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-2 md:-mr-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {error && (
                        <div className="mb-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-start">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <form id="addProductForm" onSubmit={handleSubmit} className="space-y-6">

                        {/* Sección 1: Clasificación de Catálogo */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2">1. Selecciona la Clasificación</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Categoría *</label>
                                    <select
                                        required
                                        value={selectedCategory}
                                        onChange={e => setSelectedCategory(e.target.value)}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 dark:text-white"
                                    >
                                        <option value="" disabled hidden>Selecciona una Categoría...</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Familia *</label>
                                    <select
                                        required
                                        value={selectedFamily}
                                        onChange={e => setSelectedFamily(e.target.value)}
                                        disabled={!selectedCategory || families.length === 0}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 dark:text-white disabled:opacity-50"
                                    >
                                        <option value="" disabled hidden>Selecciona una Familia...</option>
                                        {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Subfamilia *</label>
                                    <select
                                        required
                                        value={selectedSubfamily}
                                        onChange={e => setSelectedSubfamily(e.target.value)}
                                        disabled={!selectedFamily || subfamilies.length === 0}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 dark:text-white disabled:opacity-50"
                                    >
                                        <option value="" disabled hidden>Selecciona una Subfamilia...</option>
                                        {subfamilies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Sección 2: Datos del Producto (Obligatorios) */}
                        <div className={`bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4 transition-all duration-300 ${isSection1Complete ? '' : 'opacity-40 pointer-events-none'}`}>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2">2. Datos Generales del Producto</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Nombre Base *</label>
                                    <input
                                        type="text"
                                        required
                                        disabled={!isSection1Complete}
                                        value={formData.base_name}
                                        onChange={e => setFormData({ ...formData, base_name: e.target.value })}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white disabled:opacity-50"
                                        placeholder="Ej. Bisagra Cazoleta"
                                    />
                                </div>

                                <div className="md:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Unidad de Medida *</label>
                                    <select
                                        required
                                        disabled={!isSection1Complete}
                                        value={formData.unit}
                                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white disabled:opacity-50"
                                    >
                                        <option value="" disabled hidden>Selecciona una Unidad...</option>
                                        <option value="Unidad">Unidad</option>
                                        <option value="Plancha">Plancha</option>
                                        <option value="Caja / Bolsa / Paquete">Caja / Bolsa / Paquete</option>
                                        <option value="Metro">Metro</option>
                                        <option value="Litro">Litro</option>
                                        <option value="Kilogramo">Kilogramo</option>
                                    </select>
                                </div>

                                <div className="md:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Presentación *</label>
                                    <input
                                        type="text"
                                        required
                                        disabled={!isSection1Complete}
                                        value={formData.presentation}
                                        onChange={e => setFormData({ ...formData, presentation: e.target.value })}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white disabled:opacity-50"
                                        placeholder="Ej. Caja x 100u, Unidad"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Sección 3: Datos Adicionales e Inventario (Opcionales) */}
                        <div className={`transition-all duration-300 ${isSection2Complete ? '' : 'opacity-40 pointer-events-none select-none'}`}>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4 mb-6">
                                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2">3. Atributos Adicionales (Opcional)</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Marca</label>
                                        <input
                                            type="text"
                                            disabled={!isSection2Complete}
                                            value={formData.brand}
                                            onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                            className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white disabled:opacity-50"
                                            placeholder="Ej. Blum, FGV"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Color / Textura / Acabado</label>
                                        <input
                                            type="text"
                                            disabled={!isSection2Complete}
                                            value={formData.features}
                                            onChange={e => setFormData({ ...formData, features: e.target.value })}
                                            className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white disabled:opacity-50"
                                            placeholder="Ej. Niquelado, Cierre Suave"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div>
                                    <label className="block text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
                                        Stock Mínimo {formData.stock_alerts ? '*' : ''}
                                    </label>
                                    <input
                                        type="number"
                                        min={formData.stock_alerts ? "1" : "0"}
                                        required={formData.stock_alerts}
                                        disabled={!isSection2Complete}
                                        value={formData.min_stock}
                                        onKeyDown={(e) => {
                                            if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                                                e.preventDefault();
                                            }
                                        }}
                                        onChange={e => {
                                            const val = e.target.value;
                                            const parsed = parseInt(val, 10);
                                            setFormData({ ...formData, min_stock: val === '' || isNaN(parsed) ? '' : parsed });
                                        }}
                                        className="w-32 px-4 py-3 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl focus:ring-2 focus:ring-amber-500 transition-all text-slate-900 dark:text-white text-center font-bold disabled:opacity-50"
                                    />
                                </div>
                                <div className="flex items-center space-x-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-300 dark:border-amber-700 w-full md:w-auto">
                                    <input
                                        type="checkbox"
                                        id="stock_alerts"
                                        disabled={!isSection2Complete}
                                        checked={formData.stock_alerts}
                                        onChange={e => setFormData({ ...formData, stock_alerts: e.target.checked })}
                                        className="w-5 h-5 text-amber-600 bg-slate-100 border-slate-300 rounded focus:ring-amber-500 dark:focus:ring-amber-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <label htmlFor="stock_alerts" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                        Activar alertas de stock bajo
                                    </label>
                                </div>
                            </div>
                        </div>

                    </form>
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="addProductForm"
                        disabled={loading}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 flex items-center"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Guardando...
                            </>
                        ) : 'Guardar y Generar SKU'}
                    </button>
                </div>
            </div>
        </div>
    );
};
