import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabase';
import { catalogService } from '../../../services/catalogService';
import type { CatalogProduct, ProductCategory, ProductFamily, ProductSubfamily } from '../../../services/catalogService';

export const ProductEditionTab: React.FC = () => {
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [loading, setLoading] = useState(true);

    // For hierarchies autocomplete/select
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [families, setFamilies] = useState<ProductFamily[]>([]);
    const [subfamilies, setSubfamilies] = useState<ProductSubfamily[]>([]);

    const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
    const [editForm, setEditForm] = useState({
        base_name: '',
        sku: '',
        presentation: '',
        brand: '',
        features: '',
        min_stock: '' as number | '',
        stock_alerts: false,
        status: 'Activo' as 'Activo' | 'Descontinuado' | 'Inactivo',
        edit_reason: '',
        subfamily_id: '',
        category_id: '',
        family_id: '',
        unit: 'Unidad',
        sku_corto: '',
        is_service: false,
        has_associated_service: false,
        associated_service_id: '',
        service_pricing_type: 'MONEDA' as 'MONEDA' | 'PORCENTAJE',
        service_pricing_value: '' as number | ''
    });
    const [initialEditForm, setInitialEditForm] = useState<typeof editForm | null>(null);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [skuWarningModal, setSkuWarningModal] = useState<{
        isOpen: boolean;
        oldValue: string;
        newValue: string;
        onConfirm: () => void;
        onCancel: () => void;
    } | null>(null);

    const loadProducts = async () => {
        setLoading(true);
        try {
            const data = await catalogService.getProducts();
            setProducts(data);
        } catch (err) {
            console.error('Error loading products', err);
        } finally {
            setLoading(false);
        }
    };

    const loadHierarchies = async () => {
        try {
            const [cats, fams, subfams] = await Promise.all([
                catalogService.getCategories(),
                catalogService.getFamilies(),
                catalogService.getSubfamilies()
            ]);
            setCategories(cats);
            setFamilies(fams);
            setSubfamilies(subfams);
        } catch (err) {
            console.error('Error loading hierarchies', err);
        }
    };

    useEffect(() => {
        loadProducts();
        loadHierarchies();
    }, []);

    const handleEditClick = (product: CatalogProduct) => {
        setEditingProduct(product);

        // Find the family and category for this product's subfamily
        const subfam = subfamilies.find(s => s.id === product.subfamily_id);
        const famId = subfam ? subfam.family_id : '';
        const fam = families.find(f => f.id === famId);
        const catId = fam ? fam.category_id : '';

        const initialForm = {
            base_name: product.base_name,
            sku: product.sku,
            presentation: product.presentation || '',
            brand: product.brand || '',
            features: product.features || '',
            min_stock: (product.min_stock === 0 ? '' : product.min_stock) as number | '',
            stock_alerts: product.stock_alerts || false,
            status: product.status || 'Activo',
            edit_reason: '',
            subfamily_id: product.subfamily_id,
            category_id: catId,
            family_id: famId,
            unit: product.unit || 'Unidad',
            sku_corto: product.sku_corto || '',
            is_service: product.is_service || false,
            has_associated_service: product.has_associated_service || false,
            associated_service_id: product.associated_service_id || '',
            service_pricing_type: product.service_pricing_type || 'MONEDA',
            service_pricing_value: (product.service_pricing_value === undefined ? '' : product.service_pricing_value) as number | ''
        };
        setEditForm(initialForm);
        setInitialEditForm(initialForm);
        setError(null);
    };

    const handleSave = async () => {
        if (!editingProduct) return;
        setSaving(true);
        setError(null);

        try {
            if (!editForm.subfamily_id) {
                throw new Error("La subfamilia es obligatoria.");
            }
            if (!editForm.base_name.trim()) {
                throw new Error("El nombre base es obligatorio.");
            }
            if (!editForm.presentation.trim()) {
                throw new Error("La presentación es obligatoria.");
            }
            if (editForm.stock_alerts && (!editForm.min_stock || editForm.min_stock <= 0)) {
                throw new Error("Debe ingresar un stock mínimo mayor a 0 si las alertas están activadas.");
            }
            if (editForm.sku_corto.trim() && !/^[a-zA-Z0-9]{3,4}$/.test(editForm.sku_corto.trim())) {
                throw new Error("El SKU Corto debe constar de 3 a 4 caracteres alfanuméricos.");
            }

            if (!editForm.edit_reason.trim()) {
                setError("ATENCIÓN: Debe ingresar un motivo de edición para guardar los cambios.");
                document.getElementById('edit_reason_input')?.focus();
                setSaving(false);
                return;
            }

            const currentSkuCorto = (editingProduct.sku_corto || '').trim().toUpperCase();
            const newSkuCorto = editForm.sku_corto.trim().toUpperCase();
            
            if (newSkuCorto !== currentSkuCorto) {
                setSkuWarningModal({
                    isOpen: true,
                    oldValue: currentSkuCorto,
                    newValue: newSkuCorto,
                    onConfirm: () => executeSaveProductTab(),
                    onCancel: () => { setSaving(false); }
                });
                return;
            }

            await executeSaveProductTab();
        } catch (err: any) {
            setError(err.message || 'Error al guardar');
            setSaving(false);
        }
    };

    const executeSaveProductTab = async () => {
        if (!editingProduct) return;
        setSaving(true);
        setError(null);

        try {
            const currentSkuCorto = (editingProduct.sku_corto || '').trim().toUpperCase();
            const newSkuCorto = editForm.sku_corto.trim().toUpperCase();

            let auditData = undefined;
            if (newSkuCorto !== currentSkuCorto) {
                const { data: { user } } = await supabase.auth.getUser();
                const userName = user?.user_metadata?.nombre || user?.email || 'Administrador';

                auditData = {
                    campo: 'sku_corto',
                    valor_anterior: currentSkuCorto || null,
                    valor_nuevo: newSkuCorto || null,
                    user_id: user?.id,
                    usuario_nombre: userName
                };
            }

            await catalogService.updateProduct(editingProduct.id, {
                base_name: editForm.base_name,
                presentation: editForm.presentation,
                brand: editForm.brand,
                features: editForm.features,
                min_stock: editForm.min_stock === '' ? 0 : editForm.min_stock,
                stock_alerts: editForm.stock_alerts,
                subfamily_id: editForm.subfamily_id,
                status: editForm.status,
                unit: editForm.unit,
                sku_corto: newSkuCorto || null,
                is_service: editForm.is_service,
                has_associated_service: !editForm.is_service && editForm.has_associated_service,
                associated_service_id: !editForm.is_service && editForm.has_associated_service && editForm.associated_service_id ? editForm.associated_service_id : null,
                service_pricing_type: !editForm.is_service && editForm.has_associated_service ? editForm.service_pricing_type : null,
                service_pricing_value: !editForm.is_service && editForm.has_associated_service ? (editForm.service_pricing_value === '' ? 0 : editForm.service_pricing_value) : null
            }, editForm.edit_reason, auditData);

            setEditingProduct(null);
            loadProducts();
        } catch (err: any) {
            let errorMsg = err.message || 'Error al actualizar el producto';
            if (errorMsg.includes('catalog_products_sku_corto_key')) {
                errorMsg = 'El SKU Corto ingresado ya existe en otro producto del catálogo. Debe ser único.';
            }
            setError(errorMsg);
        } finally {
            setSaving(false);
        }
    };

    // Filter available families based on selected category
    const availableFamilies = families.filter(f => f.category_id === editForm.category_id);
    const availableSubfamilies = subfamilies.filter(s => s.family_id === editForm.family_id);

    const isDirty = initialEditForm ? (
        editForm.base_name !== initialEditForm.base_name ||
        editForm.presentation !== initialEditForm.presentation ||
        editForm.brand !== initialEditForm.brand ||
        editForm.features !== initialEditForm.features ||
        editForm.min_stock !== initialEditForm.min_stock ||
        editForm.stock_alerts !== initialEditForm.stock_alerts ||
        editForm.status !== initialEditForm.status ||
        editForm.subfamily_id !== initialEditForm.subfamily_id ||
        editForm.unit !== initialEditForm.unit ||
        editForm.sku_corto !== initialEditForm.sku_corto ||
        editForm.is_service !== initialEditForm.is_service ||
        editForm.has_associated_service !== initialEditForm.has_associated_service ||
        editForm.associated_service_id !== initialEditForm.associated_service_id ||
        editForm.service_pricing_type !== initialEditForm.service_pricing_type ||
        editForm.service_pricing_value !== initialEditForm.service_pricing_value
    ) : false;

    const availableServices = products.filter(p => p.is_service && p.id !== editingProduct?.id);

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-sm">
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">SKU</th>
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Nombre Base</th>
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Jerarquía</th>
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Stock Min</th>
                                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400 w-24">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-400">Cargando productos...</td>
                                </tr>
                            ) : products.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-400">No hay productos en el catálogo.</td>
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
                                            <div className="text-xs text-slate-500">{product.presentation}</div>
                                        </td>
                                        <td className="p-4 text-xs text-slate-500">
                                            {product.product_subfamilies?.product_families?.product_categories?.name} &gt; {product.product_subfamilies?.product_families?.name} &gt; {product.product_subfamilies?.name}
                                        </td>
                                        <td className="p-4 text-sm font-medium text-slate-700 dark:text-slate-300">
                                            {product.min_stock}
                                        </td>
                                        <td className="p-4">
                                            <button
                                                onClick={() => handleEditClick(product)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                title="Editar Producto"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal / Slide-over */}
            {editingProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm pointer-events-auto mt-16">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform scale-100 transition-all pointer-events-auto flex flex-col max-h-[85vh]">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center">
                                <span className="material-symbols-outlined mr-2 text-blue-500">edit_square</span>
                                Editar Producto
                            </h3>
                            <button onClick={() => setEditingProduct(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-2">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-start">
                                    <span className="material-symbols-outlined mr-2 text-[20px]">error</span>
                                    {error}
                                </div>
                            )}

                            {/* Alerta SKU (ahora informativo) */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex gap-4 text-sm text-blue-800 dark:text-blue-300">
                                <span className="material-symbols-outlined shrink-0 text-blue-500 mt-0.5">info</span>
                                <div>
                                    <p className="font-bold mb-1">SKU Protegido</p>
                                    <p className="opacity-90">El SKU se ha bloqueado para su edición manual porque modifica referencias en presupuestos y el historial del inventario.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider">SKU Asignado</label>
                                    <span className="font-mono font-black text-xl text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                                        {editForm.sku}
                                    </span>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre Base *</label>
                                    <input
                                        type="text"
                                        required
                                        value={editForm.base_name}
                                        onChange={e => setEditForm(prev => ({ ...prev, base_name: e.target.value }))}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Presentación *</label>
                                    <input
                                        type="text"
                                        required
                                        value={editForm.presentation}
                                        onChange={e => setEditForm(prev => ({ ...prev, presentation: e.target.value }))}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Marca (Opcional)</label>
                                    <input
                                        type="text"
                                        value={editForm.brand}
                                        onChange={e => setEditForm(prev => ({ ...prev, brand: e.target.value }))}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white"
                                    />
                                </div>

                                <div className="md:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Color / Textura / Acabado (Opcional)</label>
                                    <input
                                        type="text"
                                        value={editForm.features}
                                        onChange={e => setEditForm(prev => ({ ...prev, features: e.target.value }))}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white"
                                    />
                                </div>

                                <div className="md:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Unidad de Medida *</label>
                                    <select
                                        required
                                        value={editForm.unit}
                                        onChange={e => setEditForm(prev => ({ ...prev, unit: e.target.value }))}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white"
                                    >
                                        <option value="Unidad">Unidad</option>
                                        <option value="Plancha">Plancha</option>
                                        <option value="Caja / Bolsa / Paquete">Caja / Bolsa / Paquete</option>
                                        <option value="Metro">Metro</option>
                                        <option value="Litro">Litro</option>
                                        <option value="Kilogramo">Kilogramo</option>
                                    </select>
                                </div>

                                <div className="md:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">SKU Corto (3-4 Alfanuméricos)</label>
                                    <input
                                        type="text"
                                        maxLength={4}
                                        value={editForm.sku_corto}
                                        onChange={e => setEditForm(prev => ({ ...prev, sku_corto: e.target.value.toUpperCase().slice(0, 4) }))}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white font-bold"
                                        placeholder="Ej. PM01 (Opcional)"
                                    />
                                </div>

                                <div className="md:col-span-1 flex items-center space-x-3 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <input
                                        type="checkbox"
                                        id="edit_is_service"
                                        checked={editForm.is_service}
                                        onChange={e => setEditForm(prev => ({ 
                                            ...prev, 
                                            is_service: e.target.checked,
                                            has_associated_service: e.target.checked ? false : prev.has_associated_service 
                                        }))}
                                        className="w-5 h-5 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-2 dark:bg-slate-700 dark:border-slate-600 cursor-pointer"
                                    />
                                    <label htmlFor="edit_is_service" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                                        ¿Es un servicio no inventariado?
                                    </label>
                                </div>
                            </div>

                            {/* Configuración de Servicio Asociado en Edición (Solo si no es servicio) */}
                            {!editForm.is_service && (
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                                    <div className="flex items-center space-x-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                        <input
                                            type="checkbox"
                                            id="edit_has_associated_service"
                                            checked={editForm.has_associated_service}
                                            onChange={e => setEditForm(prev => ({ ...prev, has_associated_service: e.target.checked }))}
                                            className="w-5 h-5 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-2 dark:bg-slate-700 dark:border-slate-600 cursor-pointer"
                                        />
                                        <label htmlFor="edit_has_associated_service" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                                            ¿Tiene un servicio asociado en catálogo? (Ej: Canto/Tapacanto)
                                        </label>
                                    </div>

                                    {editForm.has_associated_service && (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Servicio Asociado *</label>
                                                <select
                                                    required
                                                    value={editForm.associated_service_id}
                                                    onChange={e => setEditForm(prev => ({ ...prev, associated_service_id: e.target.value }))}
                                                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                                >
                                                    <option value="" disabled hidden>Selecciona un servicio...</option>
                                                    {availableServices.map(s => (
                                                        <option key={s.id} value={s.id}>
                                                            {s.sku_corto ? `[${s.sku_corto}] ` : ''}{s.base_name} ({s.unit || 'SERV'})
                                                        </option>
                                                    ))}
                                                </select>
                                                {editForm.associated_service_id && (
                                                    <p className="text-[10px] text-blue-600 mt-1 font-bold">
                                                        Unidad: {availableServices.find(s => s.id === editForm.associated_service_id)?.unit || 'SERV'}
                                                    </p>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tipo de Precio de Servicio *</label>
                                                <select
                                                    value={editForm.service_pricing_type}
                                                    onChange={e => setEditForm(prev => ({ ...prev, service_pricing_type: e.target.value as 'MONEDA' | 'PORCENTAJE' }))}
                                                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                                >
                                                    <option value="MONEDA">Monto Nominal (S/)</option>
                                                    <option value="PORCENTAJE">Porcentaje del Costo (%)</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                    Valor del Servicio ({editForm.service_pricing_type === 'MONEDA' ? 'S/' : '%'}) *
                                                </label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    required
                                                    min="0"
                                                    value={editForm.service_pricing_value}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setEditForm(prev => ({ ...prev, service_pricing_value: val === '' ? '' : parseFloat(val) }));
                                                    }}
                                                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 dark:text-white"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Nuevos campos: Motivo de edición y Estado */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                                <div className="md:col-span-2">
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4">Parámetros Adicionales</h4>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Motivo de Edición *</label>
                                    <textarea
                                        id="edit_reason_input"
                                        required
                                        rows={2}
                                        value={editForm.edit_reason}
                                        onChange={e => setEditForm(prev => ({ ...prev, edit_reason: e.target.value }))}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border-2 border-rose-300 dark:border-rose-500/50 rounded-xl focus:ring-4 focus:ring-rose-500/30 transition-all text-slate-900 dark:text-white resize-none shadow-[0_0_15px_rgba(225,29,72,0.2)] dark:shadow-[0_0_15px_rgba(225,29,72,0.4)]"
                                        placeholder="Ej. Corrección de nombre, Ajuste de presentación..."
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Obligatorio. Quedará registrado en el log de auditoría.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Estado del Producto</label>
                                    <select
                                        value={editForm.status}
                                        onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value as 'Activo' | 'Descontinuado' | 'Inactivo' }))}
                                        className={`w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white font-bold
                                            ${editForm.status === 'Activo' ? 'text-emerald-600 dark:text-emerald-400' :
                                                editForm.status === 'Descontinuado' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}
                                    >
                                        <option value="Activo">Activo (Compra/Venta Normal)</option>
                                        <option value="Descontinuado">Descontinuado (Solo Salidas)</option>
                                        <option value="Inactivo">Inactivo (Prohibido Comprar/Vender)</option>
                                    </select>
                                </div>
                                {editForm.status !== editingProduct.status && (editForm.status === 'Descontinuado' || editForm.status === 'Inactivo') && (
                                    <div className="md:col-span-2 mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start">
                                        <span className="material-symbols-outlined text-[16px] mr-2 shrink-0">warning</span>
                                        <p>
                                            <strong>Advertencia:</strong> Estás cambiando el estado a {editForm.status}. {editForm.status === 'Inactivo' ? 'El producto ya no podrá moverse en inventario.' : 'Solo se permitirán transacciones de salida.'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Inventario */}
                            <div className="p-5 border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div>
                                    <label className="block text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
                                        Stock Mínimo {editForm.stock_alerts ? '*' : '(Opcional)'}
                                    </label>
                                    <input
                                        type="number"
                                        min={editForm.stock_alerts ? "1" : "0"}
                                        required={editForm.stock_alerts}
                                        disabled={editForm.is_service}
                                        value={editForm.is_service ? 0 : editForm.min_stock}
                                        onKeyDown={(e) => {
                                            if (['e', 'E', '+', '-', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                                                e.preventDefault();
                                            }
                                        }}
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={e => {
                                            const val = e.target.value;
                                            const parsed = parseInt(val, 10);
                                            setEditForm(prev => ({ ...prev, min_stock: val === '' || isNaN(parsed) ? '' : parsed }));
                                        }}
                                        className="w-32 px-4 py-3 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl focus:ring-2 focus:ring-amber-500 transition-all text-slate-900 dark:text-white text-center font-bold disabled:opacity-50"
                                    />
                                </div>
                                <div className="flex items-center space-x-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-300 dark:border-amber-700 w-full md:w-auto mt-4 md:mt-0">
                                    <input
                                        type="checkbox"
                                        id="stock_alerts"
                                        disabled={editForm.is_service}
                                        checked={!editForm.is_service && editForm.stock_alerts}
                                        onChange={e => setEditForm(prev => ({ ...prev, stock_alerts: e.target.checked }))}
                                        className="w-5 h-5 text-amber-600 bg-slate-100 border-slate-300 rounded focus:ring-amber-500 dark:focus:ring-amber-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600 cursor-pointer disabled:opacity-50"
                                    />
                                    <label htmlFor="stock_alerts" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                                        Activar alertas de stock bajo
                                    </label>
                                </div>
                            </div>

                            {/* Jerarquía */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2">Ubicación en Jerarquía</h4>
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Categoría</label>
                                        <select
                                            value={editForm.category_id}
                                            onChange={e => {
                                                const catId = e.target.value;
                                                const newFams = families.filter(f => f.category_id === catId);
                                                const firstFamId = newFams.length > 0 ? newFams[0].id : '';
                                                const newSubfams = subfamilies.filter(s => s.family_id === firstFamId);
                                                const firstSubfamId = newSubfams.length > 0 ? newSubfams[0].id : '';

                                                setEditForm(prev => ({
                                                    ...prev,
                                                    category_id: catId,
                                                    family_id: firstFamId,
                                                    subfamily_id: firstSubfamId
                                                }));
                                            }}
                                            className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                        >
                                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Familia</label>
                                        <select
                                            value={editForm.family_id}
                                            onChange={e => {
                                                const famId = e.target.value;
                                                const newSubfams = subfamilies.filter(s => s.family_id === famId);
                                                const firstSubfamId = newSubfams.length > 0 ? newSubfams[0].id : '';

                                                setEditForm(prev => ({
                                                    ...prev,
                                                    family_id: famId,
                                                    subfamily_id: firstSubfamId
                                                }));
                                            }}
                                            disabled={!editForm.category_id}
                                            className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white disabled:opacity-50"
                                        >
                                            {availableFamilies.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Subfamilia</label>
                                        <select
                                            value={editForm.subfamily_id}
                                            onChange={e => setEditForm(prev => ({ ...prev, subfamily_id: e.target.value }))}
                                            disabled={!editForm.family_id}
                                            className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white disabled:opacity-50"
                                        >
                                            {availableSubfamilies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-3">
                            <button
                                onClick={() => setEditingProduct(null)}
                                className="px-6 py-3 font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !isDirty || !editForm.base_name || !editForm.presentation || !editForm.subfamily_id}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 flex items-center"
                            >
                                {saving ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {skuWarningModal && skuWarningModal.isOpen && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-backdrop mt-16">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 relative overflow-hidden animate-modal-panel">
                        <div className="absolute top-0 left-0 right-0 h-[3px] bg-amber-500" />
                        <div className="p-6 flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0 border border-amber-200 dark:border-amber-800">
                                <span className="material-symbols-outlined text-amber-600 dark:text-amber-500 text-[26px]">warning</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white leading-snug">ADVERTENCIA: Cambiar SKU Corto</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Registro de Seguridad</p>
                            </div>
                        </div>
                        
                        <div className="px-6 pb-6 flex flex-col gap-4">
                            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 rounded-xl text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
                                Estás modificando el SKU Corto de{' '}
                                <span className="font-mono font-black text-rose-600 dark:text-rose-400">"{skuWarningModal.oldValue || 'Ninguno'}"</span> a{' '}
                                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">"{skuWarningModal.newValue}"</span>.
                                <p className="mt-2 text-xs font-bold text-slate-400 dark:text-slate-500">Este cambio quedará registrado en una auditoría a nivel de usuario en el log de auditorías.</p>
                            </div>
                            
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        skuWarningModal.onCancel();
                                        setSkuWarningModal(null);
                                    }}
                                    className="px-5 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        skuWarningModal.onConfirm();
                                        setSkuWarningModal(null);
                                    }}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/20 transition-all"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
