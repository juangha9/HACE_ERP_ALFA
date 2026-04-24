import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import type { InventoryMovement, InventoryProduct, Contact, Project } from '../../services/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface OutProductRow {
    id: string; // random id for UI
    product_id: string;
    quantity: number | '';
}

// Searchable Combobox Component for Products
const SearchableProductSelect = ({
    products,
    value,
    onChange,
    placeholder,
    className
}: {
    products: InventoryProduct[];
    value: string;
    onChange: (id: string) => void;
    placeholder: string;
    className?: string;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Initial load or value change externally
    useEffect(() => {
        if (value) {
            const prod = products.find(p => p.id === value);
            if (prod) setSearchTerm(`${prod.sku} - ${prod.name}`);
        } else {
            setSearchTerm('');
        }
    }, [value, products]);

    // Handle outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // On close without selection, revert search term to current selected value
                if (value) {
                    const prod = products.find(p => p.id === value);
                    if (prod) setSearchTerm(`${prod.sku} - ${prod.name}`);
                } else {
                    setSearchTerm('');
                }
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef, value, products]);

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const highlightMatch = (text: string) => {
        if (!searchTerm) return <>{text}</>; // Return as a fragment to match the return type of <span>
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const parts = text.split(regex);
        return (
            <span>
                {parts.map((part, i) =>
                    regex.test(part) ? (
                        <span key={i} className="bg-yellow-200 dark:bg-yellow-500/30 font-black text-slate-900 dark:text-yellow-200 rounded-sm">{part}</span>
                    ) : (
                        <span key={i}>{part}</span>
                    )
                )}
            </span>
        );
    };

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <input
                type="text"
                placeholder={placeholder}
                className={className || "w-full p-3.5 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-rose-500 outline-none transition-all"}
                value={searchTerm}
                onClick={() => setIsOpen(true)}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsOpen(true);
                    if (e.target.value === '') onChange(''); // Clear selection if user clears input
                }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">
                {isOpen ? 'arrow_drop_up' : 'search'}
            </span>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 dark:text-slate-400 italic text-center">No se encontraron productos</div>
                    ) : (
                        filteredProducts.map(p => (
                            <div
                                key={p.id}
                                className={`p-3 border-b border-slate-50 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors ${value === p.id ? 'bg-rose-50/50 dark:bg-rose-900/30' : ''}`}
                                onClick={() => {
                                    onChange(p.id);
                                    setSearchTerm(`${p.sku} - ${p.name}`);
                                    setIsOpen(false);
                                }}
                            >
                                <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">{highlightMatch(p.name)}</div>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">{highlightMatch(p.sku)}</span>
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Stock: {p.stock_current} {p.unit}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default function InventoryMovements() {
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [products, setProducts] = useState<InventoryProduct[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionSuccess, setActionSuccess] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Filtering State
    const [filters, setFilters] = useState({
        date: '',
        type: '',
        product: '',
        contact: '',
        invoice: ''
    });
    const [showFilter, setShowFilter] = useState<string | null>(null);

    // Form State
    const [mode, setMode] = useState<'IN' | 'OUT'>('IN');

    // Entrada State
    const [inData, setInData] = useState({
        type: 'IN_PURCHASE' as InventoryMovement['type'],
        date: new Date().toISOString().split('T')[0],
        destination: '',
        product_id: '',
        quantity: '' as number | '', // Permite vacío sin forzar a 0
        unit_cost: '' as number | '',
        contact_id: '',
        invoice_number: '',
        observations: ''
    });

    // Salida State
    const [outData, setOutData] = useState({
        type: 'OUT_PROJECT_CONSUMPTION' as InventoryMovement['type'],
        date: new Date().toISOString().split('T')[0],
        project_id: '',
        contact_id: '', // Responsable
        invoice_number: '', // N° OT
        observations: ''
    });

    const [outProducts, setOutProducts] = useState<OutProductRow[]>([]);
    const [selectedOutProductId, setSelectedOutProductId] = useState('');
    const [selectedOutProductQty, setSelectedOutProductQty] = useState<number | ''>(1);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [movs, prods, conts, projs] = await Promise.all([
                api.getInventoryMovements(500), // Get more for tool loan checks
                api.getInventoryProducts(),
                api.getContacts(),
                api.getProjects()
            ]);
            setMovements(movs);
            setProducts(prods);
            setContacts(conts);
            setProjects(projs);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const resetForms = () => {
        setInData({
            type: 'IN_PURCHASE',
            date: new Date().toISOString().split('T')[0],
            destination: '',
            product_id: '',
            quantity: '',
            unit_cost: '',
            contact_id: '',
            invoice_number: '',
            observations: ''
        });
        setOutData({
            type: 'OUT_PROJECT_CONSUMPTION',
            date: new Date().toISOString().split('T')[0],
            project_id: '',
            contact_id: '',
            invoice_number: '',
            observations: ''
        });
        setOutProducts([]);
        setSelectedOutProductId('');
        setSelectedOutProductQty(1);
        setActionError(null);
    };

    // Prevent invalid characters in number inputs
    const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (['e', 'E', '+', '-', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
        }
    };

    // Enviar Entrada
    const handleInSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionError(null);
        setActionSuccess(null);

        // Validaciones especiales
        if (inData.type === 'IN_OTHER' && !inData.observations.trim()) {
            setActionError('Las observaciones son obligatorias para el tipo OTROS.');
            return;
        }

        if (inData.type === 'IN_PURCHASE') {
            if (!inData.unit_cost || !inData.contact_id || !inData.invoice_number) {
                setActionError('Costo Unitario, Proveedor y N° de Factura son obligatorios para una Compra.');
                return;
            }
        }

        if (!inData.product_id || !inData.quantity || inData.quantity <= 0) {
            setActionError('Asegúrese de seleccionar un producto y una cantidad mayor a 0.');
            return;
        }

        setIsSaving(true);
        try {
            await api.saveInventoryMovement({
                type: inData.type,
                date: inData.date,
                product_id: inData.product_id,
                quantity: inData.quantity,
                unit_cost: inData.type === 'IN_PURCHASE' ? inData.unit_cost : undefined,
                contact_id: inData.contact_id || undefined,
                invoice_number: inData.invoice_number || undefined,
                observations: [inData.destination ? `Destino: ${inData.destination}` : '', inData.observations].filter(Boolean).join(' | ')
            });

            await loadData();
            resetForms();
            setActionSuccess('Movimiento de ENTRADA registrado correctamente.');
            setTimeout(() => {
                setIsModalOpen(false);
                setActionSuccess(null);
            }, 2000);
        } catch (error: any) {
            setActionError(error.message || 'Error al guardar la entrada');
        } finally {
            setIsSaving(false);
        }
    };

    // Enviar Salida (Multi-producto)
    const handleOutSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionError(null);
        setActionSuccess(null);

        if (outData.type === 'OUT_OTHER' && !outData.observations.trim()) {
            setActionError('Las observaciones son obligatorias para el tipo OTROS.');
            return;
        }

        if (outProducts.length === 0) {
            setActionError('Debe añadir al menos un producto a la lista de salida.');
            return;
        }

        for (const row of outProducts) {
            if (!row.quantity || row.quantity <= 0) {
                setActionError('Todos los productos deben tener una cantidad mayor a 0.');
                return;
            }
            const prod = products.find(p => p.id === row.product_id);
            if (prod && (prod.stock_current - (row.quantity as number)) < 0) {
                setActionError(`El producto ${prod.name} generaría un stock negativo. Modifica la cantidad.`);
                return;
            }
        }

        setIsSaving(true);
        try {
            // Guardar todos los movimientos de salida secuencial o en paralelo
            await Promise.all(outProducts.map(row => {
                const prod = products.find(p => p.id === row.product_id);
                return api.saveInventoryMovement({
                    type: outData.type,
                    date: outData.date,
                    product_id: row.product_id,
                    quantity: row.quantity as number, // Es salida, pero se guarda como num positivo según schema
                    unit_cost: (prod?.average_cost && prod.average_cost > 0) ? prod.average_cost : undefined,
                    project_id: outData.project_id || undefined,
                    contact_id: outData.contact_id || undefined,
                    invoice_number: outData.invoice_number || undefined,
                    observations: outData.observations || undefined
                });
            }));

            await loadData();
            resetForms();
            setActionSuccess(`Se registraron ${outProducts.length} movimientos de SALIDA correctamente.`);
            setTimeout(() => {
                setIsModalOpen(false);
                setActionSuccess(null);
            }, 2000);
        } catch (error: any) {
            setActionError(error.message || 'Error al procesar las salidas');
        } finally {
            setIsSaving(false);
        }
    };

    // Herramientas prestadas
    const getPendingToolsCount = (contactId: string) => {
        let count = 0;
        movements.forEach(m => {
            if (m.contact_id === contactId) {
                if (m.type === 'OUT_TOOL_LOAN') count += m.quantity;
                if (m.type === 'IN_TOOL_RETURN') count -= m.quantity;
            }
        });
        return Math.max(0, count);
    };

    const pendingToolsCount = (mode === 'OUT' && outData.type === 'OUT_TOOL_LOAN' && outData.contact_id)
        ? getPendingToolsCount(outData.contact_id) : 0;

    // Agregar producto a tabla de salida
    const addOutProduct = () => {
        if (!selectedOutProductId) return;
        if (!selectedOutProductQty || selectedOutProductQty <= 0) {
            setActionError('Debe ingresar una cantidad válida mayor a 0 para añadir el producto.');
            return;
        }

        const prod = products.find(p => p.id === selectedOutProductId);
        if (prod && selectedOutProductQty > prod.stock_current) {
            setActionError(`No puede añadir ${selectedOutProductQty} unidades. El stock actual de ${prod.name} es solo de ${prod.stock_current} unidades.`);
            return;
        }

        if (outProducts.find(p => p.product_id === selectedOutProductId)) {
            setActionError('El producto ya está en la lista de salida.');
            return;
        }

        setOutProducts([...outProducts, { id: Date.now().toString(), product_id: selectedOutProductId, quantity: selectedOutProductQty }]);
        setSelectedOutProductId('');
        setSelectedOutProductQty(1);
        setActionError(null);
    };

    // Check global stock negativity
    const isOutSaveDisabled = isSaving || outProducts.some(r => {
        const prod = products.find(p => p.id === r.product_id);
        const qty = Number(r.quantity) || 0;
        return !prod || (prod.stock_current - qty < 0);
    });

    // Advanced Filtering Logic
    const filteredMovements = movements.filter(m => {
        const matchesDate = !filters.date || m.date.includes(filters.date);
        const matchesType = !filters.type || m.type === filters.type;
        const matchesProduct = !filters.product || 
            (m.product?.name.toLowerCase().includes(filters.product.toLowerCase()) || 
             m.product?.sku.toLowerCase().includes(filters.product.toLowerCase()));
        const matchesContact = !filters.contact || 
            (m.contact?.name.toLowerCase().includes(filters.contact.toLowerCase()));
        const matchesInvoice = !filters.invoice || 
            (m.invoice_number?.toLowerCase().includes(filters.invoice.toLowerCase()));

        return matchesDate && matchesType && matchesProduct && matchesContact && matchesInvoice;
    });

    const exportToPDF = () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        
        // Header
        doc.setFontSize(20);
        doc.text('Reporte de Movimientos de Inventario', 14, 22);
        doc.setFontSize(10);
        doc.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);

        const tableData = filteredMovements.map(m => [
            format(new Date(m.date), 'dd/MM/yyyy'),
            getTypeLabel(m.type),
            m.product?.sku || '-',
            m.product?.name || '-',
            m.type.startsWith('OUT') ? `-${m.quantity}` : `+${m.quantity}`,
            m.contact?.name || '-',
            m.invoice_number || '-',
            m.observations || '-'
        ]);

        autoTable(doc, {
            startY: 35,
            head: [['Fecha', 'Tipo', 'SKU', 'Producto', 'Cant.', 'Contacto', 'Ref.', 'Obs.']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [79, 70, 229] }, // Indigo-600
        });

        doc.save(`Kardex_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };

    const exportToExcel = () => {
        const worksheet = XLSX.utils.json_to_sheet(filteredMovements.map(m => ({
            Fecha: format(new Date(m.date), 'dd/MM/yyyy'),
            Tipo: getTypeLabel(m.type),
            SKU: m.product?.sku,
            Producto: m.product?.name,
            Cantidad: m.type.startsWith('OUT') ? -m.quantity : m.quantity,
            Contacto: m.contact?.name || '-',
            Referencia: m.invoice_number || '-',
            Observaciones: m.observations || '-'
        })));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Movimientos");
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
        saveAs(data, `Kardex_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    const FilterPopver = ({ column }: { column: keyof typeof filters }) => {
        if (showFilter !== column) return null;
        
        return (
            <div 
                className="absolute top-full left-0 mt-2 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 min-w-[200px]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="space-y-3">
                    {column === 'type' ? (
                        <select 
                            className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
                            value={filters[column]}
                            onChange={e => setFilters({...filters, [column]: e.target.value})}
                        >
                            <option value="">Todos los tipos</option>
                            {Array.from(new Set(movements.map(m => m.type))).map(t => (
                                <option key={t} value={t} className="bg-white dark:bg-slate-900">{getTypeLabel(t)}</option>
                            ))}
                        </select>
                    ) : (
                        <input 
                            type={column === 'date' ? 'date' : 'text'}
                            className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
                            placeholder="Filtrar..."
                            value={filters[column]}
                            onChange={e => setFilters({...filters, [column]: e.target.value})}
                            autoFocus
                        />
                    )}
                    <button 
                        onClick={() => { setFilters({...filters, [column]: ''}); setShowFilter(null); }}
                        className="text-[10px] text-rose-500 font-bold uppercase hover:underline"
                    >
                        Limpiar
                    </button>
                </div>
            </div>
        );
    };

    const getRowColor = (type: string) => {
        if (type.startsWith('IN_')) return 'bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30';
        return 'bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100/50 dark:hover:bg-rose-900/30';
    };

    const getTypeLabel = (type: string) => {
        const map: Record<string, string> = {
            'IN_PURCHASE': 'Compra',
            'IN_RETURN': 'Devolución',
            'IN_RETURN_CLIENT': 'Dev. Cliente',
            'IN_ADJUSTMENT': 'Ajuste (+)',
            'IN_TOOL_RETURN': 'Retorno Herram.',
            'IN_PROJECT_LEFTOVER': 'Sobras Proyecto',
            'IN_OTHER': 'Otros (Entrada)',
            'OUT_SALE': 'Venta',
            'OUT_PROJECT': 'Proyecto',
            'OUT_PROJECT_CONSUMPTION': 'Consumo Obra',
            'OUT_TOOL_LOAN': 'Préstamo Herram.',
            'OUT_LOSS': 'Merma',
            'OUT_ADJUSTMENT': 'Ajuste (-)',
            'OUT_OTHER': 'Otros (Salida)'
        };
        return map[type] || type;
    };

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Kardex / Movimientos</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Historial de entradas y salidas</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                        <button
                            onClick={exportToExcel}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-lg text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 transition-all"
                        >
                            <span className="material-symbols-outlined text-lg">description</span>
                            Excel
                        </button>
                        <button
                            onClick={exportToPDF}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-lg text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400 transition-all border-l border-slate-200 dark:border-slate-700"
                        >
                            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                            PDF
                        </button>
                    </div>
                    <button
                        onClick={() => { resetForms(); setIsModalOpen(true); }}
                        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                    >
                        <span className="material-symbols-outlined text-lg">swap_vert</span>
                        Nuevo Movimiento
                    </button>
                </div>
            </header>

            <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                        <tr>
                            <th className="px-6 py-4 relative group cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50" onClick={() => setShowFilter(showFilter === 'date' ? null : 'date')}>
                                <div className="flex items-center gap-1">
                                    Fecha
                                    <span className={`material-symbols-outlined text-sm ${filters.date ? 'text-indigo-600' : 'text-slate-300 dark:text-slate-600'}`}>filter_alt</span>
                                </div>
                                <FilterPopver column="date" />
                            </th>
                            <th className="px-6 py-4 relative group cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50" onClick={() => setShowFilter(showFilter === 'type' ? null : 'type')}>
                                <div className="flex items-center gap-1">
                                    Tipo
                                    <span className={`material-symbols-outlined text-sm ${filters.type ? 'text-indigo-600' : 'text-slate-300 dark:text-slate-600'}`}>filter_alt</span>
                                </div>
                                <FilterPopver column="type" />
                            </th>
                            <th className="px-6 py-4 relative group cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50" onClick={() => setShowFilter(showFilter === 'product' ? null : 'product')}>
                                <div className="flex items-center gap-1">
                                    Producto
                                    <span className={`material-symbols-outlined text-sm ${filters.product ? 'text-indigo-600' : 'text-slate-300 dark:text-slate-600'}`}>filter_alt</span>
                                </div>
                                <FilterPopver column="product" />
                            </th>
                            <th className="px-6 py-4">Cantidad</th>
                            <th className="px-6 py-4 relative group cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50" onClick={() => setShowFilter(showFilter === 'contact' ? null : 'contact')}>
                                <div className="flex items-center gap-1">
                                    Detalle / Contacto
                                    <span className={`material-symbols-outlined text-sm ${filters.contact ? 'text-indigo-600' : 'text-slate-300 dark:text-slate-600'}`}>filter_alt</span>
                                </div>
                                <FilterPopver column="contact" />
                            </th>
                            <th className="px-6 py-4 text-right relative group cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50" onClick={() => setShowFilter(showFilter === 'invoice' ? null : 'invoice')}>
                                <div className="flex items-center justify-end gap-1">
                                    Referencia
                                    <span className={`material-symbols-outlined text-sm ${filters.invoice ? 'text-indigo-600' : 'text-slate-300 dark:text-slate-600'}`}>filter_alt</span>
                                </div>
                                <FilterPopver column="invoice" />
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={6} className="text-center py-8 text-slate-400 italic">Cargando movimientos...</td></tr>
                        ) : filteredMovements.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-8 text-slate-400 italic">No hay movimientos que coincidan con los filtros.</td></tr>
                        ) : (
                            filteredMovements.slice(0, 100).map(m => ( 
                                <tr key={m.id} className={`${getRowColor(m.type)} transition-colors`}>
                                    <td className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                                        {format(new Date(m.date), 'dd MMM yyyy', { locale: es })}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider
                                            ${m.type.startsWith('IN') ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-500/20' : 'text-rose-700 dark:text-rose-400 bg-rose-100/50 dark:bg-rose-500/20'}`}>
                                            {getTypeLabel(m.type)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                                        {m.product?.name || 'Producto eliminado'}
                                        <span className="block text-xs font-bold text-slate-500 dark:text-slate-400 font-mono mt-0.5">{m.product?.sku}</span>
                                    </td>
                                    <td className="px-6 py-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                                        {m.type.startsWith('OUT') ? '-' : '+'}{m.quantity}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">
                                        {m.contact?.name && <span className="block font-bold text-slate-900 dark:text-white">👤 {m.contact.name}</span>}
                                        <span className="block italic">{m.observations || '-'}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-xs">
                                        {m.invoice_number && <span className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-500 dark:text-slate-400 font-mono">#{m.invoice_number}</span>}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Registration Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />

                    <div className={`bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full relative overflow-hidden flex flex-col max-h-[90vh] ${mode === 'OUT' ? 'max-w-7xl' : 'max-w-3xl'} border border-slate-200 dark:border-slate-800`}>
                        {/* Modal Header */}
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10 shrink-0">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                                <span className={`material-symbols-outlined ${mode === 'IN' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {mode === 'IN' ? 'add_circle' : 'remove_circle'}
                                </span>
                                Registrar Movimiento de Kardex
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Moda Body */}
                        <div className="p-6 overflow-y-auto w-full bg-slate-50/50 dark:bg-slate-950/50">

                            {actionError && (
                                <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-sm flex items-start gap-3">
                                    <span className="material-symbols-outlined shrink-0 text-rose-500">error</span>
                                    <p className="font-medium">{actionError}</p>
                                </div>
                            )}
                            {actionSuccess && (
                                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-sm flex items-start gap-3">
                                    <span className="material-symbols-outlined shrink-0 text-emerald-500">check_circle</span>
                                    <p className="font-medium">{actionSuccess}</p>
                                </div>
                            )}

                            {/* Modos Tabs */}
                            <div className="flex bg-slate-200/70 dark:bg-slate-800/70 p-1.5 rounded-2xl mb-8">
                                <button
                                    onClick={() => { setMode('IN'); setActionError(null); }}
                                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-black uppercase tracking-wider transition-all duration-300 flex justify-center items-center gap-2
                                        ${mode === 'IN' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                >
                                    <span className="material-symbols-outlined">south_west</span>
                                    Entrada (Ingreso)
                                </button>
                                <button
                                    onClick={() => { setMode('OUT'); setActionError(null); }}
                                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-black uppercase tracking-wider transition-all duration-300 flex justify-center items-center gap-2
                                        ${mode === 'OUT' ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                >
                                    <span className="material-symbols-outlined">north_east</span>
                                    Salida (Retiro)
                                </button>
                            </div>

                            {/* FORMULARIO DE ENTRADA */}
                            {mode === 'IN' && (
                                <form id="formIN" onSubmit={handleInSubmit} className="space-y-6 max-w-2xl mx-auto">

                                    {/* Bloque 1: Identificación del Movimiento */}
                                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-900 shadow-sm shadow-emerald-100/20 space-y-5 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                                        <h4 className="text-emerald-800 dark:text-emerald-400 font-black uppercase text-xs tracking-widest flex items-center mb-2">
                                            <span className="material-symbols-outlined text-[16px] mr-2 text-emerald-500">info</span>
                                            Bloque 1: Identificación
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">Tipo de Movimiento *</label>
                                                <select required className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                                                    value={inData.type} onChange={e => setInData({ ...inData, type: e.target.value as any })}>
                                                    <option value="IN_PURCHASE">Compra (Ingreso mercadería nva)</option>
                                                    <option value="IN_RETURN_CLIENT">Devolución de Cliente</option>
                                                    <option value="IN_ADJUSTMENT">Ajuste Positivo (Aparición Stock)</option>
                                                    <option value="IN_TOOL_RETURN">Retorno de Herramienta/Equipo</option>
                                                    <option value="IN_PROJECT_LEFTOVER">Sobras de Proyecto</option>
                                                    <option value="IN_OTHER">OTROS</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">Fecha *</label>
                                                <input type="date" required className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                                                    value={inData.date} onChange={e => setInData({ ...inData, date: e.target.value })} />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">Destino Logístico (Opcional)</label>
                                                <input type="text" placeholder="Ej. Almacén Central, Proyecto Norte..." className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                                                    value={inData.destination} onChange={e => setInData({ ...inData, destination: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bloque 2: Detalle del Producto */}
                                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                                        <h4 className="text-slate-800 dark:text-slate-200 font-black uppercase text-xs tracking-widest flex items-center mb-2">
                                            <span className="material-symbols-outlined text-[16px] mr-2 text-slate-400 dark:text-slate-500">inventory_2</span>
                                            Bloque 2: Detalle del Producto
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="md:col-span-2">
                                                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">Buscar Producto *</label>
                                                <SearchableProductSelect
                                                    products={products}
                                                    value={inData.product_id}
                                                    onChange={(id) => setInData({ ...inData, product_id: id })}
                                                    placeholder="Buscar por nombre o SKU..."
                                                    className="w-full p-3.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">Cantidad *</label>
                                                <input type="number" step="1" min="1" required className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xl font-bold font-mono text-center text-emerald-700 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                                    value={inData.quantity}
                                                    onKeyDown={handleNumberKeyDown}
                                                    onWheel={(e) => e.currentTarget.blur()}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setInData({ ...inData, quantity: val === '' ? '' : parseInt(val, 10) || '' });
                                                    }} />
                                            </div>
                                            {inData.type === 'IN_PURCHASE' && (
                                                <div className="animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block mb-1">Costo Unitario (S/) *</label>
                                                    <input type="number" step="0.01" min="0" required className="w-full p-3.5 bg-indigo-50 dark:bg-indigo-950/30 focus:bg-white dark:focus:bg-slate-700 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xl font-bold font-mono text-center text-indigo-700 dark:text-indigo-400 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                                        value={inData.unit_cost}
                                                        onKeyDown={handleNumberKeyDown}
                                                        onWheel={(e) => e.currentTarget.blur()}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            setInData({ ...inData, unit_cost: val === '' ? '' : Number(val) || '' });
                                                        }} />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bloque 3: Origen y Documentación */}
                                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                                        <h4 className="text-slate-800 dark:text-slate-200 font-black uppercase text-xs tracking-widest flex items-center mb-2">
                                            <span className="material-symbols-outlined text-[16px] mr-2 text-slate-400 dark:text-slate-500">description</span>
                                            Bloque 3: Origen y Documentación
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">
                                                    {inData.type === 'IN_PURCHASE' ? 'Proveedor *' : inData.type === 'IN_TOOL_RETURN' ? 'Responsable quien devuelve *' : 'Contacto (Opcional)'}
                                                </label>
                                                <select
                                                    required={inData.type === 'IN_PURCHASE' || inData.type === 'IN_TOOL_RETURN'}
                                                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                                    value={inData.contact_id} onChange={e => setInData({ ...inData, contact_id: e.target.value })}>
                                                    <option value="">-- Sin asignar --</option>
                                                    {contacts.map(c => (
                                                        <option key={c.id} value={c.id}>{c.name} {c.type === 'SUPPLIER' ? '(Prov)' : '(Cliente/Trabajador)'}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                                    {inData.type === 'IN_PURCHASE' ? 'N° Doc. (Factura/Boleta/Guía) *' : 'N° Documento (Opcional)'}
                                                </label>
                                                 <input
                                                    type="text"
                                                    required={inData.type === 'IN_PURCHASE'}
                                                    placeholder="F001-..."
                                                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                                    value={inData.invoice_number} onChange={e => setInData({ ...inData, invoice_number: e.target.value })} />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">
                                                    Observaciones {inData.type === 'IN_OTHER' ? '*' : '(Opcional)'}
                                                </label>
                                                <textarea
                                                    required={inData.type === 'IN_OTHER'}
                                                    rows={3}
                                                    placeholder="Detalles sobre el ingreso..."
                                                    className={`w-full p-3.5 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none text-slate-800 dark:text-slate-200
                                                        ${inData.type === 'IN_OTHER' && !inData.observations.trim() ? 'border-rose-300 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/30' : 'border-slate-200 dark:border-slate-700'}`}
                                                    value={inData.observations} onChange={e => setInData({ ...inData, observations: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>

                                </form>
                            )}


                            {/* FORMULARIO DE SALIDA */}
                            {mode === 'OUT' && (
                                <form id="formOUT" onSubmit={handleOutSubmit} className="space-y-6 w-full">

                                    {/* Encabezado Maestro */}
                                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-rose-100 dark:border-rose-900 shadow-sm shadow-rose-100/20 grid grid-cols-1 md:grid-cols-3 gap-5 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>

                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">Fecha de Salida *</label>
                                            <input type="date" required className="w-full p-3 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-rose-500 transition-all outline-none"
                                                value={outData.date} onChange={e => setOutData({ ...outData, date: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">Tipo de Salida *</label>
                                            <select required className="w-full p-3 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-rose-500 transition-all outline-none"
                                                value={outData.type} onChange={e => setOutData({ ...outData, type: e.target.value as any })}>
                                                <option value="OUT_PROJECT_CONSUMPTION">Consumo para Obra</option>
                                                <option value="OUT_TOOL_LOAN">Préstamo de Herramienta/Equipo</option>
                                                <option value="OUT_OTHER">OTROS</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">Destino / Proyecto (Opcional)</label>
                                            <select className="w-full p-3 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-rose-500 transition-all outline-none"
                                                value={outData.project_id} onChange={e => setOutData({ ...outData, project_id: e.target.value })}>
                                                <option value="">-- Sin Proyecto --</option>
                                                {projects.filter(p => !['FINALIZADO', 'CERRADO'].includes(p.status)).map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">
                                                {outData.type === 'OUT_TOOL_LOAN' ? 'Responsable del recojo *' : 'Responsable / Contacto (Opcional)'}
                                            </label>
                                            <select
                                                required={outData.type === 'OUT_TOOL_LOAN'}
                                                className="w-full p-3 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-rose-500 outline-none transition-all"
                                                value={outData.contact_id} onChange={e => setOutData({ ...outData, contact_id: e.target.value })}>
                                                <option value="">-- Sin Responsable --</option>
                                                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                            {pendingToolsCount > 0 && outData.type === 'OUT_TOOL_LOAN' && (
                                                <div className="mt-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 inline-flex items-center">
                                                    <span className="material-symbols-outlined text-[12px] mr-1">warning</span>
                                                    Aviso: Tiene {pendingToolsCount} item(s) pendiente(s).
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">N° Orden Trabajo/Doc. (Opcional)</label>
                                            <input type="text" placeholder="OT-000..." className="w-full p-3 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-rose-500 transition-all outline-none"
                                                value={outData.invoice_number} onChange={e => setOutData({ ...outData, invoice_number: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">
                                                Observaciones {outData.type === 'OUT_OTHER' ? '*' : ''}
                                            </label>
                                            <textarea rows={1} required={outData.type === 'OUT_OTHER'} placeholder="Motivo o detalle..." className="w-full p-3 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-rose-500 transition-all outline-none resize-none"
                                                value={outData.observations} onChange={e => setOutData({ ...outData, observations: e.target.value })} />
                                        </div>
                                    </div>

                                    {/* Tabla Detalles */}
                                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                                                <tr className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                                    <th colSpan={9} className="p-4 font-normal">
                                                        <div className="flex bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 w-full">
                                                            <div className="flex-1 relative z-10 focus-within:z-20">
                                                                <SearchableProductSelect
                                                                    products={products}
                                                                    value={selectedOutProductId}
                                                                    onChange={setSelectedOutProductId}
                                                                    placeholder="Buscar producto por Nombre o SKU para la salida..."
                                                                    className="w-full p-3 h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-l-lg text-sm font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-rose-500 outline-none block"
                                                                />
                                                            </div>
                                                            <div className="relative border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center shrink-0 w-32 z-10 focus-within:z-20 -ml-px">
                                                                <span className="absolute left-3 text-[10px] font-bold text-slate-400 dark:text-slate-500">CANT:</span>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    step="1"
                                                                    placeholder="1"
                                                                    className="w-full h-full p-3 pl-12 pr-4 bg-transparent text-center font-mono font-bold text-rose-600 dark:text-rose-400 focus:ring-2 focus:ring-rose-500 outline-none"
                                                                    value={selectedOutProductQty}
                                                                    onKeyDown={handleNumberKeyDown}
                                                                    onWheel={(e) => e.currentTarget.blur()}
                                                                    onChange={e => {
                                                                        const val = e.target.value;
                                                                        setSelectedOutProductQty(val === '' ? '' : parseInt(val, 10) || '');
                                                                    }}
                                                                />
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={addOutProduct}
                                                                disabled={!selectedOutProductId || !selectedOutProductQty}
                                                                className="px-6 bg-slate-800 text-white font-bold rounded-r-lg hover:bg-slate-900 transition-colors disabled:opacity-50 shrink-0"
                                                            >
                                                                Añadir
                                                            </button>
                                                        </div>
                                                    </th>
                                                </tr>
                                                <tr className="border-b border-slate-200 dark:border-slate-800">
                                                    <th className="px-4 py-3">#</th>
                                                    <th className="px-4 py-3 min-w-[200px]">Producto</th>
                                                    {/*<th className="px-4 py-3 hidden md:table-cell">Ubicación</th>*/}
                                                    <th className="px-4 py-3 text-center">Stock Actual</th>
                                                    <th className="px-4 py-3 text-center">Cantidad Salida</th>
                                                    <th className="px-4 py-3 text-center">Unidad</th>
                                                    <th className="px-4 py-3 text-right text-indigo-700/60 dark:text-indigo-400/60 hidden md:table-cell" title="Visible para Administrador">Costo Unit.*</th>
                                                    <th className="px-4 py-3 text-center font-black text-rose-600 dark:text-rose-400">Stock Posterior</th>
                                                    <th className="px-4 py-3 text-right text-indigo-700/60 dark:text-indigo-400/60 hidden md:table-cell" title="Visible para Administrador">Costo Total*</th>
                                                    <th className="px-4 py-3 text-center">Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                                {outProducts.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400 italic text-xs">
                                                            No hay productos en la lista. Seleccione uno arriba y pulse "Añadir".
                                                        </td>
                                                    </tr>
                                                ) : outProducts.map((row, idx) => {
                                                    const p = products.find(prod => prod.id === row.product_id);
                                                    if (!p) return null;

                                                    const isInvalid = p.stock_current - (Number(row.quantity) || 0) < 0;

                                                    return (
                                                        <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                            <td className="px-4 py-3 font-mono text-xs text-slate-400 dark:text-slate-500">{idx + 1}</td>
                                                            <td className="px-4 py-3">
                                                                <div className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[250px]">{p.name}</div>
                                                                <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">{p.sku}</div>
                                                            </td>
                                                            <td className="px-4 py-3 text-center font-bold text-slate-600 dark:text-slate-400">{p.stock_current}</td>
                                                            <td className="px-4 py-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                                                                <div className="bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 py-1.5 px-3 rounded inline-block min-w-[60px] cursor-not-allowed border border-rose-100 dark:border-rose-900/50">
                                                                    {row.quantity}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400">{p.unit}</td>
                                                            <td className="px-4 py-3 text-right text-indigo-700 dark:text-indigo-400 font-mono hidden md:table-cell">
                                                                S/ {p.average_cost.toFixed(2)}
                                                            </td>
                                                            <td className={`px-4 py-3 text-center font-black font-mono text-lg transition-colors ${isInvalid ? 'text-red-500 bg-red-50 dark:bg-red-950/30 font-black' : 'text-slate-800 dark:text-slate-200'}`}>
                                                                {p.stock_current - (Number(row.quantity) || 0)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-indigo-700 dark:text-indigo-400 font-mono font-bold hidden md:table-cell">
                                                                S/ {(p.average_cost * (Number(row.quantity) || 0)).toFixed(2)}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setOutProducts(outProducts.filter(r => r.id !== row.id))}
                                                                    className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
                                                                >
                                                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </form>
                            )}

                        </div>

                        {/* Modal Footer / Submit Button */}
                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                            <button
                                type="submit"
                                form={mode === 'IN' ? 'formIN' : 'formOUT'}
                                disabled={isSaving || (mode === 'OUT' && isOutSaveDisabled)}
                                className={`w-full py-4 text-white font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed
                                    ${mode === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'}`}
                            >
                                {isSaving ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Procesando...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[20px]">{mode === 'IN' ? 'save' : 'done_all'}</span>
                                        CONFIRMAR {mode === 'IN' ? 'ENTRADA' : 'SALIDA MULTIPLE'}
                                    </>
                                )}
                            </button>
                        </div>

                    </div>
                </div>
            )
            }
        </div >
    );
}
