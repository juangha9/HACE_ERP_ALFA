import { useState, useEffect, useMemo } from 'react';
import { catalogService } from '../../../services/catalogService';
import type { CatalogProduct } from '../../../services/catalogService';
import { AddProductModal } from './AddProductModal';
import { MassUploadModal } from './MassUploadModal';
import { exportToPDF, exportToExcel } from '../../../utils/exportUtils';

const PAGE_SIZE = 20;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Teclas no permitidas en celdas numéricas (notación científica, signos, operadores y flechas)
const BLOCKED_NUM_KEYS = ['e', 'E', '+', '-', 'x', 'X', '*', '/', 'ArrowUp', 'ArrowDown'];

// Campos editables en línea
interface EditDraft {
    sku_corto: string;
    base_name: string;
    textura_acabado: string;
    espesor: string;
    presentation: string;
    medidas_formato: string;
    brand: string;
    features: string;
    reference_cost: string;
    min_price: string;
    margen: string;
    min_stock: string;
}

const EDIT_FIELDS: { key: keyof EditDraft; label: string; type: 'text' | 'money' | 'percent' | 'number' }[] = [
    { key: 'sku_corto', label: 'SKU Corto', type: 'text' },
    { key: 'base_name', label: 'Nombre Base', type: 'text' },
    { key: 'textura_acabado', label: 'Textura / Acabado', type: 'text' },
    { key: 'espesor', label: 'Espesor', type: 'text' },
    { key: 'presentation', label: 'Presentación', type: 'text' },
    { key: 'medidas_formato', label: 'Medidas / Formato', type: 'text' },
    { key: 'brand', label: 'Marca', type: 'text' },
    { key: 'features', label: 'Features', type: 'text' },
    { key: 'reference_cost', label: 'Costo Ref', type: 'money' },
    { key: 'min_price', label: 'Precio Mín', type: 'money' },
    { key: 'margen', label: 'Margen', type: 'percent' },
    { key: 'min_stock', label: 'Stock Mín', type: 'number' },
];

const formatDiff = (type: string, raw: string) => {
    if (raw === '' || raw === null || raw === undefined) return '—';
    if (type === 'money') return `S/ ${Number(raw).toFixed(2)}`;
    if (type === 'percent') return `${Number(raw).toFixed(2)}%`;
    return raw;
};

export const CatalogPage = () => {
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isMassUploadModalOpen, setIsMassUploadModalOpen] = useState(false);

    // Búsqueda y filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [filterBrand, setFilterBrand] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterFamily, setFilterFamily] = useState('');
    const [filterSubfamily, setFilterSubfamily] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Edición en línea
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<EditDraft | null>(null);
    const [initialDraft, setInitialDraft] = useState<EditDraft | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

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

    // --- Opciones de filtros (en cascada Categoría → Familia → Subfamilia) ---
    const catOf = (p: CatalogProduct) => p.product_subfamilies?.product_families?.product_categories?.name || '';
    const famOf = (p: CatalogProduct) => p.product_subfamilies?.product_families?.name || '';
    const subfamOf = (p: CatalogProduct) => p.product_subfamilies?.name || '';

    const brandOptions = useMemo(() => {
        const set = new Set<string>();
        products.forEach(p => { if (p.brand) set.add(p.brand); });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [products]);

    const categoryOptions = useMemo(() => {
        const set = new Set<string>();
        products.forEach(p => { const c = catOf(p); if (c) set.add(c); });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [products]);

    const familyOptions = useMemo(() => {
        const set = new Set<string>();
        products.forEach(p => {
            if (famOf(p) && (!filterCategory || catOf(p) === filterCategory)) set.add(famOf(p));
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [products, filterCategory]);

    const subfamilyOptions = useMemo(() => {
        const set = new Set<string>();
        products.forEach(p => {
            if (subfamOf(p) && (!filterCategory || catOf(p) === filterCategory) && (!filterFamily || famOf(p) === filterFamily)) {
                set.add(subfamOf(p));
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [products, filterCategory, filterFamily]);

    // --- Productos filtrados ---
    const filteredProducts = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return products.filter(p => {
            if (filterBrand && p.brand !== filterBrand) return false;
            if (filterCategory && catOf(p) !== filterCategory) return false;
            if (filterFamily && famOf(p) !== filterFamily) return false;
            if (filterSubfamily && subfamOf(p) !== filterSubfamily) return false;

            if (term) {
                const haystack = [p.sku, p.sku_corto, p.base_name, p.textura_acabado, p.medidas_formato]
                    .map(v => (v || '').toString().toLowerCase());
                if (!haystack.some(h => h.includes(term))) return false;
            }
            return true;
        });
    }, [products, searchTerm, filterBrand, filterCategory, filterFamily, filterSubfamily]);

    // --- Paginación ---
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterBrand, filterCategory, filterFamily, filterSubfamily]);

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredProducts.slice(start, start + PAGE_SIZE);
    }, [filteredProducts, currentPage]);

    const getPageNumbers = (): (number | string)[] => {
        const delta = 2;
        const range: number[] = [];
        for (let i = Math.max(1, currentPage - delta); i <= Math.min(totalPages, currentPage + delta); i++) {
            range.push(i);
        }
        const pages: (number | string)[] = [];
        if (range[0] > 1) {
            pages.push(1);
            if (range[0] > 2) pages.push('…');
        }
        pages.push(...range);
        if (range[range.length - 1] < totalPages) {
            if (range[range.length - 1] < totalPages - 1) pages.push('…');
            pages.push(totalPages);
        }
        return pages;
    };

    const handleCategoryChange = (val: string) => {
        setFilterCategory(val);
        setFilterFamily('');
        setFilterSubfamily('');
    };
    const handleFamilyChange = (val: string) => {
        setFilterFamily(val);
        setFilterSubfamily('');
    };

    const hasActiveFilters = !!(searchTerm || filterBrand || filterCategory || filterFamily || filterSubfamily);
    const clearFilters = () => {
        setSearchTerm('');
        setFilterBrand('');
        setFilterCategory('');
        setFilterFamily('');
        setFilterSubfamily('');
    };

    // --- Edición en línea ---
    const startEdit = (p: CatalogProduct) => {
        const d: EditDraft = {
            sku_corto: p.sku_corto || '',
            base_name: p.base_name || '',
            textura_acabado: p.textura_acabado || '',
            espesor: p.espesor || '',
            presentation: p.presentation || '',
            medidas_formato: p.medidas_formato || '',
            brand: p.brand || '',
            features: p.features || '',
            reference_cost: p.reference_cost ? String(p.reference_cost) : '',
            min_price: p.min_price ? String(p.min_price) : '',
            margen: p.margen != null ? String(p.margen) : '',
            min_stock: p.min_stock != null ? String(p.min_stock) : '',
        };
        setEditingId(p.id);
        setDraft(d);
        setInitialDraft(d);
        setEditError(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setDraft(null);
        setInitialDraft(null);
        setConfirmOpen(false);
        setEditError(null);
    };

    const setField = (key: keyof EditDraft, value: string) => {
        setDraft(d => d ? { ...d, [key]: value } : d);
    };

    // Precio/Margen vinculados: anclados en el Costo de Referencia
    const onChangeRefCost = (v: string) => {
        setDraft(d => {
            if (!d) return d;
            const ref = parseFloat(v);
            const m = parseFloat(d.margen);
            let min_price = d.min_price;
            if (!isNaN(ref) && !isNaN(m)) min_price = String(round2(ref * (1 + m / 100)));
            return { ...d, reference_cost: v, min_price };
        });
    };
    const onChangeMargen = (v: string) => {
        setDraft(d => {
            if (!d) return d;
            const ref = parseFloat(d.reference_cost);
            const m = parseFloat(v);
            let min_price = d.min_price;
            if (!isNaN(ref) && !isNaN(m)) min_price = String(round2(ref * (1 + m / 100)));
            return { ...d, margen: v, min_price };
        });
    };
    const onChangeMinPrice = (v: string) => {
        setDraft(d => {
            if (!d) return d;
            const ref = parseFloat(d.reference_cost);
            const mp = parseFloat(v);
            let margen = d.margen;
            if (!isNaN(ref) && ref !== 0 && !isNaN(mp)) margen = String(round2((mp / ref - 1) * 100));
            return { ...d, min_price: v, margen };
        });
    };

    const isDirty = !!(initialDraft && draft && JSON.stringify(initialDraft) !== JSON.stringify(draft));

    const handleSaveClick = () => {
        if (!draft) return;
        if (!draft.base_name.trim()) { setEditError('El nombre base es obligatorio.'); return; }
        if (!draft.presentation.trim()) { setEditError('La presentación es obligatoria.'); return; }
        if (draft.sku_corto.trim() && !/^[a-zA-Z0-9]{3,4}$/.test(draft.sku_corto.trim())) {
            setEditError('El SKU Corto debe tener de 3 a 4 caracteres alfanuméricos.');
            return;
        }
        setEditError(null);
        setConfirmOpen(true);
    };

    const executeSave = async () => {
        if (!editingId || !draft || !initialDraft) return;
        setSavingEdit(true);
        try {
            // Campos modificados para la bitácora de auditoría (uno por cada cambio)
            const changes = EDIT_FIELDS
                .filter(f => initialDraft[f.key] !== draft[f.key])
                .map(f => ({
                    campo: f.key,
                    valor_anterior: initialDraft[f.key] === '' ? null : initialDraft[f.key],
                    valor_nuevo: draft[f.key] === '' ? null : draft[f.key],
                }));

            const updates: Partial<CatalogProduct> = {
                sku_corto: draft.sku_corto.trim() ? draft.sku_corto.trim().toUpperCase() : null,
                base_name: draft.base_name.trim(),
                textura_acabado: draft.textura_acabado.trim() || null,
                espesor: draft.espesor.trim() || null,
                presentation: draft.presentation.trim(),
                medidas_formato: draft.medidas_formato.trim() || null,
                brand: draft.brand.trim(),
                features: draft.features.trim(),
                reference_cost: draft.reference_cost === '' ? 0 : Number(draft.reference_cost),
                min_price: draft.min_price === '' ? 0 : Number(draft.min_price),
                margen: draft.margen === '' ? null : Number(draft.margen),
                min_stock: draft.min_stock === '' ? 0 : Number(draft.min_stock),
            };
            await catalogService.updateProduct(editingId, updates, 'Edición rápida en línea (Catálogo)');
            await catalogService.logCatalogChanges(editingId, changes, 'Edición rápida en línea (Catálogo)');
            cancelEdit();
            await fetchProducts();
        } catch (err: any) {
            let msg = err.message || 'Error al guardar';
            if (msg.includes('catalog_products_sku_corto_key')) msg = 'El SKU Corto ingresado ya existe en otro producto. Debe ser único.';
            setEditError(msg);
            setConfirmOpen(false);
        } finally {
            setSavingEdit(false);
        }
    };

    const handleExportPDF = () => {
        const columns = ["SKU", "SKU Corto", "Nombre Base", "Textura/Acabado", "Espesor", "Presentación", "Medidas/Formato", "Marca", "Features", "Costo Ref", "Precio Mín", "Margen", "Categoría", "Stock Min"];
        const data = filteredProducts.map(p => {
            const ruta = [
                p.product_subfamilies?.product_families?.product_categories?.name,
                p.product_subfamilies?.product_families?.name,
                p.product_subfamilies?.name
            ].filter(Boolean).join(' > ');
            return [
                p.sku || '',
                p.sku_corto || '',
                p.base_name || '',
                p.textura_acabado || '',
                p.espesor || '',
                p.presentation || '',
                p.medidas_formato || '',
                p.brand || '',
                p.features || '',
                (p.reference_cost ?? 0).toFixed(2),
                (p.min_price ?? 0).toFixed(2),
                p.margen != null ? Number(p.margen).toFixed(2) : '',
                ruta,
                (p.min_stock ?? 0).toString()
            ];
        });
        exportToPDF("Catálogo de Productos", columns, data, "Catalogo_Productos");
    };

    const handleExportExcel = () => {
        const data = filteredProducts.map(p => ({
            SKU: p.sku,
            SKU_Corto: p.sku_corto,
            Nombre: p.base_name,
            Textura_Acabado: p.textura_acabado,
            Espesor: p.espesor,
            Presentación: p.presentation,
            Medidas_Formato: p.medidas_formato,
            Categoría: p.product_subfamilies?.product_families?.product_categories?.name,
            Subfamilia: p.product_subfamilies?.name,
            Marca: p.brand,
            Características: p.features,
            Costo_Referencia: p.reference_cost,
            Precio_Minimo: p.min_price,
            Margen: p.margen,
            Stock_Minimo: p.min_stock
        }));
        exportToExcel(data, "Catalogo_Productos");
    };

    const selectClass = "px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[150px]";
    const inpCls = "w-full min-w-[90px] bg-white dark:bg-slate-950 border border-blue-300 dark:border-blue-600 rounded px-1.5 py-1 text-xs text-slate-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none";
    const numCls = "w-full min-w-[70px] bg-white dark:bg-slate-950 border border-blue-300 dark:border-blue-600 rounded px-1.5 py-1 text-xs text-right text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-1 focus:ring-blue-500 outline-none";

    return (
        <div className="h-full flex flex-col min-h-0">
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 mb-6">
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

            {/* Barra de búsqueda y filtros (deshabilitada mientras se edita una fila) */}
            <div className={`shrink-0 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 mb-4 flex flex-wrap items-center gap-3 ${editingId ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="relative flex-1 min-w-[260px]">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] pointer-events-none">search</span>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Buscar por SKU, SKU corto, nombre base, textura/acabado o medidas/formato..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                </div>

                <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className={selectClass}>
                    <option value="">Todas las marcas</option>
                    {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
                </select>

                <select value={filterCategory} onChange={e => handleCategoryChange(e.target.value)} className={selectClass}>
                    <option value="">Todas las categorías</option>
                    {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <select value={filterFamily} onChange={e => handleFamilyChange(e.target.value)} className={selectClass}>
                    <option value="">Todas las familias</option>
                    {familyOptions.map(f => <option key={f} value={f}>{f}</option>)}
                </select>

                <select value={filterSubfamily} onChange={e => setFilterSubfamily(e.target.value)} className={selectClass}>
                    <option value="">Todas las subfamilias</option>
                    {subfamilyOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 px-3 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                        Limpiar
                    </button>
                )}
            </div>

            {/* Aviso de error de edición */}
            {editError && (
                <div className="shrink-0 mb-4 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-sm font-medium flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    {editError}
                </div>
            )}

            <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="flex-1 min-h-0 overflow-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="text-slate-600 dark:text-slate-300">
                                <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 px-2 py-2 border border-slate-200 dark:border-slate-700 w-12"></th>
                                {['SKU', 'SKU Corto', 'Nombre Base', 'Textura / Acabado', 'Espesor', 'Presentación', 'Medidas / Formato', 'Marca', 'Features', 'Costo Ref', 'Precio Mín', 'Margen', 'Categoría', 'Stock Min'].map((h) => (
                                    <th key={h} className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 px-3 py-2 font-bold uppercase tracking-wide text-[10px] whitespace-nowrap border border-slate-200 dark:border-slate-700">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={15} className="p-8 text-center text-slate-500 dark:text-slate-400">Cargando catálogo...</td>
                                </tr>
                            ) : products.length === 0 ? (
                                <tr>
                                    <td colSpan={15} className="p-8 text-center text-slate-500 dark:text-slate-400">No hay productos en el catálogo. Usa "Nuevo Producto" para añadir uno.</td>
                                </tr>
                            ) : filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={15} className="p-8 text-center text-slate-500 dark:text-slate-400">No se encontraron productos con los filtros aplicados.</td>
                                </tr>
                            ) : (
                                paginatedProducts.map((product) => {
                                    const cat = product.product_subfamilies?.product_families?.product_categories?.name;
                                    const fam = product.product_subfamilies?.product_families?.name;
                                    const subfam = product.product_subfamilies?.name;
                                    const ruta = [cat, fam, subfam].filter(Boolean).join(' › ');
                                    const dash = <span className="text-slate-300 dark:text-slate-600">—</span>;
                                    const isEditingRow = editingId === product.id;
                                    const dimmed = editingId !== null && !isEditingRow;

                                    const base = "transition-all [&>td]:border [&>td]:px-3 [&>td]:py-1.5 [&>td]:whitespace-nowrap";
                                    const stateClass = isEditingRow
                                        ? "relative z-10 bg-blue-100 dark:bg-blue-900/50 shadow-[0_0_0_2px_rgba(59,130,246,0.6)] [&>td]:border-blue-300 dark:[&>td]:border-blue-700"
                                        : dimmed
                                            ? "opacity-25 pointer-events-none odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800/30 [&>td]:border-slate-200 dark:[&>td]:border-slate-800"
                                            : "odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800/30 hover:bg-blue-50 dark:hover:bg-blue-900/20 [&>td]:border-slate-200 dark:[&>td]:border-slate-800";

                                    return (
                                        <tr
                                            key={product.id}
                                            className={`${base} ${stateClass}`}
                                        >
                                            {/* Acción: lápiz (o guardar/cancelar) a la izquierda */}
                                            <td className="text-center">
                                                {isEditingRow ? (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={handleSaveClick}
                                                            disabled={!isDirty}
                                                            title={isDirty ? 'Guardar cambios' : 'Sin cambios'}
                                                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">save</span>
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            title="Cancelar"
                                                            className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => startEdit(product)}
                                                        title="Editar producto"
                                                        className="flex items-center justify-center w-7 h-7 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors mx-auto"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">edit</span>
                                                    </button>
                                                )}
                                            </td>
                                            <td className="font-mono font-bold text-blue-700 dark:text-blue-300">{product.sku || dash}</td>

                                            {/* SKU Corto */}
                                            <td className="font-mono text-slate-700 dark:text-slate-300">
                                                {isEditingRow
                                                    ? <input className={inpCls} maxLength={4} value={draft!.sku_corto} onChange={e => setField('sku_corto', e.target.value.toUpperCase().slice(0, 4))} placeholder="—" />
                                                    : (product.sku_corto || dash)}
                                            </td>

                                            {/* Nombre Base */}
                                            <td className="font-semibold text-slate-900 dark:text-white">
                                                {isEditingRow
                                                    ? <input className={inpCls} value={draft!.base_name} onChange={e => setField('base_name', e.target.value)} />
                                                    : (product.base_name || dash)}
                                            </td>

                                            {/* Textura / Acabado */}
                                            <td className="text-slate-600 dark:text-slate-400">
                                                {isEditingRow
                                                    ? <input className={inpCls} value={draft!.textura_acabado} onChange={e => setField('textura_acabado', e.target.value)} placeholder="—" />
                                                    : (product.textura_acabado || dash)}
                                            </td>

                                            {/* Espesor */}
                                            <td className="text-slate-600 dark:text-slate-400">
                                                {isEditingRow
                                                    ? <input className={inpCls} value={draft!.espesor} onChange={e => setField('espesor', e.target.value)} placeholder="—" />
                                                    : (product.espesor || dash)}
                                            </td>

                                            {/* Presentación */}
                                            <td className="text-slate-600 dark:text-slate-400">
                                                {isEditingRow
                                                    ? <input className={inpCls} value={draft!.presentation} onChange={e => setField('presentation', e.target.value)} />
                                                    : (product.presentation || dash)}
                                            </td>

                                            {/* Medidas / Formato */}
                                            <td className="text-slate-600 dark:text-slate-400">
                                                {isEditingRow
                                                    ? <input className={inpCls} value={draft!.medidas_formato} onChange={e => setField('medidas_formato', e.target.value)} placeholder="—" />
                                                    : (product.medidas_formato || dash)}
                                            </td>

                                            {/* Marca */}
                                            <td className="text-slate-600 dark:text-slate-400">
                                                {isEditingRow
                                                    ? <input className={inpCls} value={draft!.brand} onChange={e => setField('brand', e.target.value)} placeholder="—" />
                                                    : (product.brand || dash)}
                                            </td>

                                            {/* Features */}
                                            <td className="text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={product.features || ''}>
                                                {isEditingRow
                                                    ? <input className={inpCls} value={draft!.features} onChange={e => setField('features', e.target.value)} placeholder="—" />
                                                    : (product.features || dash)}
                                            </td>

                                            {/* Costo Ref */}
                                            <td className="text-right font-mono text-slate-600 dark:text-slate-400">
                                                {isEditingRow
                                                    ? <input type="number" step="any" inputMode="decimal" className={numCls} value={draft!.reference_cost} onChange={e => onChangeRefCost(e.target.value)} onKeyDown={e => { if (BLOCKED_NUM_KEYS.includes(e.key)) e.preventDefault(); }} onWheel={e => e.currentTarget.blur()} placeholder="0" />
                                                    : (product.reference_cost ? `S/ ${Number(product.reference_cost).toFixed(2)}` : dash)}
                                            </td>

                                            {/* Precio Mín */}
                                            <td className="text-right font-mono text-slate-600 dark:text-slate-400">
                                                {isEditingRow
                                                    ? <input type="number" step="any" inputMode="decimal" className={numCls} value={draft!.min_price} onChange={e => onChangeMinPrice(e.target.value)} onKeyDown={e => { if (BLOCKED_NUM_KEYS.includes(e.key)) e.preventDefault(); }} onWheel={e => e.currentTarget.blur()} placeholder="0" />
                                                    : (product.min_price ? `S/ ${Number(product.min_price).toFixed(2)}` : dash)}
                                            </td>

                                            {/* Margen */}
                                            <td className="text-right font-mono text-slate-600 dark:text-slate-400">
                                                {isEditingRow
                                                    ? <input type="number" step="any" inputMode="decimal" className={numCls} value={draft!.margen} onChange={e => onChangeMargen(e.target.value)} onKeyDown={e => { if (BLOCKED_NUM_KEYS.includes(e.key)) e.preventDefault(); }} onWheel={e => e.currentTarget.blur()} placeholder="—" />
                                                    : (product.margen != null ? `${Number(product.margen).toFixed(2)}%` : dash)}
                                            </td>

                                            {/* Categoría (no editable en línea) */}
                                            <td className="text-slate-500 dark:text-slate-400" title={ruta}>{ruta || dash}</td>

                                            {/* Stock Min */}
                                            <td className="text-right font-medium text-slate-700 dark:text-slate-300">
                                                {isEditingRow
                                                    ? <input type="number" step="1" min="0" inputMode="numeric" className={numCls} value={draft!.min_stock} onChange={e => setField('min_stock', e.target.value)} onKeyDown={e => { if (BLOCKED_NUM_KEYS.includes(e.key) || e.key === '.') e.preventDefault(); }} onWheel={e => e.currentTarget.blur()} placeholder="0" />
                                                    : <>{product.min_stock}{product.stock_alerts && <span className="ml-1 text-red-500" title="Alertas Activadas">⚠</span>}</>}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pie de paginación (deshabilitado mientras se edita) */}
                {!loading && filteredProducts.length > 0 && (
                    <div className={`shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 text-xs ${editingId ? 'opacity-50 pointer-events-none' : ''}`}>
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                            Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} de {filteredProducts.length} productos
                        </span>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    title="Anterior"
                                >
                                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                                </button>
                                {getPageNumbers().map((pg, idx) => (
                                    typeof pg === 'string' ? (
                                        <span key={`e${idx}`} className="px-1 text-slate-400">…</span>
                                    ) : (
                                        <button
                                            key={pg}
                                            onClick={() => setCurrentPage(pg)}
                                            className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-colors ${pg === currentPage
                                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                                                : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                                                }`}
                                        >
                                            {pg}
                                        </button>
                                    )
                                ))}
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    title="Siguiente"
                                >
                                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Popup de confirmación con tabla Antes / Después */}
            {confirmOpen && draft && initialDraft && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50">
                            <span className="material-symbols-outlined text-blue-500">fact_check</span>
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">Confirmar cambios</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Revisa el antes y después antes de guardar.</p>
                            </div>
                        </div>

                        <div className="p-5 overflow-y-auto">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                        <th className="text-left py-2 px-2">Campo</th>
                                        <th className="text-left py-2 px-2">Antes</th>
                                        <th className="text-left py-2 px-2">Después</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {EDIT_FIELDS.map(f => {
                                        const before = initialDraft[f.key];
                                        const after = draft[f.key];
                                        const changed = before !== after;
                                        return (
                                            <tr key={f.key} className="border-b border-slate-100 dark:border-slate-800">
                                                <td className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{f.label}</td>
                                                <td className={`py-2 px-2 ${changed ? 'text-rose-600 dark:text-rose-400 line-through' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    {formatDiff(f.type, before)}
                                                </td>
                                                <td className="py-2 px-2">
                                                    {changed
                                                        ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatDiff(f.type, after)}</span>
                                                        : <span className="text-slate-400 dark:text-slate-500 italic">Sin cambios</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
                            <button
                                onClick={() => setConfirmOpen(false)}
                                disabled={savingEdit}
                                className="px-5 py-2.5 font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
                            >
                                Volver a editar
                            </button>
                            <button
                                onClick={executeSave}
                                disabled={savingEdit}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
                            >
                                {savingEdit && (
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                )}
                                {savingEdit ? 'Guardando...' : 'Confirmar y Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
