import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useTransition, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';

// Isolated input: local state prevents parent re-renders on every keystroke
// LocalNumOpInput and variables moved to standalone modals ᛚᛚᛚ
import { 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Clock, 
  TrendingDown, 
  CreditCard, 
  Banknote,
  ShoppingCart,
  UserCheck,
  History as HistoryIcon,
  X,
  Wallet,
  ArrowRightLeft,
  Camera,
  Filter,
  FileText,
  Download,
  Eye,
  FileSpreadsheet,
  CheckCircle2,
  Lock,
  Edit3,
  Calendar
} from 'lucide-react';
import { api } from '../services/api';
import type { NodrizaTesoreria, VentaCabecera, VentaDetalle, VentaCobro, OrdenPago } from '../services/types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { DepositModal } from '../components/DepositModal';
import { Deposit8059Modal } from '../components/Deposit8059Modal';
import { InternalTransferModal } from '../components/InternalTransferModal';
import { ExpenseModal } from '../components/ExpenseModal';
import { InvoiceAssignmentModal } from '../components/InvoiceAssignmentModal';
import { PayOrderModal } from '../components/solicitudes/PayOrderModal';
import { exportToPDF, exportToExcel, exportImagesToPDF } from '../utils/exportUtils';
import { ImageLightbox } from '../components/ImageLightbox';
import { RangeDatePicker } from '../components/RangeDatePicker';

// Isolated search input: owns its own value state so keystrokes never re-render the parent.
// Debounces the parent callback to ~250 ms so filtering only kicks in when the user pauses.
const SearchInput = React.memo(({ value, onSearch, placeholder, className }: {
    value: string;
    onSearch: (v: string) => void;
    placeholder: string;
    className: string;
}) => {
    const [local, setLocal] = React.useState(value);
    const timer = React.useRef<ReturnType<typeof setTimeout>>();

    // Sync down when parent resets to '' (e.g. refresh button)
    React.useEffect(() => { setLocal(value); }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setLocal(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onSearch(v), 250);
    };

    return <input type="text" placeholder={placeholder} value={local} onChange={handleChange} className={className} />;
});

export const SalesTreasuryPage = () => {
    const defaultStartOfWeek = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const defaultEndOfWeek = format(new Date(), 'yyyy-MM-dd');

    const [loading, setLoading] = useState(true);
    const [movements, setMovements] = useState<NodrizaTesoreria[]>([]);
    const [ventas, setVentas] = useState<VentaCabecera[]>([]);
    const [compras, setCompras] = useState<NodrizaTesoreria[]>([]);
    const [ordenesPago, setOrdenesPago] = useState<any[]>([]);
    const [fontsLoaded, setFontsLoaded] = useState(false);
    const [expandedVenta, setExpandedVenta] = useState<string | null>(null);
    const [expandedCompra, setExpandedCompra] = useState<string | null>(null);
    const [ventaDetails, setVentaDetails] = useState<Record<string, VentaDetalle[]>>({});
    const [loadingHistory, setLoadingHistory] = useState(false);
    
    // View state
    const [viewMode, setViewMode] = useState<'VENTAS' | 'COMPRAS' | 'SOLICITUDES'>('VENTAS');
    
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState<'TODOS' | 'PENDIENTE' | 'PARCIAL' | 'CANCELADO'>('TODOS');
    const [startDate, setStartDate] = useState<string>(defaultStartOfWeek);
    const [endDate, setEndDate] = useState<string>(defaultEndOfWeek);
    const [tempStartDate, setTempStartDate] = useState<string>(defaultStartOfWeek);
    const [tempEndDate, setTempEndDate] = useState<string>(defaultEndOfWeek);
    const [mainQuickFilter, setMainQuickFilter] = useState<'PERSONALIZADO'|'HOY'|'ULTIMOS_7'|'ESTA_SEMANA'|'MES_ACTUAL'>('ULTIMOS_7');
    
    // Modals visibility
    const [showCobroModal, setShowCobroModal] = useState<VentaCabecera | null>(null);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [managingInvoice, setManagingInvoice] = useState<NodrizaTesoreria | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showGastoModal, setShowGastoModal] = useState<null | true | { monto: string, categoria: string, cuenta: string, desc: string }>(null);
    const [showHistoryModal, setShowHistoryModal] = useState<VentaCabecera | null>(null);
    const [showTrailModal, setShowTrailModal] = useState<VentaCabecera | null>(null);
    const [showCashAccountModal, setShowCashAccountModal] = useState(false);
    const [selectedCashDay, setSelectedCashDay] = useState<string | null>(null);
    const [loadingCashDetail, setLoadingCashDetail] = useState(false);
    const [loadingTrail, setLoadingTrail] = useState(false);
    const [trailData, setTrailData] = useState<NodrizaTesoreria[]>([]);
    const [cashDetailList, setCashDetailList] = useState<NodrizaTesoreria[]>([]);
    const [showDeposit8059Modal, setShowDeposit8059Modal] = useState(false);
    const [showPayOrderModal, setShowPayOrderModal] = useState<OrdenPago | null>(null);
    const [zoomImage, setZoomImage] = useState<string | null>(null);
    
    useScrollLock(!!showTrailModal || showCashAccountModal || !!showCobroModal || !!showHistoryModal || !!showPayOrderModal || !!showGastoModal || showTransferModal || showDeposit8059Modal || !!zoomImage || !!managingInvoice);
    
    // Cash Modal Filters
    const [cashFilterStart, setCashFilterStart] = useState(defaultStartOfWeek);
    const [cashFilterEnd, setCashFilterEnd] = useState(defaultEndOfWeek);
    const [tempCashFilterStart, setTempCashFilterStart] = useState(defaultStartOfWeek);
    const [tempCashFilterEnd, setTempCashFilterEnd] = useState(defaultEndOfWeek);
    const [cashQuickFilter, setCashQuickFilter] = useState<'PERSONALIZADO'|'HOY'|'ESTA_SEMANA'|'MES_ACTUAL'>('ESTA_SEMANA');

    // Form data
    const [historyData, setHistoryData] = useState<VentaCobro[]>([]);
    

    const [expandedCobro, setExpandedCobro] = useState<string | null>(null);
    const [cobroTrail, setCobroTrail] = useState<Record<string, NodrizaTesoreria[]>>({});
    const [loadingCobroTrail, setLoadingCobroTrail] = useState(false);

    const [showCuentasPopup, setShowCuentasPopup] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showDocExportMenu, setShowDocExportMenu] = useState(false);
    const [isExportingDocs, setIsExportingDocs] = useState(false);

    // Filter Modes
    const [mainFilterMode, setMainFilterMode] = useState<'RANGE' | 'DAY'>('RANGE');
    const [cashFilterMode, setCashFilterMode] = useState<'RANGE' | 'DAY'>('RANGE');

    // Defers expensive filter recomputation to a lower-priority render, keeping keystrokes instant
    const deferredSearch = useDeferredValue(searchTerm);
    // Marks tab switching as non-urgent so the current UI stays responsive during the transition
    const [, startTransition] = useTransition();
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const datePickerRef = useRef<HTMLDivElement>(null);
    const cuentasPopupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
                setShowExportMenu(false);
            }
            if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
                setShowDatePicker(false);
            }
            if (cuentasPopupRef.current && !cuentasPopupRef.current.contains(event.target as Node)) {
                setShowCuentasPopup(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleBulkDocExport = async (type: 'invoice' | 'voucher') => {
        setIsExportingDocs(true);
        setShowDocExportMenu(false);
        try {
            const itemsToExport = filteredCompras
                .filter(c => type === 'invoice' ? !!c.invoice_url : !!c.voucher_url)
                .map(c => ({
                    url: (type === 'invoice' ? c.invoice_url : c.voucher_url)!,
                    label: `${c.categoria} - ${c.observaciones?.substring(0, 30)}...`,
                    date: format(new Date(c.created_at), 'dd/MM/yyyy'),
                    amount: `S/ ${formatCurrency(c.monto)}`
                }));

            if (itemsToExport.length === 0) {
                alert(`No se encontraron ${type === 'invoice' ? 'facturas' : 'váuchers'} en el listado actual.`);
                return;
            }

            await exportImagesToPDF(
                `REPORTE DE ${type === 'invoice' ? 'FACTURAS' : 'VÁUCHERS'} - TESORERÍA`,
                itemsToExport,
                `Reporte_${type === 'invoice' ? 'Facturas' : 'Vauchers'}`
            );
        } catch (error) {
            console.error(error);
            alert("Error al generar el reporte de documentos.");
        } finally {
            setIsExportingDocs(false);
        }
    };

    const formatCurrency = (val: number | string) => {
        return Number(val).toLocaleString('es-PE', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
    };

    useEffect(() => {
        if ('fonts' in document) {
            document.fonts.ready.then(() => setFontsLoaded(true));
        } else {
            setFontsLoaded(true);
        }
        loadData();
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [mvs, vts, cms, ops] = await Promise.all([
                api.getTesoreriaMovements(),
                api.getVentas(),
                api.getCompras(),
                api.getOrdenesPago()
            ]);
            setMovements(mvs);
            setVentas(vts);
            setCompras(cms);
            setOrdenesPago(ops);
        } catch (error) {
            console.error("Error loading data", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Optimized balance calculations: O(N) single pass instead of repetitive filtered reductions
    const balances = useMemo(() => {
        const global: Record<string, number> = {};
        const perSale: Record<string, Record<string, number>> = {};

        movements.forEach(m => {
            const amount = Number(m.monto);
            const refId = m.referencia_id;

            // Handle Inflows
            if (m.tipo_movimiento === 'INGRESO' || m.tipo_movimiento === 'TRANSFERENCIA') {
                const dest = m.cuenta_destino;
                if (dest) {
                    global[dest] = (global[dest] || 0) + amount;
                    if (refId) {
                        if (!perSale[refId]) perSale[refId] = {};
                        perSale[refId][dest] = (perSale[refId][dest] || 0) + amount;
                    }
                }
            }
            // Handle Outflows
            if (m.tipo_movimiento === 'EGRESO' || m.tipo_movimiento === 'TRANSFERENCIA') {
                const orig = m.cuenta_origen;
                if (orig) {
                    global[orig] = (global[orig] || 0) - amount;
                    if (refId) {
                        if (!perSale[refId]) perSale[refId] = {};
                        perSale[refId][orig] = (perSale[refId][orig] || 0) - amount;
                    }
                }
            }
        });
        return { global, perSale };
    }, [movements]);

    const calculateGlobalBalance = (target: string) => balances.global[target] || 0;

    useEffect(() => {
    }, [showTransferModal, showDeposit8059Modal]);

    const BANK_ACCOUNTS = ['2049/YAPE', '4071', '9001', '8059'];


    // Export Functions
    const getCashMovementsForDay = async (date: string) => {
        setLoadingCashDetail(true);
        setSelectedCashDay(date);
        try {
            const cashSales = movements.filter(m => 
                m.cuenta_destino === 'Efectivo' && 
                m.tipo_movimiento === 'INGRESO' &&
                format(new Date(m.created_at), 'yyyy-MM-dd') === date
            );
            setCashDetailList(cashSales);
        } catch (err) {
            console.error("Error loading daily cash detail:", err);
        } finally {
            setLoadingCashDetail(false);
        }
    };

    const cashOnlyMovements = useMemo(() => {
        return movements.filter(m => {
            const date = format(new Date(m.created_at), 'yyyy-MM-dd');
            if (cashFilterStart && date < cashFilterStart) return false;
            if (cashFilterEnd && date > cashFilterEnd) return false;
            return m.cuenta_origen === 'Efectivo' || m.cuenta_destino === 'Efectivo';
        });
    }, [movements, cashFilterStart, cashFilterEnd]);

    // Unified Timeline: Merges consolidations and individual movements sorted by date
    const unifiedCashTimeline = useMemo(() => {
        const consolidations: Record<string, { total: number, count: number }> = {};
        const others: any[] = [];

        cashOnlyMovements.forEach(m => {
            if (m.cuenta_destino === 'Efectivo' && m.tipo_movimiento === 'INGRESO') {
                const date = format(new Date(m.created_at), 'yyyy-MM-dd');
                if (!consolidations[date]) consolidations[date] = { total: 0, count: 0 };
                consolidations[date].total += Number(m.monto);
                consolidations[date].count += 1;
            } else {
                others.push({ ...m, date: format(new Date(m.created_at), 'yyyy-MM-dd'), isConsolidated: false });
            }
        });

        const timeline = [
            ...Object.entries(consolidations).map(([date, data]) => ({ 
                date, 
                ...data, 
                isConsolidated: true,
                created_at: new Date(date + "T23:59:59").toISOString() // For sorting, place at end of day
            })),
            ...others
        ];

        return timeline.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }, [cashOnlyMovements]);

    const handleExport = async (type: 'PDF' | 'EXCEL' | 'VOUCHERS_PDF' | 'INVOICES_PDF') => {
        const title = viewMode === 'VENTAS' ? 'REPORTE DE VENTAS Y COBROS' : 'REPORTE DE EGRESOS Y COMPRAS';
        const fileName = viewMode === 'VENTAS' ? 'Reporte_Ventas' : 'Reporte_Egresos';

        if (type === 'VOUCHERS_PDF') {
            const items = viewMode === 'VENTAS'
                ? movements.filter(m => m.tipo_movimiento === 'INGRESO' && m.voucher_url).map(m => ({
                    url: m.voucher_url!,
                    label: `Cobro Venta #${m.venta_id?.slice(0,8) || 'N/A'}`,
                    date: format(new Date(m.created_at), 'dd/MM/yyyy'),
                    amount: `S/ ${Number(m.monto).toFixed(2)}`
                  }))
                : filteredCompras.filter(c => c.voucher_url).map(c => ({
                    url: c.voucher_url!,
                    label: `Egreso: ${c.categoria} - ${c.observaciones}`,
                    date: format(new Date(c.created_at!), 'dd/MM/yyyy'),
                    amount: `S/ ${Number(c.monto).toFixed(2)}`
                  }));
            await exportImagesToPDF('VÁUCHERES Y COMPROBANTES DE PAGO', items, `Voucheres_${fileName}`);
            setShowExportMenu(false);
            return;
        }

        if (type === 'INVOICES_PDF') {
            const items = viewMode === 'VENTAS'
                ? []
                : filteredCompras.filter(c => c.factura_url).map(c => ({
                    url: c.factura_url!,
                    label: `Factura Egreso: ${c.categoria} - ${c.observaciones}`,
                    date: format(new Date(c.created_at!), 'dd/MM/yyyy'),
                    amount: `S/ ${Number(c.monto).toFixed(2)}`
                  }));
            if (items.length === 0) {
                alert("No hay facturas o imágenes registradas en esta vista para exportar.");
                setShowExportMenu(false);
                return;
            }
            await exportImagesToPDF('FACTURAS DE EGRESOS', items, `Facturas_${fileName}`);
            setShowExportMenu(false);
            return;
        }

        if (viewMode === 'VENTAS') {
            const columns = ['FECHA', 'CÓDIGO/OT', 'CLIENTE', 'TOTAL', 'COBRADO', 'PENDIENTE', 'ESTADO'];
            const data = filteredVentas.map(v => [
                format(new Date(v.created_at), 'dd/MM/yyyy'),
                v.codigo_cotizacion || v.id.slice(0, 8),
                v.cliente_nombre.toUpperCase(),
                `S/ ${Number(v.monto_total).toFixed(2)}`,
                `S/ ${(Number(v.monto_total) - Number(v.saldo_pendiente)).toFixed(2)}`,
                `S/ ${Number(v.saldo_pendiente).toFixed(2)}`,
                v.estado_pago
            ]);

            if (type === 'PDF') {
                exportToPDF(title, columns, data, fileName);
            } else {
                const excelData = filteredVentas.map(v => ({
                    Fecha: format(new Date(v.created_at), 'dd/MM/yyyy'),
                    Codigo: v.codigo_cotizacion || v.id.slice(0, 8),
                    Cliente: v.cliente_nombre.toUpperCase(),
                    Total: Number(v.monto_total),
                    Cobrado: Number(v.monto_total) - Number(v.saldo_pendiente),
                    Pendiente: Number(v.saldo_pendiente),
                    Estado: v.estado_pago
                }));
                exportToExcel(excelData, fileName);
            }
        } else {
            const columns = ['FECHA', 'CATEGORÍA', 'CUENTA', 'DESCRIPCIÓN', 'MONTO'];
            const data = filteredCompras.map(c => [
                format(new Date(c.created_at!), 'dd/MM/yyyy'),
                c.categoria.toUpperCase(),
                (c.cuenta_origen || 'EFECTIVO').toUpperCase(),
                (c.observaciones || '').toUpperCase(),
                `S/ ${Number(c.monto).toFixed(2)}`
            ]);

            if (type === 'PDF') {
                exportToPDF(title, columns, data, fileName);
            } else {
                const excelData = filteredCompras.map(c => ({
                    Fecha: format(new Date(c.created_at!), 'dd/MM/yyyy'),
                    Categoria: c.categoria.toUpperCase(),
                    Cuenta: (c.cuenta_origen || 'EFECTIVO').toUpperCase(),
                    Descripcion: (c.observaciones || '').toUpperCase(),
                    Monto: Number(c.monto)
                }));
                exportToExcel(excelData, fileName);
            }
        }
        setShowExportMenu(false);
    };

    const toggleExpand = async (ventaId: string) => {
        if (expandedVenta === ventaId) {
            setExpandedVenta(null);
            return;
        }
        setExpandedVenta(ventaId);
        // Stubs (no ventas_cabecera yet) have no details to fetch
        if (!ventaDetails[ventaId] && !ventaId.startsWith('opt::')) {
            try {
                const details = await api.getVentaDetalle(ventaId);
                setVentaDetails(prev => ({ ...prev, [ventaId]: details }));
            } catch (error) {
                console.error("Error loading details", error);
            }
        }
    };

    // Modal logic is now inside DepositModal component

    // Modal logic is now inside special Modal components (DepositModal, Deposit8059Modal, InternalTransferModal, ExpenseModal)


    // handleConfirmTransfer logic is now isolated in InternalTransferModal component

    const openHistory = async (venta: VentaCabecera) => {
        setShowHistoryModal(venta);
        setExpandedCobro(null);
        setCobroTrail({});
        setHistoryData([]); // Clear previous
        setLoadingHistory(true);
        try {
            const data = await api.getVentaCobros(venta.id);
            setHistoryData(data);
        } catch (error) {
            console.error("Error loading history", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const toggleCobroTrail = async (cobroId: string) => {
        if (expandedCobro === cobroId) {
            setExpandedCobro(null);
            return;
        }
        setExpandedCobro(cobroId);
        if (!cobroTrail[cobroId]) {
            setLoadingCobroTrail(true);
            try {
                const trail = await api.getTesoreriaMovementsByCobro(cobroId);
                setCobroTrail(prev => ({ ...prev, [cobroId]: trail }));
            } catch (error) {
                console.error("Error loading trail", error);
            } finally {
                setLoadingCobroTrail(false);
            }
        }
    };

    const openTrail = async (venta: VentaCabecera) => {
        setShowTrailModal(venta);
        setTrailData([]);
        setLoadingTrail(true);
        try {
            const data = await api.getTesoreriaMovementsByVenta(venta.id);
            setTrailData(data);
        } catch (error) {
            console.error("Error loading trail", error);
        } finally {
            setLoadingTrail(false);
        }
    };

    const filteredVentas = useMemo(() => {
        const term = deferredSearch.toLowerCase();
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;
        return ventas.filter(v => {
            if (term && !v.cliente_nombre.toLowerCase().includes(term) && !(v.codigo_cotizacion || '').toLowerCase().includes(term)) return false;
            if (filterEstado !== 'TODOS' && v.estado_pago !== filterEstado) return false;
            const fecha = new Date(v.created_at);
            return (!start || fecha >= start) && (!end || fecha <= end);
        });
    }, [ventas, deferredSearch, filterEstado, startDate, endDate]);

    const filteredCompras = useMemo(() => {
        const term = deferredSearch.toLowerCase();
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;
        return compras.filter(c => {
            if (term && !(c.observaciones || '').toLowerCase().includes(term) && !(c.categoria || '').toLowerCase().includes(term)) return false;
            const fecha = new Date(c.created_at!);
            return (!start || fecha >= start) && (!end || fecha <= end);
        });
    }, [compras, deferredSearch, startDate, endDate]);

    const filteredOrdenes = useMemo(() => {
        const term = deferredSearch.toLowerCase();
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;
        
        const filtered = ordenesPago.filter(op => {
            // Search term filter
            if (term && !op.codigo_orden.toLowerCase().includes(term) &&
                !(op.proveedor?.razon_social || '').toLowerCase().includes(term) &&
                !(op.obra_nombre || '').toLowerCase().includes(term)) return false;
            
            // Status filter (must respect it)
            if (filterEstado !== 'TODOS' && !(filterEstado === 'PENDIENTE' ? op.estado === 'enviado' : filterEstado === 'CANCELADO' ? op.estado === 'pagado' : op.estado.toUpperCase() === filterEstado)) return false;
            
            // Date filter: 'enviado' status bypasses date filter to remain always visible
            if (op.estado === 'enviado') {
                return true;
            } else {
                const fecha = new Date(op.created_at!);
                return (!start || fecha >= start) && (!end || fecha <= end);
            }
        });

        // Sorting: 'Enviado' items at the top, then by date descending
        return filtered.sort((a, b) => {
            if (a.estado === 'enviado' && b.estado !== 'enviado') return -1;
            if (a.estado !== 'enviado' && b.estado === 'enviado') return 1;
            return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime();
        });
    }, [ordenesPago, deferredSearch, filterEstado, startDate, endDate]);

    const pendingOrdenesCount = useMemo(() => 
        ordenesPago.filter(op => op.estado === 'enviado').length, 
    [ordenesPago]);

    // memo8059 moved to standalone component ᛚᛚᛚ

    // memoTransfer logic and components are now internal to their respective modals ᛚᛚᛚ



    const { saldoEf, saldosCuentas, saldoBn } = useMemo(() => {
        const ef = calculateGlobalBalance('Efectivo');
        const ctas = BANK_ACCOUNTS.map(acc => ({ name: acc, balance: calculateGlobalBalance(acc) }));
        const bn = ctas.reduce((acc, curr) => acc + curr.balance, 0);
        return { saldoEf: ef, saldosCuentas: ctas, saldoBn: bn };
    }, [movements]);

    // Extremely aggressive caching of DOM nodes to completely bypass React's reconciliation engine
    // when typing in the 'transferNumOp' field. Changes in input values won't trigger diffing for these rows.

    // rendered8059Rows has been moved to standalone components to reduce parent churn ᛚᛚᛚ

    return (
        <React.Fragment>
            {managingInvoice && (
                <InvoiceAssignmentModal 
                    egreso={managingInvoice} 
                    onClose={() => { setManagingInvoice(null); loadData(); }} 
                    onSuccess={async () => {
                        await loadData();
                    }}
                />
            )}
            <div className="flex flex-col h-full bg-[#f7faf9] text-[#2c3434] overflow-hidden relative" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                <style>{`
                    @import url('https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800;900&display=swap');
                    @keyframes slideDown {
                        from { opacity: 0; transform: translateY(-15px) scale(0.96); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    .animate-slide-down {
                        animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                        transform-origin: top right;
                    }
                `}</style>
                {/* Dashboard Scrollable Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-16">
                        {/* Header Section */}
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <h2 className="text-3xl font-[900] text-[#1c3547] tracking-tighter leading-none mb-1">Gestión de Ventas y<br/>Tesorería</h2>
                            </div>
                            
                            <div className="flex items-center gap-4 mt-2">
                                <div className="relative group" ref={exportMenuRef}>
                                    <button
                                        onClick={() => setShowExportMenu(!showExportMenu)}
                                        className="flex items-center gap-2 px-5 py-3 bg-[#e8eded] text-[#366480] hover:bg-[#dce3e3] rounded-xl text-[13px] font-bold transition-all"
                                    >
                                        <FileText className="w-4 h-4 text-[#366480]" /> Reportes
                                    </button>
                                    
                                    <div className={`absolute top-full right-0 mt-3 w-64 bg-white/95 backdrop-blur-2xl rounded-[28px] border border-[#d3dcdb]/40 shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden z-[100] transition-all duration-200 origin-top p-2.5 ${showExportMenu ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'}`}>
                                        <button onClick={() => { handleExport('PDF'); setShowExportMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-[#f7faf9] rounded-xl transition-all text-left group">
                                            <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform"><FileText className="w-4 h-4" /></div>
                                            <div className="flex flex-col"><span className="text-[11px] font-[900] text-[#2c3434] uppercase tracking-tight">Exportar PDF</span><span className="text-[9px] text-[#366480]/40 font-bold uppercase tracking-widest">Documento Oficial</span></div>
                                        </button>
                                        <button onClick={() => { handleExport('EXCEL'); setShowExportMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-[#f7faf9] rounded-xl transition-all text-left group">
                                            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform"><FileSpreadsheet className="w-4 h-4" /></div>
                                            <div className="flex flex-col"><span className="text-[11px] font-[900] text-[#2c3434] uppercase tracking-tight">Exportar Excel</span><span className="text-[9px] text-[#366480]/40 font-bold uppercase tracking-widest">Hoja de Cálculo</span></div>
                                        </button>
                                        <button onClick={() => { handleExport('VOUCHERS_PDF'); setShowExportMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-[#f7faf9] rounded-xl transition-all text-left group border-t border-[#d3dcdb]/20 mt-1 pt-4">
                                            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform"><FileText className="w-4 h-4" /></div>
                                            <div className="flex flex-col"><span className="text-[11px] font-[900] text-[#2c3434] uppercase tracking-tight">Exportar Váucheres</span><span className="text-[9px] text-[#366480]/40 font-bold uppercase tracking-widest">Comprobantes (PDF)</span></div>
                                        </button>
                                        <button onClick={() => { handleExport('INVOICES_PDF'); setShowExportMenu(false); }} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-[#f7faf9] rounded-xl transition-all text-left group">
                                            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform"><FileText className="w-4 h-4" /></div>
                                            <div className="flex flex-col"><span className="text-[11px] font-[900] text-[#2c3434] uppercase tracking-tight">Exportar Facturas</span><span className="text-[9px] text-[#366480]/40 font-bold uppercase tracking-widest">Sustentos Subidos (PDF)</span></div>
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setShowGastoModal(true)}
                                    className="flex items-center gap-2 px-5 py-3 bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0] rounded-xl text-[13px] font-bold transition-all"
                                >
                                    <CreditCard className="w-4 h-4 text-[#166534]" /> <span className="leading-tight">Registrar<br/>Egreso</span>
                                </button>
                                
                                <button
                                    onClick={() => setShowTransferModal(true)}
                                    className="flex items-center gap-2 px-5 py-3 bg-[#bae6fd] text-[#0369a1] hover:bg-[#7dd3fc] rounded-xl text-[13px] font-bold transition-all"
                                >
                                    <ArrowRightLeft className="w-4 h-4 text-[#0369a1]" /> <span className="leading-tight">Transferencia<br/>Interna</span>
                                </button>
                            </div>
                        </div>

                        {/* KPI Cards: Exact Image Style */}
                        <div className="grid grid-cols-3 gap-6 mb-8">
                            {/* Disponible en Caja */}
                            <div 
                                onClick={() => setShowCashAccountModal(true)}
                                className="relative bg-white rounded-3xl p-6 shadow-sm cursor-pointer overflow-hidden h-[150px] flex flex-col justify-center border border-[#e8eded]"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#f8faf9] rounded-full translate-x-12 -translate-y-12 opacity-100 pointer-events-none"></div>
                                <div className="relative z-10 flex flex-col items-start mt-2">
                                    <span className="text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest mb-3">Efectivo Disponible</span>
                                    <span className="text-[34px] font-[900] text-[#244c66] tracking-tighter tabular-nums mb-4">
                                        S/ {saldoEf.toLocaleString('es-PE', { minimumFractionDigits: 0 })}
                                    </span>
                                    <div className="w-[85%] h-1 bg-[#f4f7f6] rounded-full overflow-hidden flex">
                                        <div className="h-full bg-[#356d90] w-[40%] rounded-full"></div>
                                    </div>
                                </div>
                            </div>

                            {/* Fondos en Cuentas */}
                            <div 
                                ref={cuentasPopupRef}
                                onClick={() => setShowCuentasPopup(!showCuentasPopup)}
                                className="relative bg-white rounded-3xl p-6 shadow-sm cursor-pointer overflow-hidden h-[150px] flex flex-col justify-center border border-[#e8eded]"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#f8faf9] rounded-full translate-x-12 -translate-y-12 opacity-100 pointer-events-none"></div>
                                <div className="relative z-10 flex flex-col items-start mt-2">
                                    <span className="text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest mb-3">Fondos en Cuentas</span>
                                    <span className="text-[34px] font-[900] text-[#3e6853] tracking-tighter tabular-nums mb-4">
                                        S/ {saldoBn.toLocaleString('es-PE', { minimumFractionDigits: 0 })}
                                    </span>
                                    <div className="w-[85%] h-1 bg-[#f4f7f6] rounded-full overflow-hidden flex">
                                        <div className="h-full bg-[#3e6853] w-[60%] rounded-full"></div>
                                    </div>
                                </div>
                                
                                {/* Account Dropdown: Centered floating card inside the KPI block */}
                                <div className={`absolute inset-x-4 bottom-4 bg-white/90 backdrop-blur-md rounded-[24px] border border-[#d3dcdb]/30 shadow-2xl transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] z-20 overflow-hidden ${showCuentasPopup ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`} style={{ height: showCuentasPopup ? '112px' : '0px' }}>
                                    <div className="p-4 space-y-2">
                                        {saldosCuentas.map(cta => (
                                            <div key={cta.name} className="flex justify-between items-center group/item">
                                                <span className="text-[10px] font-black text-[#366480]/60 uppercase tracking-widest">{cta.name}</span>
                                                <span className="text-[11px] font-[900] text-[#2c3434] tabular-nums">S/ {cta.balance.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Patrimonio Consolidado */}
                            <div className="relative bg-white rounded-3xl p-6 shadow-sm cursor-default overflow-hidden h-[150px] flex flex-col justify-center border border-[#e8eded]">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#f8faf9] rounded-full translate-x-12 -translate-y-12 opacity-100 pointer-events-none"></div>
                                <div className="relative z-10 flex flex-col items-start mt-2">
                                    <span className="text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest mb-3">Patrimonio en Tesorería</span>
                                    <span className="text-[34px] font-[900] text-[#2c4e66] tracking-tighter tabular-nums mb-4">
                                        S/ {(saldoEf + saldoBn).toLocaleString('es-PE', { minimumFractionDigits: 0 })}
                                    </span>
                                    <div className="w-[85%] h-1 bg-[#f4f7f6] rounded-full overflow-hidden flex">
                                        <div className="h-full bg-[#2c4e66] w-[80%] rounded-full"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* REDESIGN: Tabbed Data Management Wrapper */}
                        <div className="bg-white rounded-[32px] flex flex-col mb-10 shadow-sm border border-[#e8eded] flex-1 relative z-20">
                            {/* Tabs Navigation */}
                            <div className="flex items-center border-b border-[#f0f5f4] px-10 pt-4 shrink-0 bg-transparent">
                                {[
                                    { id: 'VENTAS', label: 'Ventas' },
                                    { id: 'COMPRAS', label: 'Egresos' },
                                    { id: 'SOLICITUDES', label: 'Requerimientos' }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => startTransition(() => setViewMode(tab.id as any))}
                                        className={`relative py-5 px-6 text-[13px] font-[800] transition-all duration-300 ${
                                            viewMode === tab.id 
                                            ? 'text-[#244c66]' 
                                            : 'text-[#8b9ba5] hover:text-[#244c66]'
                                        }`}
                                    >
                                        {tab.label}
                                        {viewMode === tab.id && (
                                            <div className="absolute bottom-0 left-6 right-6 h-[3px] bg-[#244c66] rounded-t-full animate-in fade-in slide-in-from-bottom-1"></div>
                                        )}
                                        {tab.id === 'SOLICITUDES' && pendingOrdenesCount > 0 && (
                                            <span className="absolute top-3 right-0 bg-amber-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center leading-none rounded-full shadow-sm animate-iridescent-pulse">
                                                {pendingOrdenesCount}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                            {/* Filter Bar */}
                            <div className="p-8 pb-4 flex flex-wrap items-center gap-4 shrink-0 bg-transparent border-b border-[#f0f5f4]">
                                <div className="relative flex-1 min-w-[300px]">
                                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b9ba5]" />
                                    <SearchInput
                                        value={searchTerm}
                                        onSearch={setSearchTerm}
                                        placeholder="Buscar registro..."
                                        className="w-full pl-12 pr-6 py-3 bg-[#f8faf9] border-none rounded-full text-[12px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#8b9ba5]"
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    {(viewMode === 'VENTAS' || viewMode === 'SOLICITUDES') && (
                                        <div className="relative group">
                                            <select
                                                value={filterEstado}
                                                onChange={(e) => setFilterEstado(e.target.value as any)}
                                                className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
                                            >
                                                <option value="TODOS">Todos</option>
                                                <option value="PENDIENTE">{viewMode === 'VENTAS' ? 'Pendiente' : 'Enviado'}</option>
                                                {viewMode === 'VENTAS' && <option value="PARCIAL">Parcial</option>}
                                                <option value="CANCELADO">{viewMode === 'VENTAS' ? 'Cancelado' : 'Pagado'}</option>
                                            </select>
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                                        </div>
                                    )}



                                        <div className="relative group">
                                            <select
                                                value={mainQuickFilter}
                                                onChange={(e) => {
                                                    const val = e.target.value as any;
                                                    setMainQuickFilter(val);
                                                    if (val !== 'PERSONALIZADO') {
                                                        const now = new Date();
                                                        let start = format(now, 'yyyy-MM-dd');
                                                        let end = format(now, 'yyyy-MM-dd');
                                                        if (val === 'ESTA_SEMANA') {
                                                            start = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
                                                            end = format(new Date(), 'yyyy-MM-dd');
                                                        } else if (val === 'ULTIMOS_7') {
                                                            start = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
                                                            end = format(new Date(), 'yyyy-MM-dd');
                                                        } else if (val === 'MES_ACTUAL') {
                                                            start = format(startOfMonth(now), 'yyyy-MM-dd');
                                                            end = format(endOfMonth(now), 'yyyy-MM-dd');
                                                        }
                                                        setTempStartDate(start);
                                                        setTempEndDate(end);
                                                        setStartDate(start);
                                                        setEndDate(end);
                                                        setShowDatePicker(false);
                                                    } else {
                                                        setShowDatePicker(true);
                                                    }
                                                }}
                                                className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
                                            >
                                                <option value="ESTA_SEMANA">Últimos 30 días</option>
                                                <option value="ULTIMOS_7">Últimos 7 días</option>
                                                <option value="HOY">Hoy</option>
                                                <option value="MES_ACTUAL">Mes Actual</option>
                                                <option value="PERSONALIZADO">Personalizado</option>
                                            </select>
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                                        </div>

                                        {mainQuickFilter === 'PERSONALIZADO' && (
                                            <div className="relative" ref={datePickerRef}>
                                                <button 
                                                    onClick={() => setShowDatePicker(!showDatePicker)}
                                                    className="flex items-center gap-3 px-6 py-3 bg-[#f8faf9] text-[#366480] rounded-full text-[12px] font-bold hover:bg-[#e8eded] transition-all"
                                                >
                                                    <Calendar className="w-4 h-4 text-[#4A90E2]" />
                                                    {startDate ? `${format(new Date(startDate + 'T12:00:00'), "dd MMM", { locale: es })} - ${format(new Date(endDate + 'T12:00:00'), "dd MMM", { locale: es })}` : 'Seleccionar Rango'}
                                                    <ChevronDown className={`w-3 h-3 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
                                                </button>
                                                
                                                <RangeDatePicker 
                                                    isOpen={showDatePicker}
                                                    startDate={startDate}
                                                    endDate={endDate}
                                                    onApply={(start, end) => {
                                                        setStartDate(start);
                                                        setEndDate(end);
                                                        setShowDatePicker(false);
                                                    }}
                                                    onCancel={() => setShowDatePicker(false)}
                                                />
                                            </div>
                                        )}
                                    
                                    <button
                                        onClick={() => loadData()}
                                        className="p-3 bg-[#f8faf9] text-[#366480] rounded-xl hover:bg-[#e8eded] transition-all"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Data Display Table */}
                            <div className="flex-1 overflow-x-auto min-h-[400px] px-10 pb-10">
                                {viewMode === 'VENTAS' && (
                                    <table className="w-full text-left">
                                        <thead className="sticky top-0 z-10 bg-[#f7faf9]/80 backdrop-blur-md">
                                            <tr className="text-[#366480]/40 text-[9px] font-black uppercase tracking-[0.25em] border-b border-[#d3dcdb]/10"><th className="py-4 pl-4">Transacción / OT</th><th className="py-4">Cliente</th><th className="py-4 text-right">Monto Total</th><th className="py-4 px-8">Balance de Pago</th><th className="py-4 text-right pr-4">Acciones</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#d3dcdb]/10">
                                            {loading ? <tr><td colSpan={5} className="py-20 text-center font-black animate-pulse text-[#366480]/30 uppercase tracking-[0.3em] text-[10px]">Sincronizando logic...</td></tr> : filteredVentas.length === 0 ? <tr><td colSpan={5} className="py-20 text-center font-black text-[#366480]/20 uppercase tracking-[0.3em] text-[10px]">No se encontraron registros</td></tr> : filteredVentas.map(venta => {
                                                const isStub = venta.id.startsWith('opt::');
                                                return (
                                                    <React.Fragment key={venta.id}>
                                                        <tr className="group hover:bg-[#f0f5f4]/30 transition-all duration-300">
                                                            <td className="py-4 pl-4">
                                                                <div className="flex items-center gap-4">
                                                                    <button onClick={() => toggleExpand(venta.id)} className={`p-2 rounded-xl border transition-all ${expandedVenta === venta.id ? 'bg-[#4A90E2] text-white border-[#4A90E2]' : 'bg-white border-[#d3dcdb]/40 text-[#366480]/40 hover:text-[#4A90E2] shadow-sm'}`}>{expandedVenta === venta.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[12px] font-[900] text-[#2c3434] tracking-tight uppercase">#{venta.codigo_cotizacion || venta.id.slice(0,8)}</span>
                                                                        <span className="text-[9px] font-bold text-[#366480]/40 uppercase tracking-widest">{format(new Date(venta.created_at), "dd MMM, yyyy")}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="py-4">
                                                                <p className="text-[11px] font-black text-[#366480] uppercase tracking-tight">{venta.cliente_nombre}</p>
                                                            </td>
                                                            <td className="py-4 text-right font-[900] text-[13px] text-[#2c3434] tabular-nums">
                                                                {isStub ? '—' : `S/ ${formatCurrency(venta.monto_total)}`}
                                                            </td>
                                                            <td className="py-4 px-8">
                                                                <div className="flex items-center gap-3">
                                                                    <span className={`px-4 py-1.5 text-[8px] font-black rounded-full border tracking-widest uppercase ${isStub ? 'bg-slate-100 text-slate-400 border-slate-200' : venta.estado_pago === 'CANCELADO' ? 'bg-[#dcfce7] text-[#166534] border-[#bbf7d0]' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                                                        {isStub ? 'Listo para Corte' : venta.estado_pago}
                                                                    </span>
                                                                    {!isStub && <span className="text-[9px] font-[900] text-[#366480]/60 tabular-nums">S/ {formatCurrency(venta.saldo_pendiente)}</span>}
                                                                </div>
                                                            </td>
                                                            <td className="py-4 text-right pr-4">
                                                                <div className="flex items-center justify-end gap-3 transition-all duration-300">
                                                                    {!isStub && <button onClick={() => openHistory(venta)} className="p-3 bg-white text-[#366480] hover:bg-[#f0f5f4] hover:text-[#4A90E2] rounded-xl transition-all shadow-sm border border-[#d3dcdb]/20"><HistoryIcon className="w-4 h-4" /></button>}
                                                                    {!isStub && Number(venta.saldo_pendiente) > 0 && <button onClick={() => setShowCobroModal(venta)} className="px-6 py-3 bg-[#4A90E2] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-[#4A90E2]/10 hover:bg-[#357ABD] transition-all">Cobrar</button>}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {expandedVenta === venta.id && (
                                                            <tr>
                                                                <td colSpan={5} className="p-0 border-none bg-[#f7faf9]/30">
                                                                    <div className="px-10 py-4 animate-in slide-in-from-top-4 duration-500">
                                                                        <div className="bg-white border border-[#d3dcdb]/20 rounded-[24px] p-8 shadow-sm">
                                                                            <p className="text-[10px] font-black text-[#366480]/40 uppercase tracking-[0.2em] mb-6 border-b border-[#d3dcdb]/10 pb-4 italic">Desglose Técnico del Proyecto</p>
                                                                            <table className="w-full text-[11px]">
                                                                                <thead className="text-[#366480]/30 font-black uppercase tracking-widest border-b border-[#d3dcdb]/10">
                                                                                    <tr><th className="pb-4 text-left">Componente / Recurso</th><th className="pb-4 text-center">Cantidad</th><th className="pb-4 text-right pr-4">Subtotal</th></tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-[#d3dcdb]/10">
                                                                                    {ventaDetails[venta.id]?.map(det => (
                                                                                        <tr key={det.id} className="hover:bg-[#f7faf9] transition-all">
                                                                                            <td className="py-4 font-black uppercase text-[#366480]/70 tracking-tight">{det.material_insumo}</td>
                                                                                            <td className="py-4 text-center font-[900] tabular-nums">{Number(det.cantidad).toFixed(2)}</td>
                                                                                            <td className="py-4 text-right pr-4 font-[900] text-[#2c3434]">S/ {formatCurrency(det.total)}</td>
                                                                                        </tr>
                                                                                    ))}
                                                                                    {!ventaDetails[venta.id] && (
                                                                                        <tr><td colSpan={3} className="py-10 text-center flex flex-col items-center gap-3"><RefreshCw className="w-5 h-5 animate-spin text-[#4A90E2]" /><span className="font-black text-[#366480]/20 uppercase tracking-widest text-[9px]">Consultando desglose...</span></td></tr>
                                                                                    )}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}

                                {viewMode === 'COMPRAS' && (
                                    <table className="w-full text-left">
                                        <thead className="sticky top-0 z-10 bg-[#f7faf9]/80 backdrop-blur-md">
                                            <tr className="text-[#366480]/40 text-[9px] font-black uppercase tracking-[0.25em] border-b border-[#d3dcdb]/10">
                                                <th className="py-4 pl-4">Registro</th><th className="py-4">Clasificación</th><th className="py-4 text-center">Documento</th><th className="py-4">Referencia</th><th className="py-4 text-right">Monto</th><th className="py-4 text-right pr-4">Gestión</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#d3dcdb]/10">
                                            {loading ? <tr><td colSpan={6} className="py-20 text-center font-black animate-pulse text-[#366480]/30 uppercase tracking-[0.3em] text-[10px]">Escaneando egresos...</td></tr> : filteredCompras.length === 0 ? <tr><td colSpan={6} className="py-20 text-center font-black text-[#366480]/20 uppercase tracking-[0.3em] text-[10px]">Sin movimientos registrados</td></tr> : filteredCompras.map(compra => (
                                                <React.Fragment key={compra.id}>
                                                    <tr className="group hover:bg-[#fff0f2]/30 transition-all duration-300">
                                                        <td className="py-4 pl-4 text-[10px] font-black text-[#366480]/40 uppercase">{format(new Date(compra.created_at!), "dd MMM, yyyy")}</td>
                                                        <td className="py-4">
                                                            <span className="px-4 py-1.5 bg-white text-[#366480] text-[9px] font-black rounded-full uppercase border border-[#d3dcdb]/40 tracking-widest shadow-sm">{compra.categoria}</span>
                                                        </td>
                                                        <td className="py-4 text-center">
                                                            {compra.has_invoice ? (
                                                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#dcfce7] text-[#166534] text-[8px] font-black rounded-full uppercase tracking-tighter border border-[#bbf7d0]">Factura Registrada</span>
                                                            ) : (
                                                                <span className="text-[8px] font-black text-[#366480]/20 uppercase tracking-[0.2em]">S/D Fiscal</span>
                                                            )}
                                                        </td>
                                                        <td className="py-4 text-[11px] font-black uppercase text-[#2c3434] tracking-tight">{compra.observaciones}</td>
                                                        <td className="py-4 text-right font-[900] text-rose-500 text-[14px] tabular-nums pr-4">S/ {formatCurrency(compra.monto)}</td>
                                                        <td className="py-4 text-right pr-4">
                                                            <div className="flex items-center justify-end gap-3 transition-all">
                                                                <button onClick={() => setManagingInvoice(compra)} className="p-3 bg-white border border-[#d3dcdb]/20 text-[#366480] hover:bg-[#f0f5f4] hover:text-[#4A90E2] rounded-xl transition-all shadow-sm"><Search className="w-4 h-4" /></button>
                                                                <button onClick={() => setExpandedCompra(expandedCompra === compra.id ? null : compra.id)} className={`p-3 rounded-xl transition-all shadow-sm border ${expandedCompra === compra.id ? 'bg-[#366480] text-white border-[#366480]' : 'bg-white border-[#d3dcdb]/20 text-[#366480] hover:bg-[#f0f5f4] hover:text-[#4A90E2]'}`}><ChevronDown className={`w-4 h-4 transition-transform ${expandedCompra === compra.id ? 'rotate-180' : ''}`} /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {expandedCompra === compra.id && (
                                                        <tr>
                                                            <td colSpan={6} className="p-0 border-none bg-[#fff0f2]/20">
                                                                <div className="px-10 py-4 animate-in slide-in-from-top-4 duration-500">
                                                                    <div className="bg-white border border-[#d3dcdb]/20 rounded-[24px] p-8 shadow-sm flex items-center justify-between">
                                                                        <div className="flex items-center gap-12">
                                                                            <div className="flex flex-col gap-2">
                                                                                <span className="text-[8px] font-black text-[#366480]/30 uppercase tracking-[0.2em]">Procedencia</span>
                                                                                <span className="text-[11px] font-[900] text-[#366480] uppercase tracking-tight">{compra.cuenta_origen || 'Efectivo'}</span>
                                                                            </div>
                                                                            <div className="w-px h-10 bg-[#d3dcdb]/20"></div>
                                                                            <div className="flex flex-col gap-2">
                                                                                <span className="text-[8px] font-black text-[#366480]/30 uppercase tracking-[0.2em]">Operación</span>
                                                                                <span className="text-[11px] font-[900] text-[#366480] uppercase tracking-tight">#{compra.numero_operacion || 'S/N'}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-4">
                                                                            {compra.voucher_url && (
                                                                                <div onClick={() => setZoomImage(compra.voucher_url!)} className="w-12 h-12 rounded-xl overflow-hidden border border-[#d3dcdb]/40 cursor-zoom-in hover:scale-110 transition-transform">
                                                                                    <img src={compra.voucher_url} className="w-full h-full object-cover" />
                                                                                </div>
                                                                            )}
                                                                            <button onClick={() => setExpandedCompra(null)} className="px-6 py-3 bg-[#2c3434] text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-transform">Cerrar</button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                {viewMode === 'SOLICITUDES' && (
                                    <table className="w-full text-left">
                                        <thead className="sticky top-0 z-10 bg-[#f7faf9]/80 backdrop-blur-md">
                                            <tr className="text-[#366480]/40 text-[9px] font-black uppercase tracking-[0.25em] border-b border-[#d3dcdb]/10">
                                                <th className="py-4 pl-4">Cod. / Emisión</th><th className="py-4">Proveedor / Obra</th><th className="py-4 text-right">Monto Total</th><th className="py-4 text-center">Estado</th><th className="py-4 text-right pr-4">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#d3dcdb]/10">
                                            {loading ? <tr><td colSpan={5} className="py-20 text-center font-black animate-pulse text-[#366480]/30 uppercase tracking-[0.3em] text-[10px]">Recuperando requerimientos...</td></tr> : filteredOrdenes.length === 0 ? <tr><td colSpan={5} className="py-20 text-center font-black text-[#366480]/20 uppercase tracking-[0.3em] text-[10px]">No hay órdenes pendientes</td></tr> : filteredOrdenes.map(op => (
                                                <tr key={op.id} className="hover:bg-amber-50/20 transition-all group duration-300">
                                                    <td className="py-4 pl-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] font-[900] text-[#2c3434] uppercase tracking-tight">#{op.codigo_orden}</span>
                                                            <span className="text-[9px] font-bold text-[#366480]/40 uppercase tracking-widest">{format(new Date(op.created_at!), "dd MMM, yyyy")}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-black text-[#366480] uppercase tracking-tight leading-tight">{op.proveedor?.razon_social}</span>
                                                            <span className="text-[9px] font-bold text-[#366480]/40 uppercase tracking-widest italic mt-0.5">{op.obra_nombre}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 text-right">
                                                        <span className="text-[14px] font-[900] text-[#2c3434] tabular-nums">{op.moneda === 'PEN' ? 'S/' : '$'} {formatCurrency(op.monto_total)}</span>
                                                    </td>
                                                    <td className="py-4 text-center">
                                                        <span className={`px-4 py-1.5 text-[9px] font-black rounded-full uppercase tracking-widest border shadow-sm ${op.estado === 'pagado' ? 'bg-[#dcfce7] text-[#166534] border-[#bbf7d0]' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>{op.estado}</span>
                                                    </td>
                                                    <td className="py-4 text-right pr-4">
                                                        <div className="flex justify-end transition-all duration-300">
                                                            <button onClick={() => setShowPayOrderModal(op)} className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${op.estado === 'pagado' ? 'bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0]' : 'bg-[#4A90E2] text-white shadow-lg shadow-[#4A90E2]/10 hover:bg-[#357ABD]'}`}>
                                                                <Eye className="w-3.5 h-3.5" /> Detalles
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                        </div>

            <div className="relative z-[200]">
                {showCobroModal && createPortal(
                    <DepositModal
                        venta={showCobroModal}
                        onClose={() => setShowCobroModal(null)}
                        onRefresh={loadData}
                    />,
                    document.body
                )}

                {showHistoryModal && createPortal(
                    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden animate-in fade-in duration-300" style={{ backdropFilter: 'blur(6px)' }}>
                        <div className="bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-3xl border border-white/50 flex flex-col max-h-[95vh] relative overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>
                            
                            <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40">
                                <div className="flex items-center gap-4">
                                    <HistoryIcon className="w-8 h-8 text-[#4A90E2] drop-shadow-sm" />
                                    <div>
                                        <h2 className="text-2xl font-black text-[#2c3434] uppercase tracking-tight">Historial de Depósitos</h2>
                                    </div>
                                </div>
                                <button onClick={() => setShowHistoryModal(null)} className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                                {loadingHistory ? (
                                    <div className="py-20 flex flex-col items-center gap-4">
                                        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                                        <p className="text-slate-300 font-black uppercase tracking-widest text-[10px]">Consultando historial...</p>
                                    </div>
                                ) : historyData.length === 0 ? (
                                    <div className="py-24 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[3rem]">
                                        <p className="text-slate-300 font-black uppercase tracking-widest text-xs italic">Esta venta no registra ningún depósito hasta el momento</p>
                                    </div>
                                ) : historyData.map(cobro => (
                                    <div key={cobro.id} className="space-y-4">
                                        <div 
                                            onClick={() => toggleCobroTrail(cobro.id)}
                                            className={`bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2.5rem] border-2 cursor-pointer transition-all flex items-center justify-between group ${expandedCobro === cobro.id ? 'border-indigo-500 shadow-xl' : 'border-slate-100 dark:border-slate-800 overflow-hidden'}`}
                                        >
                                            <div className="flex items-center gap-8">
                                                <div className={`p-5 rounded-2xl border shadow-sm ${cobro.cuenta_destino === 'Efectivo' ? 'bg-amber-50 border-amber-100 text-amber-500' : 'bg-emerald-50 border-emerald-100 text-emerald-500'}`}>{cobro.cuenta_destino === 'Efectivo' ? <Banknote /> : <CreditCard />}</div>
                                                <div>
                                                    <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">S/ {Number(cobro.monto).toFixed(2)}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                                        {format(new Date(cobro.created_at), "dd MMMM, yyyy - HH:mm", { locale: es })}
                                                    </p>
                                                    {cobro.motivo_excedente && (
                                                        <div className="mt-2 text-[9px] font-black text-rose-500 bg-rose-50 dark:bg-rose-900/10 px-3 py-1.5 rounded-lg border border-rose-100 dark:border-rose-900/30 uppercase">
                                                            MOTIVO EXCEDENTE: {cobro.motivo_excedente}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-8">
                                                {cobro.numero_operacion && <div className="text-right hidden sm:block"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Operación</p><p className="text-[12px] font-black font-mono bg-slate-100 dark:bg-slate-900 px-4 py-1.5 rounded-xl uppercase">#{cobro.numero_operacion}</p></div>}
                                                {cobro.voucher_url && <div onClick={(e) => {e.stopPropagation(); setZoomImage(cobro.voucher_url!);}} className="relative w-16 h-16 rounded-2xl overflow-hidden cursor-zoom-in border-4 border-white dark:border-slate-800 shadow-lg group-hover:scale-110 transition-transform"><img src={cobro.voucher_url} className="w-full h-full object-cover" /></div>}
                                                <div className={`p-3 rounded-full ${expandedCobro === cobro.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{expandedCobro === cobro.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</div>
                                            </div>
                                        </div>
                                        
                                        {expandedCobro === cobro.id && (
                                            <div className="mx-10 pl-10 border-l-4 border-indigo-100 dark:border-indigo-900 space-y-4 py-4 animate-in slide-in-from-top-4">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6">Ruta e Historial de este Depósito</p>
                                                {loadingCobroTrail ? (
                                                    <div className="py-6 flex items-center gap-3 text-slate-300 font-black text-[9px] uppercase"><RefreshCw className="w-3 h-3 animate-spin" /> Rastreando fondos...</div>
                                                ) : cobroTrail[cobro.id]?.map((m, idx) => (
                                                    <div key={m.id} className="flex items-center gap-6 relative">
                                                        <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border-2 border-indigo-100 flex items-center justify-center text-indigo-500 font-black text-[10px] shadow-sm z-10">{idx + 1}</div>
                                                        <div className="flex-1 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
                                                            <div>
                                                                <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase">
                                                                    {m.tipo_movimiento === 'INGRESO' 
                                                                        ? (historyData.slice().sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]?.id === cobro.id ? 'PAGO INICIAL' : 'AMORTIZACIÓN') 
                                                                        : m.tipo_movimiento}
                                                                </p>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{m.observaciones || 'Sin detalles'}</p>
                                                            </div>
                                                            <div className="text-right flex items-center gap-4">
                                                                {m.voucher_url && (
                                                                    <div onClick={(e) => {e.stopPropagation(); setZoomImage(m.voucher_url!);}} className="w-10 h-10 rounded-lg overflow-hidden border-2 border-slate-100 dark:border-slate-800 cursor-zoom-in group-hover:scale-105 transition-transform flex-shrink-0">
                                                                        <img src={m.voucher_url} className="w-full h-full object-cover" />
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <p className={`text-[11px] font-black tabular-nums ${m.tipo_movimiento === 'INGRESO' ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>S/ {Number(m.monto).toFixed(2)}</p>
                                                                    <p className="text-[8px] font-bold text-slate-300 uppercase">{m.cuenta_destino || m.cuenta_origen}</p>
                                                                    {m.numero_operacion && <p className="text-[7px] font-black bg-slate-50 dark:bg-slate-900 px-1 py-0.5 rounded mt-1 text-slate-400 uppercase tracking-tighter">#{m.numero_operacion}</p>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(!loadingCobroTrail && (!cobroTrail[cobro.id] || cobroTrail[cobro.id].length === 0)) && (
                                                    <p className="text-[10px] font-bold text-slate-300 italic uppercase">No se encontraron movimientos registrados en tesorería para este cobro.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showGastoModal && createPortal(
                    <ExpenseModal
                        onClose={() => setShowGastoModal(null)}
                        onSuccess={loadData}
                        calculateGlobalBalance={calculateGlobalBalance}
                        formatCurrency={formatCurrency}
                        initialData={typeof showGastoModal === 'object' ? showGastoModal : undefined}
                    />,
                    document.body
                )}

                {showTransferModal && createPortal(
                    <InternalTransferModal
                        ventas={ventas}
                        movements={movements}
                        onClose={() => { setShowTransferModal(false); }}
                        onSuccess={loadData}
                        onZoom={setZoomImage}
                        formatCurrency={formatCurrency}
                    />,
                    document.body
                )}

                {showPayOrderModal && createPortal(
                    <PayOrderModal
                        orden={showPayOrderModal}
                        onClose={() => { setShowPayOrderModal(null); loadData(); }}
                        onSuccess={loadData}
                        balances={balances.global}
                    />,
                    document.body
                )}

                {showDeposit8059Modal && createPortal(
                    <Deposit8059Modal
                        ventas={ventas}
                        movements={movements}
                        onClose={() => setShowDeposit8059Modal(false)}
                        onSuccess={loadData}
                        onZoom={setZoomImage}
                        formatCurrency={formatCurrency}
                    />,
                    document.body
                )}
            </div>

            {/* REFACTORIZED LIGHTBOX (Ultra-Smooth Isolated Interaction) */}

            {zoomImage && (
                <ImageLightbox src={zoomImage} onClose={() => setZoomImage(null)} />
            )}

            {/* TRACEABILITY MODAL (Money Route) */}
            {showTrailModal && createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden animate-in fade-in duration-300" style={{ backdropFilter: 'blur(6px)' }}>
                    <div className="bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-3xl border border-white/50 flex flex-col max-h-[95vh] relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>
                        
                        <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40">
                            <div className="flex items-center gap-4">
                                <ArrowRightLeft className="w-8 h-8 text-[#4A90E2] drop-shadow-sm" />
                                <div>
                                    <h2 className="text-2xl font-black text-[#2c3434] uppercase tracking-tight">Ruta del Dinero</h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="px-2 py-0.5 bg-[#f0f5f4] text-[#366480] text-[9px] font-black rounded border border-[#d3dcdb]/30">#{showTrailModal.codigo_cotizacion || showTrailModal.id.slice(0,8)}</span>
                                        <span className="text-[10px] font-bold text-[#8b9ba5]">{showTrailModal.cliente_nombre.toUpperCase()}</span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setShowTrailModal(null)} className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                            {loadingTrail ? (
                                <div className="py-20 text-center flex flex-col items-center gap-4">
                                    <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rastreando ruta de fondos...</span>
                                </div>
                            ) : trailData.length === 0 ? (
                                <div className="py-20 text-center text-slate-300 uppercase font-black tracking-widest text-[10px]">No hay movimientos registrados para esta venta</div>
                            ) : (
                                <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
                                    {trailData.map((m, idx) => (
                                        <div key={idx} className="relative animate-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                                            <div className={`absolute -left-8 top-1.5 w-6 h-6 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center ${m.tipo_movimiento === 'INGRESO' ? 'bg-emerald-500' : 'bg-indigo-500 shadow-lg shadow-indigo-200 dark:shadow-none'}`}>
                                                {m.tipo_movimiento === 'INGRESO' ? <TrendingDown className="w-3 h-3 text-white" /> : <ArrowRightLeft className="w-3 h-3 text-white" />}
                                            </div>
                                            <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-4">
                                                        {m.voucher_url && (
                                                            <div onClick={(e) => {e.stopPropagation(); setZoomImage(m.voucher_url!);}} className="w-12 h-12 rounded-xl overflow-hidden border-2 border-white dark:border-slate-700 cursor-zoom-in shadow-md hover:scale-110 transition-transform flex-shrink-0">
                                                                <img src={m.voucher_url} className="w-full h-full object-cover" />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">{format(new Date(m.created_at!), "dd MMM, yyyy HH:mm", { locale: es })}</span>
                                                            <span className={`text-[11px] font-extrabold uppercase ${m.tipo_movimiento === 'INGRESO' ? 'text-emerald-600' : 'text-indigo-600'}`}>{m.tipo_movimiento === 'INGRESO' ? 'Recibo del Cliente' : 'Transferencia entre Cuentas'}</span>
                                                            {m.numero_operacion && <span className="ml-2 text-[8px] font-black bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 uppercase">#{m.numero_operacion}</span>}
                                                        </div>
                                                    </div>
                                                    <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">S/ {formatCurrency(m.monto)}</span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-3 overflow-hidden">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Origen</span>
                                                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{m.cuenta_origen || 'CLIENTE'}</span>
                                                    </div>
                                                    <ArrowRightLeft className="w-3 h-3 text-slate-300 shrink-0" />
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Destino</span>
                                                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{m.cuenta_destino || '-'}</span>
                                                    </div>
                                                </div>
                                                <p className="mt-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 italic">"{(m.observaciones || '').toUpperCase()}"</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="px-8 py-6 border-t border-slate-50 dark:border-slate-800 flex justify-between items-center bg-white/40">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Trazabilidad en tiempo real vía CRM Nodriza</p>
                            <button onClick={() => setShowTrailModal(null)} className="px-10 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black rounded-xl uppercase tracking-widest shadow-xl">Cerrar</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* CASH MANAGEMENT POPUP */}
            {showCashAccountModal && createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden animate-in fade-in duration-300" style={{ backdropFilter: 'blur(6px)' }}>
                    <div className="bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-7xl border border-white/50 flex flex-col max-h-[95vh] relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>
                        
                        <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40">
                            <div className="flex items-center gap-4">
                                <Banknote className="w-10 h-10 text-[#4A90E2] drop-shadow-sm" />
                                <div>
                                    <h2 className="text-2xl font-black text-[#2c3434] uppercase tracking-tight">Libro de Caja Efectivo</h2>
                                </div>
                            </div>
                            <button onClick={() => setShowCashAccountModal(false)} className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="flex-1 flex flex-col p-8 overflow-hidden">
                                
                                <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800 px-6 py-4 rounded-3xl border border-slate-100/50 shadow-sm w-max">
                                    <div className="flex flex-col gap-1.5">
                                        <select 
                                            value={cashQuickFilter}
                                            onChange={(e) => {
                                                const val = e.target.value as any;
                                                setCashQuickFilter(val);
                                                if (val !== 'PERSONALIZADO') {
                                                    const now = new Date();
                                                    let start = format(now, 'yyyy-MM-dd');
                                                    let end = format(now, 'yyyy-MM-dd');
                                                    if (val === 'ESTA_SEMANA') {
                                                        start = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
                                                        end = format(new Date(), 'yyyy-MM-dd');
                                                    } else if (val === 'MES_ACTUAL') {
                                                        start = format(startOfMonth(now), 'yyyy-MM-dd');
                                                        end = format(endOfMonth(now), 'yyyy-MM-dd');
                                                    }
                                                    setTempCashFilterStart(start);
                                                    setTempCashFilterEnd(end);
                                                    setCashFilterStart(start);
                                                    setCashFilterEnd(end);
                                                }
                                            }}
                                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl text-[11px] font-black outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300 w-44 uppercase shadow-sm cursor-pointer"
                                        >
                                            <option value="PERSONALIZADO">Rango: Personalizado</option>
                                            <option value="HOY">Hoy</option>
                                            <option value="ESTA_SEMANA">Última Semana</option>
                                            <option value="MES_ACTUAL">Mes Actual</option>
                                        </select>
                                    </div>
                                                                         <div className="h-14 w-px bg-slate-200 dark:bg-slate-700 mx-3"></div>
                                    <div className="flex flex-col items-center">
                                        <div className={`flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 h-9 mb-3 transition-all ${cashQuickFilter !== 'PERSONALIZADO' ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                                            <button 
                                                onClick={() => setCashFilterMode('RANGE')}
                                                className={`px-6 flex items-center justify-center text-[9px] font-black uppercase rounded-lg transition-all ${cashFilterMode === 'RANGE' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-md transform scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                Rango
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    setCashFilterMode('DAY');
                                                    setTempCashFilterEnd(tempCashFilterStart);
                                                }}
                                                className={`px-6 flex items-center justify-center text-[9px] font-black uppercase rounded-lg transition-all ${cashFilterMode === 'DAY' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-md transform scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                Día
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col gap-1">
                                                <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 ${cashQuickFilter !== 'PERSONALIZADO' ? 'text-slate-300' : 'text-slate-400'}`}>{cashFilterMode === 'RANGE' ? 'Desde' : 'Fecha'}</span>
                                                <input 
                                                    type="date" 
                                                    value={tempCashFilterStart} 
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setTempCashFilterStart(val);
                                                        if (cashFilterMode === 'DAY') setTempCashFilterEnd(val);
                                                    }} 
                                                    disabled={cashQuickFilter !== 'PERSONALIZADO'} 
                                                    className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl text-[11px] font-black outline-none focus:border-indigo-500 w-40 shadow-sm ${cashQuickFilter !== 'PERSONALIZADO' ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800' : ''}`} 
                                                />
                                            </div>
                                            {cashFilterMode === 'RANGE' && (
                                                <div className="flex flex-col gap-1">
                                                    <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 ${cashQuickFilter !== 'PERSONALIZADO' ? 'text-slate-300' : 'text-slate-400'}`}>Hasta</span>
                                                    <input 
                                                        type="date" 
                                                        value={tempCashFilterEnd} 
                                                        onChange={(e) => setTempCashFilterEnd(e.target.value)} 
                                                        disabled={cashQuickFilter !== 'PERSONALIZADO'} 
                                                        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl text-[11px] font-black outline-none focus:border-indigo-500 w-40 shadow-sm ${cashQuickFilter !== 'PERSONALIZADO' ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800' : ''}`} 
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-2 mt-8">
                                        <div className="relative">
                                            <button 
                                                onClick={() => { setCashFilterStart(tempCashFilterStart); setCashFilterEnd(tempCashFilterEnd); }} 
                                                disabled={cashQuickFilter !== 'PERSONALIZADO'}
                                                className={`p-4 rounded-2xl border-2 shadow-sm transition-all flex items-center justify-center 
                                                    ${cashQuickFilter !== 'PERSONALIZADO' 
                                                        ? 'bg-slate-100 dark:bg-slate-800 border-transparent text-slate-300 opacity-50 cursor-not-allowed' 
                                                        : (tempCashFilterStart !== cashFilterStart || (cashFilterMode === 'RANGE' && tempCashFilterEnd !== cashFilterEnd))
                                                            ? 'bg-indigo-600 border-indigo-700 text-white animate-pulse hover:bg-indigo-700 hover:scale-105 active:scale-95' 
                                                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500 hover:border-indigo-200 active:scale-95'
                                                    }`}
                                                title={cashQuickFilter !== 'PERSONALIZADO' ? 'Filtro automático activado' : 'Aplicar filtro'}
                                            >
                                                <Filter className="w-5 h-5" />
                                            </button>
                                            {cashQuickFilter === 'PERSONALIZADO' && (tempCashFilterStart !== cashFilterStart || (cashFilterMode === 'RANGE' && tempCashFilterEnd !== cashFilterEnd)) && (
                                                <span className="absolute -top-2 -right-2 flex h-4 w-4">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 border-2 border-white dark:border-slate-900"></span>
                                                </span>
                                            )}
                                        </div>
                                        <button onClick={() => {
                                            setCashFilterStart(''); setCashFilterEnd('');
                                            setTempCashFilterStart(''); setTempCashFilterEnd('');
                                            setCashQuickFilter('PERSONALIZADO');
                                        }} className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-colors shadow-sm"><RefreshCw className="w-5 h-5" /></button>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex flex-col items-end gap-16 mr-20">
                                <button 
                                    onClick={() => {
                                        setShowDeposit8059Modal(true);
                                    }}
                                    className="px-10 py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl text-[12px] font-black shadow-xl shadow-emerald-200 dark:shadow-none transition-all active:scale-[0.98] flex items-center gap-4 border-b-4 border-emerald-800 whitespace-nowrap"
                                >
                                    <ArrowRightLeft className="w-5 h-5" /> DEPÓSITO A 8059
                                </button>
                                
                                <div className="bg-indigo-600 px-8 py-5 rounded-3xl text-white shadow-xl shadow-indigo-200 dark:shadow-none flex flex-col justify-center items-center">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Saldo Disponible</p>
                                    <div className="flex items-baseline gap-1 whitespace-nowrap">
                                        <span className="text-xl font-black">S/</span>
                                        <span className="text-3xl font-black tabular-nums tracking-tighter">
                                            {saldoEf.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 border-b border-slate-100 dark:border-slate-800">
                                    <tr>
                                        <th className="py-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                                        <th className="py-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tipo</th>
                                        <th className="py-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Movimiento</th>
                                        <th className="py-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Obra / Venta</th>
                                        <th className="py-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                                        <th className="py-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Efectivo</th>
                                        <th className="py-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Yape</th>
                                        <th className="py-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Monto</th>
                                        <th className="py-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center min-w-[150px]">Monto Depósito a 8059</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {unifiedCashTimeline.map((item, idx) => {
                                        const prevItem = idx > 0 ? unifiedCashTimeline[idx - 1] : null;
                                        const isNewDay = !prevItem || item.date !== prevItem.date;

                                        return (
                                            <React.Fragment key={item.isConsolidated ? `cons-${item.date}` : `mov-${item.id}`}>
                                                {isNewDay && idx > 0 && (
                                                    <tr className="bg-slate-50/20 dark:bg-slate-900/40 border-none">
                                                        <td colSpan={11} className="py-4 px-4 border-y border-slate-100 dark:border-slate-800/80">
                                                            <div className="flex items-center gap-6">
                                                                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
                                                                <div className="flex items-center gap-3">
                                                                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                                                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-[0.5em] italic">CORTE DEL DÍA {prevItem?.date}</span>
                                                                </div>
                                                                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                {item.isConsolidated ? (
                                                    <React.Fragment>
                                                        <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all group">
                                                            <td className="py-6 px-4 text-[12px] font-black text-slate-900 dark:text-white tabular-nums italic">{item.date}</td>
                                                            <td className="py-6 px-4 text-center">
                                                                <span className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 text-[9px] font-black rounded-lg uppercase tracking-widest shadow-sm">INGRESO</span>
                                                            </td>
                                                            <td className="py-6 px-4">
                                                                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase">CONSOLIDADO VENTAS ({item.count})</span>
                                                            </td>
                                                            <td className="py-6 px-4 text-center">
                                                                <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-1.5 rounded-full border border-indigo-100 dark:border-indigo-800">VENTA</span>
                                                            </td>
                                                            <td className="py-6 px-4">
                                                                <div 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (selectedCashDay === item.date) setSelectedCashDay(null);
                                                                        else getCashMovementsForDay(item.date);
                                                                    }}
                                                                    className="flex items-center gap-2 cursor-pointer group/btn"
                                                                >
                                                                    <span className="text-[9px] font-extrabold text-slate-400 group-hover/btn:text-indigo-600 uppercase italic transition-colors">Ver detalle</span>
                                                                    <ChevronDown className={`w-3 h-3 text-slate-300 group-hover/btn:text-indigo-400 transition-all duration-300 ${selectedCashDay === item.date ? 'rotate-180' : ''}`} />
                                                                </div>
                                                            </td>
                                                            <td className="py-6 px-4 text-center"><div className="w-2 h-2 rounded-full bg-emerald-500 mx-auto"></div></td>
                                                            <td className="py-6 px-4 text-center"><div className="w-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 mx-auto"></div></td>
                                                            <td className="py-6 px-4 text-right px-10">
                                                                <span className="text-[14px] font-black text-emerald-600 tabular-nums">S/ {Number(item.total).toFixed(2)}</span>
                                                            </td>
                                                            <td className="py-6 px-4 text-center">
                                                                <span className="text-[11px] font-bold text-slate-300 dark:text-slate-700 tabular-nums italic">0.00</span>
                                                            </td>
                                                        </tr>
                                                        <tr className={selectedCashDay === item.date ? 'bg-slate-50/20 dark:bg-slate-800/10' : ''}>
                                                            <td colSpan={11} className="p-0 border-none focus:outline-none">
                                                                <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${selectedCashDay === item.date ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                                                    <div className="overflow-hidden">
                                                                        <div className="p-8 border-x-4 border-indigo-500">
                                                                            <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-xl border border-slate-100 dark:border-slate-800">
                                                                                <table className="w-full text-left font-sans">
                                                                                    <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700">
                                                                                        <tr>
                                                                                            <th className="py-4 px-6 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Hora</th>
                                                                                            <th className="py-4 px-6 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Referencia Venta</th>
                                                                                            <th className="py-4 px-6 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Observación</th>
                                                                                            <th className="py-4 px-6 text-[9px] font-black uppercase tracking-widest text-right text-slate-500 dark:text-slate-400">Subtotal</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                                                        {loadingCashDetail ? (
                                                                                            <tr><td colSpan={4} className="py-10 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500" /></td></tr>
                                                                                        ) : cashDetailList.map(innerItem => {
                                                                                            const v = (ventas || []).find(v => v.id === innerItem.referencia_id);
                                                                                            return (
                                                                                                <tr key={innerItem.id} className="hover:bg-slate-50 transition-colors">
                                                                                                    <td className="py-4 px-6 text-[10px] font-bold text-slate-400 tabular-nums">{format(new Date(innerItem.created_at), 'HH:mm:ss')}</td>
                                                                                                    <td className="py-4 px-6">
                                                                                                        <div className="flex flex-col">
                                                                                                            <span className="text-[11px] font-black text-indigo-600 uppercase tracking-tighter">#{v?.codigo_cotizacion || innerItem.referencia_id?.slice(0,8)}</span>
                                                                                                            <span className="text-[9px] font-bold text-slate-500 uppercase">{v?.cliente_nombre}</span>
                                                                                                        </div>
                                                                                                    </td>
                                                                                                    <td className="py-4 px-6 text-[10px] font-bold text-slate-400 italic">{(innerItem.observaciones || '').toUpperCase()}</td>
                                                                                                    <td className="py-4 px-6 text-right text-[12px] font-black text-slate-900 dark:text-white tabular-nums">S/ {Number(innerItem.monto).toFixed(2)}</td>
                                                                                                </tr>
                                                                                            );
                                                                                        })}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    </React.Fragment>
                                                ) : (
                                                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all border-l-4 border-transparent hover:border-indigo-500">
                                                        <td className="py-6 px-4 text-[12px] font-black text-slate-900 dark:text-white tabular-nums italic opacity-60">{item.date}</td>
                                                        <td className="py-6 px-4 text-center">
                                                            <span className={`px-3 py-1.5 text-[9px] font-black rounded-lg uppercase tracking-widest shadow-sm ${
                                                                item.tipo_movimiento === 'EGRESO' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30'
                                                            }`}>
                                                                {item.tipo_movimiento}
                                                            </span>
                                                        </td>
                                                        <td className="py-6 px-4">
                                                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase">{item.categoria}</span>
                                                        </td>
                                                        <td className="py-6 px-4 text-center">
                                                            <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">--</span>
                                                        </td>
                                                        <td className="py-6 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 italic uppercase">
                                                            {item.observaciones}
                                                        </td>
                                                        <td className="py-6 px-4 text-center">
                                                            <div className={`w-2 h-2 rounded-full mx-auto ${item.cuenta_origen === 'Efectivo' || item.cuenta_destino === 'Efectivo' ? 'bg-indigo-500' : 'bg-slate-100'}`}></div>
                                                        </td>
                                                        <td className="py-6 px-4 text-center">
                                                            <div className={`w-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 mx-auto`}></div>
                                                        </td>
                                                        <td className="py-6 px-4 text-right">
                                                            <span className={`text-[14px] font-black tabular-nums ${item.tipo_movimiento === 'EGRESO' || item.cuenta_origen === 'Efectivo' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                                S/ {Number(item.monto).toFixed(2)}
                                                            </span>
                                                        </td>
                                                        <td className="py-6 px-4 text-center">
                                                            {item.cuenta_destino === '8059' ? (
                                                                <span className="text-[14px] font-black text-emerald-600 tabular-nums italic">
                                                                    S/ {Number(item.monto).toFixed(2)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[11px] font-bold text-slate-300 dark:text-slate-700 tabular-nums italic">0.00</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-10 pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/10 -mx-12 px-12 -mb-12 pb-12">
                            <div className="flex gap-10">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic mb-1 text-center">Entradas Totales</span>
                                    <span className="text-xl font-black text-emerald-600 tabular-nums">S/ {formatCurrency(cashOnlyMovements.filter(m => m.cuenta_destino === 'Efectivo').reduce((a, b) => a + Number(b.monto), 0))}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic mb-1 text-center">Salidas Totales</span>
                                    <span className="text-xl font-black text-rose-600 tabular-nums">S/ {formatCurrency(cashOnlyMovements.filter(m => m.cuenta_origen === 'Efectivo').reduce((a, b) => a + Number(b.monto), 0))}</span>
                                </div>
                            </div>
                            <button onClick={() => setShowCashAccountModal(false)} className="px-12 py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-black rounded-2xl uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all">Regresar</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            </div>
    </React.Fragment>
    );
};

export default SalesTreasuryPage;
