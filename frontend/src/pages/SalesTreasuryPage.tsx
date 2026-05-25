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
  History as HistoryIcon,
  X,
  ArrowRightLeft,
  Camera,
  FileText,
  Eye,
  FileSpreadsheet,
  Calendar,
  BarChart2,
  ShieldCheck,
  Edit3,
  Lock,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
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

const fmtLimaTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const highlightMatchHtml = (text: string | null | undefined, query: string): string => {
    const t = text ?? '';
    if (!query.trim() || !t) return escHtml(t);
    const idx = t.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escHtml(t);
    return (
        escHtml(t.slice(0, idx)) +
        `<mark class="bg-amber-200/80 text-amber-900 not-italic rounded-sm">${escHtml(t.slice(idx, idx + query.length))}</mark>` +
        escHtml(t.slice(idx + query.length))
    );
};

// Isolated search input: owns its own value state so keystrokes never re-render the parent.
// Debounces the parent callback to ~250 ms so filtering only kicks in when the user pauses.
const SearchInput = React.memo(({ value, onSearch, placeholder, className }: {
    value: string;
    onSearch: (v: string) => void;
    placeholder: string;
    className: string;
}) => {
    const [local, setLocal] = React.useState(value);
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    const [exitingDesglose, setExitingDesglose] = useState<string | null>(null);
    const [expandedCompra, setExpandedCompra] = useState<string | null>(null);
    const [ventaDetails, setVentaDetails] = useState<Record<string, VentaDetalle[]>>({});
    const [ventaCotizacionItems, setVentaCotizacionItems] = useState<Record<string, { descripcion: string; unidad: string; cantidad: number; total: number }[]>>({});
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
    const [showConfirmComprobanteModal, setShowConfirmComprobanteModal] = useState<VentaCabecera | null>(null);
    const [confirmComprobanteType, setConfirmComprobanteType] = useState<'FACTURA' | 'BOLETA' | 'TICKET'>('BOLETA');
    const [confirmComprobanteNumber, setConfirmComprobanteNumber] = useState('');
    const [confirmComprobanteSustentoFile, setConfirmComprobanteSustentoFile] = useState<File | null>(null);
    const [confirmComprobanteSustentoPreview, setConfirmComprobanteSustentoPreview] = useState<string | null>(null);
    const [savingConfirmComprobante, setSavingConfirmComprobante] = useState(false);
    const [confirmComprobanteAuditLogs, setConfirmComprobanteAuditLogs] = useState<any[]>([]);
    const [loadingConfirmComprobanteAuditLogs, setLoadingConfirmComprobanteAuditLogs] = useState(false);
    const [showTrailModal, setShowTrailModal] = useState<VentaCabecera | null>(null);
    const [showCashAccountModal, setShowCashAccountModal] = useState(false);
    const [isClosingCashModal, setIsClosingCashModal] = useState(false);
    const [selectedCashDay, setSelectedCashDay] = useState<string | null>(null);
    const [loadingCashDetail, setLoadingCashDetail] = useState(false);
    const [loadingTrail, setLoadingTrail] = useState(false);
    const [trailData, setTrailData] = useState<NodrizaTesoreria[]>([]);
    const [cashDetailList, setCashDetailList] = useState<NodrizaTesoreria[]>([]);
    const [showDeposit8059Modal, setShowDeposit8059Modal] = useState(false);
    const [showPayOrderModal, setShowPayOrderModal] = useState<OrdenPago | null>(null);
    const [zoomImage, setZoomImage] = useState<string | null>(null);
    const [showKardexModal, setShowKardexModal] = useState(false);
    const [isClosingKardexModal, setIsClosingKardexModal] = useState(false);
    const [kardexAccount, setKardexAccount] = useState('2049/YAPE');
    const [kardexStart, setKardexStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [kardexEnd, setKardexEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [kardexSearch, setKardexSearch] = useState('');
    const [showKardexDatePicker, setShowKardexDatePicker] = useState(false);
    const [showCashDatePicker, setShowCashDatePicker] = useState(false);
    const [ventasPage, setVentasPage] = useState(1);
    const VENTAS_PAGE_SIZE = 20;

    const [kardexPage, setKardexPage] = useState(1);
    const KARDEX_PAGE_SIZE = 20;

    useEffect(() => {
        setKardexPage(1);
    }, [kardexAccount, kardexStart, kardexEnd, kardexSearch]);

    // Egreso history state (must be declared before useScrollLock references it)
    const [showEgresoHistoryModal, setShowEgresoHistoryModal] = useState<NodrizaTesoreria | null>(null);
    const [egresoHistoryData, setEgresoHistoryData] = useState<any[]>([]);
    const [loadingEgresoHistory, setLoadingEgresoHistory] = useState(false);
    const [isClosingEgresoHistory, setIsClosingEgresoHistory] = useState(false);

    useScrollLock(showKardexModal || !!showTrailModal || showCashAccountModal || !!showCobroModal || !!showHistoryModal || !!showConfirmComprobanteModal || !!showPayOrderModal || !!showGastoModal || showTransferModal || showDeposit8059Modal || !!zoomImage || !!managingInvoice || !!showEgresoHistoryModal);
    
    // Cash Modal Filters
    const [cashFilterStart, setCashFilterStart] = useState(defaultStartOfWeek);
    const [cashFilterEnd, setCashFilterEnd] = useState(defaultEndOfWeek);
    const [tempCashFilterStart, setTempCashFilterStart] = useState(defaultStartOfWeek);
    const [tempCashFilterEnd, setTempCashFilterEnd] = useState(defaultEndOfWeek);
    const [cashQuickFilter, setCashQuickFilter] = useState<'PERSONALIZADO'|'HOY'|'ESTA_SEMANA'|'MES_ACTUAL'>('ESTA_SEMANA');

    // Form data
    const [historyData, setHistoryData] = useState<any[]>([]);
    

    const [expandedCobro, setExpandedCobro] = useState<string | null>(null);
    const [cobroTrail, setCobroTrail] = useState<Record<string, NodrizaTesoreria[]>>({});
    const [loadingCobroTrail, setLoadingCobroTrail] = useState(false);
    const [isClosingHistory, setIsClosingHistory] = useState(false);

    const closeHistoryModal = () => {
        setIsClosingHistory(true);
        setTimeout(() => {
            setShowHistoryModal(null);
            setIsClosingHistory(false);
            setExpandedCobro(null);
        }, 300);
    };

    const openEgresoHistory = async (egreso: NodrizaTesoreria) => {
        setShowEgresoHistoryModal(egreso);
        setEgresoHistoryData([]);
        setLoadingEgresoHistory(true);
        try {
            const logs = await api.getEgresoAuditLog(egreso.id);
            setEgresoHistoryData(logs);
        } catch (err) {
            console.error('Error loading egreso history', err);
        } finally {
            setLoadingEgresoHistory(false);
        }
    };

    const closeEgresoHistory = () => {
        setIsClosingEgresoHistory(true);
        setTimeout(() => {
            setShowEgresoHistoryModal(null);
            setIsClosingEgresoHistory(false);
        }, 300);
    };

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
    const kardexDatePickerRef = useRef<any>(null);
    const cashDatePickerRef = useRef<HTMLDivElement>(null);

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
            const inRangePicker = !!(event.target as Element).closest?.('[data-range-picker]');
            if (kardexDatePickerRef.current && !kardexDatePickerRef.current.contains(event.target as Node) && !inRangePicker) {
                setShowKardexDatePicker(false);
            }
            if (cashDatePickerRef.current && !cashDatePickerRef.current.contains(event.target as Node) && !inRangePicker) {
                setShowCashDatePicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const closeCashModal = () => {
        setIsClosingCashModal(true);
        setTimeout(() => {
            setShowCashAccountModal(false);
            setIsClosingCashModal(false);
        }, 300);
    };

    const closeKardexModal = () => {
        setIsClosingKardexModal(true);
        setTimeout(() => {
            setShowKardexModal(false);
            setIsClosingKardexModal(false);
        }, 300);
    };

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

    const loadData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
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
            if (!silent) setLoading(false);
        }
    }, []);

    // Real-time: reload when ventas_cabecera changes (new cotización reaches LISTO state)
    const loadDataRef = useRef(loadData);
    useEffect(() => { loadDataRef.current = loadData; }, [loadData]);
    useEffect(() => {
        const reloadDebounce = { t: null as ReturnType<typeof setTimeout> | null };
        const triggerReload = () => {
            if (reloadDebounce.t) clearTimeout(reloadDebounce.t);
            reloadDebounce.t = setTimeout(() => loadDataRef.current(true), 800);
        };
        const channel = supabase
            .channel('treasury-ventas-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas_cabecera' }, triggerReload)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cotizaciones' }, triggerReload)
            .subscribe();
        return () => {
            if (reloadDebounce.t) clearTimeout(reloadDebounce.t);
            supabase.removeChannel(channel);
        };
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

    const handleExport = async (type: 'VENTAS_PDF' | 'VENTAS_EXCEL' | 'EGRESOS_PDF' | 'EGRESOS_EXCEL' | 'VOUCHERS_PDF' | 'INVOICES_PDF') => {
        if (type === 'VOUCHERS_PDF') {
            const ventasItems = movements.filter(m => m.tipo_movimiento === 'INGRESO' && m.voucher_url).map(m => ({
                url: m.voucher_url!,
                label: `Cobro Venta #${(m as any).venta_id?.slice(0,8) || 'N/A'}`,
                date: format(new Date(m.created_at), 'dd/MM/yyyy'),
                amount: `S/ ${Number(m.monto).toFixed(2)}`
            }));
            const egresosItems = filteredCompras.filter(c => c.voucher_url).map(c => ({
                url: c.voucher_url!,
                label: `Egreso: ${c.categoria} - ${c.observaciones}`,
                date: format(new Date(c.created_at!), 'dd/MM/yyyy'),
                amount: `S/ ${Number(c.monto).toFixed(2)}`
            }));
            const items = viewMode === 'VENTAS' ? ventasItems : egresosItems;
            const fileName = viewMode === 'VENTAS' ? 'Reporte_Ventas' : 'Reporte_Egresos';
            await exportImagesToPDF('VÁUCHERES Y COMPROBANTES DE PAGO', items, `Voucheres_${fileName}`);
            setShowExportMenu(false);
            return;
        }

        if (type === 'INVOICES_PDF') {
            const items = filteredCompras.filter(c => c.invoice_url).map(c => ({
                url: c.invoice_url!,
                label: `Factura Egreso: ${c.categoria} - ${c.observaciones}`,
                date: format(new Date(c.created_at!), 'dd/MM/yyyy'),
                amount: `S/ ${Number(c.monto).toFixed(2)}`
            }));
            if (items.length === 0) {
                alert("No hay facturas o imágenes registradas en esta vista para exportar.");
                setShowExportMenu(false);
                return;
            }
            await exportImagesToPDF('FACTURAS DE EGRESOS', items, `Facturas_Reporte_Egresos`);
            setShowExportMenu(false);
            return;
        }

        if (type === 'VENTAS_PDF' || type === 'VENTAS_EXCEL') {
            const title = 'REPORTE DE VENTAS Y COBROS';
            const fileName = 'Reporte_Ventas';
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

            if (type === 'VENTAS_PDF') {
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
        } else if (type === 'EGRESOS_PDF' || type === 'EGRESOS_EXCEL') {
            const title = 'REPORTE DE EGRESOS Y COMPRAS';
            const fileName = 'Reporte_Egresos';
            const columns = ['FECHA', 'CATEGORÍA', 'CUENTA', 'DESCRIPCIÓN', 'MONTO'];
            const data = filteredCompras.map(c => [
                format(new Date(c.created_at!), 'dd/MM/yyyy'),
                c.categoria.toUpperCase(),
                (c.cuenta_origen || 'EFECTIVO').toUpperCase(),
                (c.observaciones || '').toUpperCase(),
                `S/ ${Number(c.monto).toFixed(2)}`
            ]);

            if (type === 'EGRESOS_PDF') {
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
            setExitingDesglose(ventaId);
            setTimeout(() => setExitingDesglose(null), 340);
            return;
        }
        setExitingDesglose(null);
        setExpandedVenta(ventaId);
        // Stubs (no ventas_cabecera yet) have no details to fetch
        if (!ventaDetails[ventaId] && !ventaId.startsWith('opt::')) {
            try {
                const venta = ventas.find(v => v.id === ventaId);
                const codigoCot = venta?.codigo_cotizacion;
                const [details, itemsRes] = await Promise.all([
                    api.getVentaDetalle(ventaId),
                    codigoCot
                        ? supabase
                            .from('cotizaciones_items')
                            .select('descripcion,unidad,cantidad,total,cotizaciones!inner(codigo)')
                            .eq('cotizaciones.codigo', codigoCot)
                            .order('created_at', { ascending: true })
                        : Promise.resolve({ data: null, error: null }),
                ]);
                setVentaDetails(prev => ({ ...prev, [ventaId]: details }));
                if (itemsRes.data && (itemsRes.data as any[]).length > 0) {
                    setVentaCotizacionItems(prev => ({
                        ...prev,
                        [ventaId]: (itemsRes.data as any[]).map(d => ({
                            descripcion: d.descripcion || '',
                            unidad: d.unidad || '',
                            cantidad: Number(d.cantidad) || 0,
                            total: Number(d.total) || 0,
                        })),
                    }));
                }
            } catch (error) {
                console.error("Error loading details", error);
            }
        }
    };

    // Modal logic is now inside DepositModal component

    // Modal logic is now inside special Modal components (DepositModal, Deposit8059Modal, InternalTransferModal, ExpenseModal)


    // handleConfirmTransfer logic is now isolated in InternalTransferModal component

    const handleVentaTipoChange = async (ventaId: string, newTipo: 'OBRA' | 'TABLEROS' | null, oldTipo: 'OBRA' | 'TABLEROS' | null | undefined) => {
        setVentas(prev => prev.map(v => v.id === ventaId ? { ...v, tipo_proyecto: newTipo } : v));
        try {
            await api.updateVentaTipoProyecto(ventaId, newTipo, oldTipo ?? null);
        } catch {
            setVentas(prev => prev.map(v => v.id === ventaId ? { ...v, tipo_proyecto: oldTipo ?? null } : v));
        }
    };

    const handleEgresoTipoChange = async (egresoId: string, newTipo: 'OBRA' | 'TABLEROS' | null, oldTipo: 'OBRA' | 'TABLEROS' | null | undefined) => {
        setCompras(prev => prev.map(c => c.id === egresoId ? { ...c, tipo_proyecto: newTipo } : c));
        try {
            await api.updateEgresoTipoProyecto(egresoId, newTipo, oldTipo ?? null);
        } catch {
            setCompras(prev => prev.map(c => c.id === egresoId ? { ...c, tipo_proyecto: oldTipo ?? null } : c));
        }
    };

    const openHistory = async (venta: VentaCabecera) => {
        setShowHistoryModal(venta);
        setExpandedCobro(null);
        setCobroTrail({});
        setHistoryData([]); // Clear previous
        setLoadingHistory(true);
        try {
            const data = await api.getUnifiedVentaAuditLog(venta.id, venta.codigo_cotizacion);
            setHistoryData(data);
        } catch (error) {
            console.error("Error loading history", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (!showConfirmComprobanteModal) {
            setConfirmComprobanteSustentoFile(null);
            setConfirmComprobanteSustentoPreview(prev => { 
                if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev); 
                return null; 
            });
        }
    }, [showConfirmComprobanteModal]);

    useEffect(() => {
        if (!showConfirmComprobanteModal) return;
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                        setConfirmComprobanteSustentoFile(file);
                        setConfirmComprobanteSustentoPreview(prev => {
                            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                            return URL.createObjectURL(file);
                        });
                        break;
                    }
                }
            }
        };
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [showConfirmComprobanteModal]);

    const openConfirmComprobanteModal = async (venta: VentaCabecera) => {
        setShowConfirmComprobanteModal(venta);
        setConfirmComprobanteSustentoFile(null);
        setConfirmComprobanteSustentoPreview(venta.cotizacion_sustento_comprobante_url || null);
        const docType = venta.cotizacion_tipo_documento;
        setConfirmComprobanteType(docType === 'FACTURA' ? 'FACTURA' : docType === 'TICKET' ? 'TICKET' : 'BOLETA');
        setConfirmComprobanteNumber(venta.cotizacion_numero_comprobante || '');
        setConfirmComprobanteAuditLogs([]);
        setLoadingConfirmComprobanteAuditLogs(true);
        try {
            if (venta.codigo_cotizacion) {
                const logs = await api.getUnifiedVentaAuditLog(venta.id, venta.codigo_cotizacion);
                setConfirmComprobanteAuditLogs(logs.filter(l => l.type === 'AUDIT'));
            }
        } catch (error) {
            console.error("Error loading confirm comprobante audit logs", error);
        } finally {
            setLoadingConfirmComprobanteAuditLogs(false);
        }
    };

    const handleConfirmComprobante = async () => {
        if (!showConfirmComprobanteModal) return;
        const venta = showConfirmComprobanteModal;
        if (!venta.codigo_cotizacion) {
            alert("Esta venta no tiene un código de cotización asociado");
            return;
        }
        setSavingConfirmComprobante(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            let sustentoUrl: string | null = confirmComprobanteSustentoPreview;
            if (confirmComprobanteSustentoFile) {
                sustentoUrl = await api.uploadVoucher(confirmComprobanteSustentoFile, `${venta.codigo_cotizacion}_SUSTENTO`);
            }
            await api.confirmarComprobanteVenta(
                venta.codigo_cotizacion,
                confirmComprobanteType,
                confirmComprobanteNumber,
                user?.id || null,
                sustentoUrl
            );
            setShowConfirmComprobanteModal(null);
            await loadData();
        } catch (error: any) {
            console.error("Error confirming comprobante", error);
            alert("Error al confirmar comprobante: " + error.message);
        } finally {
            setSavingConfirmComprobante(false);
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
            if (term && !v.cliente_nombre.toLowerCase().includes(term) && !(v.codigo_cotizacion || '').toLowerCase().includes(term) && !(v.cotizacion_numero_comprobante || '').toLowerCase().includes(term)) return false;
            if (filterEstado !== 'TODOS' && v.estado_pago !== filterEstado) return false;
            const fecha = new Date(v.created_at);
            return (!start || fecha >= start) && (!end || fecha <= end);
        });
    }, [ventas, deferredSearch, filterEstado, startDate, endDate]);

    // Reset to page 1 whenever filters change
    useEffect(() => { setVentasPage(1); }, [ventas, deferredSearch, filterEstado, startDate, endDate]);

    const ventasPageTotal = Math.ceil(filteredVentas.length / VENTAS_PAGE_SIZE);
    // Memoizado: evita crear un arreglo nuevo en cada render, lo que hacía que el
    // useEffect de carga por lotes (que depende de paginatedVentas) se disparara siempre.
    const paginatedVentas = useMemo(
        () => filteredVentas.slice((ventasPage - 1) * VENTAS_PAGE_SIZE, ventasPage * VENTAS_PAGE_SIZE),
        [filteredVentas, ventasPage]
    );

    // Dynamic linked purchase allocation lookup
    const linkedPurchases = useMemo(() => {
        const map: Record<string, any[]> = {};
        compras.forEach(compra => {
            const details = compra.invoice_details;
            if (Array.isArray(details)) {
                details.forEach(item => {
                    if (item.type === 'VENTA' && item.ventaId) {
                        if (!map[item.ventaId]) map[item.ventaId] = [];
                        map[item.ventaId].push({
                            ...item,
                            compraCodigo: (compra.invoice_serie && compra.invoice_correlativo) 
                                ? `${compra.invoice_serie}-${compra.invoice_correlativo}` 
                                : (compra.numero_operacion || 'Sin Código'),
                            compraProveedor: compra.observaciones || 'Proveedor Desconocido'
                        });
                    }
                });
            }
        });
        return map;
    }, [compras]);

    // Batch loading of visible sales details to avoid N+1 database queries
    useEffect(() => {
        if (paginatedVentas.length === 0) return;

        const loadBatchDetails = async () => {
            // Find which sales are missing details
            const missingDetailsIds = paginatedVentas
                .map(v => v.id)
                .filter(id => !id.startsWith('opt::') && !ventaDetails[id]);

            const missingItemsCodes = paginatedVentas
                .filter(v => v.codigo_cotizacion && !ventaCotizacionItems[v.id])
                .map(v => v.codigo_cotizacion) as string[];

            if (missingDetailsIds.length === 0 && missingItemsCodes.length === 0) {
                return; // Nothing to load
            }

            try {
                const promises: Promise<any>[] = [];

                if (missingDetailsIds.length > 0) {
                    promises.push(
                        supabase
                            .from('ventas_detalle')
                            .select('*')
                            .in('venta_id', missingDetailsIds)
                    );
                } else {
                    promises.push(Promise.resolve({ data: [] }));
                }

                if (missingItemsCodes.length > 0) {
                    promises.push(
                        supabase
                            .from('cotizaciones_items')
                            .select('descripcion, unidad, cantidad, total, cotizaciones!inner(codigo)')
                            .in('cotizaciones.codigo', missingItemsCodes)
                    );
                } else {
                    promises.push(Promise.resolve({ data: [] }));
                }

                const [detailsRes, itemsRes] = await Promise.all(promises);

                // Group details by venta_id
                const newDetails: Record<string, VentaDetalle[]> = {};
                if (detailsRes.data) {
                    (detailsRes.data as any[]).forEach(d => {
                        if (!newDetails[d.venta_id]) newDetails[d.venta_id] = [];
                        newDetails[d.venta_id].push(d);
                    });
                }

                // Fill in empty arrays for missing ones we queried so we don't query them again
                missingDetailsIds.forEach(id => {
                    if (!newDetails[id]) newDetails[id] = [];
                });

                // Group items by ventaId (mapped from cotizaciones.codigo)
                const codeToVentaId: Record<string, string> = {};
                paginatedVentas.forEach(v => {
                    if (v.codigo_cotizacion) {
                        codeToVentaId[v.codigo_cotizacion] = v.id;
                    }
                });

                const newItems: Record<string, any[]> = {};
                if (itemsRes.data) {
                    (itemsRes.data as any[]).forEach(d => {
                        const vId = codeToVentaId[d.cotizaciones?.codigo];
                        if (vId) {
                            if (!newItems[vId]) newItems[vId] = [];
                            newItems[vId].push({
                                descripcion: d.descripcion || '',
                                unidad: d.unidad || '',
                                cantidad: Number(d.cantidad) || 0,
                                total: Number(d.total) || 0,
                            });
                        }
                    });
                }

                missingItemsCodes.forEach(code => {
                    const vId = codeToVentaId[code];
                    if (vId && !newItems[vId]) newItems[vId] = [];
                });

                setVentaDetails(prev => ({ ...prev, ...newDetails }));
                setVentaCotizacionItems(prev => ({ ...prev, ...newItems }));
            } catch (error) {
                console.error("Error batch loading details", error);
            }
        };

        loadBatchDetails();
    }, [paginatedVentas]);

    // Reactive traceability calculations based on linked purchases and physical quantities sold
    const computeTraceabilityAlerts = useCallback((venta: VentaCabecera) => {
        if (venta.id.startsWith('opt::')) {
            return {
                status: 'COMPLETO',
                color: 'emerald',
                badgeText: 'Optimizado',
                tooltipText: 'Registro de venta optimizada o virtual sin trazabilidad física necesaria.'
            };
        }

        const cotItems = ventaCotizacionItems[venta.id];
        const fallbackItems = ventaDetails[venta.id];
        const desgloseRows = cotItems || fallbackItems?.map(d => ({
            descripcion: d.material_insumo,
            cantidad: d.cantidad
        })) || [];

        const purchases = linkedPurchases[venta.id] || [];

        // If no purchases linked at all -> Blind Margin
        if (purchases.length === 0) {
            return {
                status: 'MARGEN_CIEGO',
                color: 'amber',
                badgeText: '⚠️ Margen Ciego',
                tooltipText: 'No hay facturas de compra de materiales vinculadas a esta venta. El margen real de ganancia es desconocido.'
            };
        }

        // Group materials sold by their lowercase description
        const soldQtyMap: Record<string, number> = {};
        desgloseRows.forEach(row => {
            const desc = (row.descripcion || '').trim().toLowerCase();
            if (desc) {
                soldQtyMap[desc] = (soldQtyMap[desc] || 0) + Number(row.cantidad);
            }
        });

        // Group purchased items by the "ventaMaterial" lowercase name
        const purchasedQtyMap: Record<string, number> = {};
        purchases.forEach(p => {
            const mat = (p.ventaMaterial || '').trim().toLowerCase();
            if (mat) {
                purchasedQtyMap[mat] = (purchasedQtyMap[mat] || 0) + Number(p.qty);
            }
        });

        // If desgloseRows is empty but we have purchases, we can't verify quantities yet
        if (desgloseRows.length === 0) {
            return {
                status: 'COMPLETO',
                color: 'emerald',
                badgeText: '✅ Trazabilidad Completa',
                tooltipText: `Sustentado con ${purchases.length} compra(s). Cargando detalles para verificar cantidades...`
            };
        }

        // Check if there is any material sold that has sold quantity > purchased quantity
        let hasMismatch = false;
        const mismatchDetails: string[] = [];

        Object.keys(soldQtyMap).forEach(desc => {
            const soldQty = soldQtyMap[desc];
            const purchasedQty = purchasedQtyMap[desc] || 0;

            if (soldQty > purchasedQty) {
                hasMismatch = true;
                const shortDesc = desc.length > 25 ? desc.slice(0, 22) + '...' : desc;
                mismatchDetails.push(`${shortDesc}: Vendido ${soldQty.toFixed(1)}, Comprado ${purchasedQty.toFixed(1)}`);
            }
        });

        if (hasMismatch) {
            return {
                status: 'DESCALCE_FISICO',
                color: 'rose',
                badgeText: '🔴 Descalce Físico',
                tooltipText: `Descalce Físico: Cantidades vendidas superan las compras vinculadas. Detalles: ${mismatchDetails.join(' | ')}`
            };
        }

        const totalPurchasedAmount = purchases.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        return {
            status: 'COMPLETO',
            color: 'emerald',
            badgeText: '✅ Trazabilidad Completa',
            tooltipText: `Trazabilidad Completa: Todo el material vendido está respaldado por compras vinculadas (${purchases.length} factura(s), costo total de materiales S/ ${totalPurchasedAmount.toFixed(2)}).`
        };
    }, [ventaCotizacionItems, ventaDetails, linkedPurchases]);

    const filteredCompras = useMemo(() => {
        const term = deferredSearch.toLowerCase();
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;
        return compras.filter(c => {
            if (term) {
                const matchesObs = (c.observaciones || '').toLowerCase().includes(term);
                const matchesCat = (c.categoria || '').toLowerCase().includes(term);
                const matchesDesc = Array.isArray(c.invoice_details) && c.invoice_details.some((d: any) => (d.description || '').toLowerCase().includes(term));
                if (!matchesObs && !matchesCat && !matchesDesc) return false;
            }
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

    const KARDEX_ACCOUNTS = ['TODOS', 'Efectivo', '2049/YAPE', '4071', '9001', '8059'] as const;
    const KARDEX_TRACKED = ['Efectivo', '2049/YAPE', '4071', '9001', '8059'] as const;

    const kardexRows = useMemo(() => {
        const start = new Date(kardexStart + 'T00:00:00');
        const end   = new Date(kardexEnd   + 'T23:59:59');
        const acc   = kardexAccount;
        const isAll = acc === 'TODOS';
        const term  = kardexSearch.toLowerCase().trim();

        type KRow = { date: string; desc: string; numOp?: string; entrada: number; salida: number; contra: string; cuenta: string; usuario_nombre?: string | null };
        const rows: KRow[] = [];

        [...movements]
            .filter(m => { const d = new Date(m.created_at); return d >= start && d <= end; })
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .forEach(m => {
                const desc = m.observaciones || m.categoria || m.tipo_movimiento;

                if (term) {
                    const descMatch = (desc || '').toLowerCase().includes(term);
                    const contraMatch = (m.cuenta_destino || '').toLowerCase().includes(term) || (m.cuenta_origen || '').toLowerCase().includes(term);
                    const opMatch = (m.numero_operacion || '').toLowerCase().includes(term);
                    if (!descMatch && !contraMatch && !opMatch) return;
                }

                if (isAll) {
                    // Show every movement, expressing perspective of the tracked accounts.
                    // Transferencias internas between two tracked accounts produce two rows (one per side).
                    const destTracked = m.cuenta_destino && (KARDEX_TRACKED as readonly string[]).includes(m.cuenta_destino);
                    const origTracked = m.cuenta_origen  && (KARDEX_TRACKED as readonly string[]).includes(m.cuenta_origen);
                    if (destTracked) {
                        rows.push({ date: m.created_at, desc, numOp: m.numero_operacion, entrada: Number(m.monto), salida: 0, contra: m.cuenta_origen || '—', cuenta: m.cuenta_destino!, usuario_nombre: m.usuario_nombre });
                    }
                    if (origTracked) {
                        rows.push({ date: m.created_at, desc, numOp: m.numero_operacion, entrada: 0, salida: Number(m.monto), contra: m.cuenta_destino || '—', cuenta: m.cuenta_origen!, usuario_nombre: m.usuario_nombre });
                    }
                    return;
                }
                const toHere   = m.cuenta_destino === acc;
                const fromHere = m.cuenta_origen  === acc;
                if (!toHere && !fromHere) return;
                if (toHere && !fromHere) {
                    rows.push({ date: m.created_at, desc, numOp: m.numero_operacion, entrada: Number(m.monto), salida: 0, contra: m.cuenta_origen || '—', cuenta: acc, usuario_nombre: m.usuario_nombre });
                } else if (fromHere && !toHere) {
                    rows.push({ date: m.created_at, desc, numOp: m.numero_operacion, entrada: 0, salida: Number(m.monto), contra: m.cuenta_destino || '—', cuenta: acc, usuario_nombre: m.usuario_nombre });
                }
            });

        let balance = 0;
        const mappedRows = rows.map(r => { balance += r.entrada - r.salida; return { ...r, balance }; });
        return mappedRows.reverse();
    }, [movements, kardexAccount, kardexStart, kardexEnd, kardexSearch]);

    const kardexPageTotal = useMemo(() => Math.ceil(kardexRows.length / KARDEX_PAGE_SIZE), [kardexRows]);

    const paginatedKardex = useMemo(() => {
        const startIndex = (kardexPage - 1) * KARDEX_PAGE_SIZE;
        return kardexRows.slice(startIndex, startIndex + KARDEX_PAGE_SIZE);
    }, [kardexRows, kardexPage]);

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
            <div className="treasury-ui flex flex-col h-full bg-[#f7faf9] text-[#2c3434] overflow-hidden relative">
                <style>{`
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
                                    
                                    <div className={`absolute top-full right-0 mt-3 w-72 bg-white/95 backdrop-blur-2xl rounded-[28px] border border-[#d3dcdb]/40 shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden z-[100] transition-all duration-200 origin-top p-2.5 ${showExportMenu ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'}`}>
                                        <div className="px-3 py-1.5 text-[8px] font-black text-[#8b9ba5] uppercase tracking-[0.2em]">Ventas</div>
                                        <button onClick={() => { handleExport('VENTAS_PDF'); setShowExportMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#f7faf9] rounded-xl transition-all text-left group">
                                            <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform"><FileText className="w-4 h-4" /></div>
                                            <div className="flex flex-col"><span className="text-[11px] font-[900] text-[#2c3434] uppercase tracking-tight">Exportar Ventas PDF</span><span className="text-[9px] text-[#366480]/40 font-bold uppercase tracking-widest">Documento Oficial</span></div>
                                        </button>
                                        <button onClick={() => { handleExport('VENTAS_EXCEL'); setShowExportMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#f7faf9] rounded-xl transition-all text-left group">
                                            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform"><FileSpreadsheet className="w-4 h-4" /></div>
                                            <div className="flex flex-col"><span className="text-[11px] font-[900] text-[#2c3434] uppercase tracking-tight">Exportar Ventas Excel</span><span className="text-[9px] text-[#366480]/40 font-bold uppercase tracking-widest">Hoja de Cálculo</span></div>
                                        </button>
                                        <div className="px-3 py-1.5 text-[8px] font-black text-[#8b9ba5] uppercase tracking-[0.2em] mt-1 border-t border-[#d3dcdb]/20 pt-3">Egresos</div>
                                        <button onClick={() => { handleExport('EGRESOS_PDF'); setShowExportMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#f7faf9] rounded-xl transition-all text-left group">
                                            <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform"><FileText className="w-4 h-4" /></div>
                                            <div className="flex flex-col"><span className="text-[11px] font-[900] text-[#2c3434] uppercase tracking-tight">Exportar Egresos PDF</span><span className="text-[9px] text-[#366480]/40 font-bold uppercase tracking-widest">Documento Oficial</span></div>
                                        </button>
                                        <button onClick={() => { handleExport('EGRESOS_EXCEL'); setShowExportMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#f7faf9] rounded-xl transition-all text-left group">
                                            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform"><FileSpreadsheet className="w-4 h-4" /></div>
                                            <div className="flex flex-col"><span className="text-[11px] font-[900] text-[#2c3434] uppercase tracking-tight">Exportar Egresos Excel</span><span className="text-[9px] text-[#366480]/40 font-bold uppercase tracking-widest">Hoja de Cálculo</span></div>
                                        </button>
                                        <div className="px-3 py-1.5 text-[8px] font-black text-[#8b9ba5] uppercase tracking-[0.2em] mt-1 border-t border-[#d3dcdb]/20 pt-3">Documentos</div>
                                        <button onClick={() => { handleExport('VOUCHERS_PDF'); setShowExportMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#f7faf9] rounded-xl transition-all text-left group">
                                            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform"><FileText className="w-4 h-4" /></div>
                                            <div className="flex flex-col"><span className="text-[11px] font-[900] text-[#2c3434] uppercase tracking-tight">Exportar Váucheres</span><span className="text-[9px] text-[#366480]/40 font-bold uppercase tracking-widest">Comprobantes (PDF)</span></div>
                                        </button>
                                        <button onClick={() => { handleExport('INVOICES_PDF'); setShowExportMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#f7faf9] rounded-xl transition-all text-left group">
                                            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform"><FileText className="w-4 h-4" /></div>
                                            <div className="flex flex-col"><span className="text-[11px] font-[900] text-[#2c3434] uppercase tracking-tight">Exportar Facturas</span><span className="text-[9px] text-[#366480]/40 font-bold uppercase tracking-widest">Sustentos Subidos (PDF)</span></div>
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setShowKardexModal(true)}
                                    className="flex items-center gap-2 px-5 py-3 bg-[#e8eded] text-[#366480] hover:bg-[#dce3e3] rounded-xl text-[13px] font-bold transition-all"
                                >
                                    <BarChart2 className="w-4 h-4 text-[#366480]" /> <span className="leading-tight">Historial<br/>Cuentas</span>
                                </button>

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
                                onClick={() => { setIsClosingCashModal(false); setShowCashAccountModal(true); }}
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
                                        onClick={() => {
                                            startTransition(() => setViewMode(tab.id as any));
                                            if (tab.id !== 'VENTAS' && filterEstado === 'PARCIAL') setFilterEstado('TODOS');
                                        }}
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
                                    <>
                                    <table className="w-full text-left">
                                        <thead className="sticky top-0 z-10 bg-[#f7faf9]/80 backdrop-blur-md">
                                            <tr className="text-[#366480]/50 text-[13px] font-black uppercase tracking-[0.2em] border-b border-[#d3dcdb]/10">
                                                <th className="py-5 pl-4 text-left w-[17%]">Transacción / OT</th>
                                                <th className="py-5 text-left w-[11%]">Usuario</th>
                                                <th className="py-5 text-left w-[9%]">Tipo</th>
                                                <th className="py-5 text-left w-[19%]">Cliente</th>
                                                <th className="py-5 text-left w-[11%]">Monto Total</th>
                                                <th className="py-5 text-left pl-8 w-[18%]">Balance de Pago</th>
                                                <th className="py-5 text-left w-[15%]">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#d3dcdb]/10">
                                            {loading && filteredVentas.length === 0 ? <tr><td colSpan={7} className="py-20 text-center font-black animate-pulse text-[#366480]/30 uppercase tracking-[0.3em] text-[12px]">Sincronizando logic...</td></tr> : filteredVentas.length === 0 ? <tr><td colSpan={7} className="py-20 text-center font-black text-[#366480]/20 uppercase tracking-[0.3em] text-[12px]">No se encontraron registros</td></tr> : paginatedVentas.map(venta => {
                                                const isStub = venta.id.startsWith('opt::');
                                                return (
                                                    <React.Fragment key={venta.id}>
                                                        <tr className="group hover:bg-[#f0f5f4]/30 transition-all duration-300">
                                                            <td className="py-5 pl-4 text-left">
                                                                <div className="flex items-center gap-4">
                                                                    <button onClick={() => toggleExpand(venta.id)} className={`p-2 rounded-xl border transition-all ${expandedVenta === venta.id ? 'bg-[#4A90E2] text-white border-[#4A90E2]' : 'bg-white border-[#d3dcdb]/40 text-[#366480]/40 hover:text-[#4A90E2] shadow-sm'}`}>{expandedVenta === venta.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <span className="text-[16px] font-[900] text-[#2c3434] tracking-tight uppercase"
                                                                            dangerouslySetInnerHTML={{ __html: '#' + highlightMatchHtml(venta.codigo_cotizacion || venta.id.slice(0,8), deferredSearch) }}
                                                                        />
                                                                        <span className="text-[13px] font-medium text-[#366480]/60 uppercase tracking-widest">
                                                                            {format(new Date(venta.created_at), "dd MMM, yyyy")}
                                                                            <span className="normal-case tracking-normal ml-1 text-[#366480]/40">· {fmtLimaTime(venta.created_at)}</span>
                                                                        </span>
                                                                        {(() => {
                                                                            const numComp = venta.cotizacion_numero_comprobante;
                                                                            const tipoDoc = venta.cotizacion_tipo_documento;
                                                                            if (!tipoDoc && !numComp) return null;
                                                                            
                                                                            const docTypeString = tipoDoc || 'COTIZACION';
                                                                            if (numComp) {
                                                                                const letter = docTypeString.charAt(0);
                                                                                return (
                                                                                    <div className="flex items-center gap-1.5 mt-1">
                                                                                        <span className="text-[13px] font-medium text-[#2c3434]/80 bg-[#f0f5f4] border border-[#d3dcdb]/40 px-2 py-0.5 rounded-md tracking-wide shadow-sm"
                                                                                            dangerouslySetInnerHTML={{ __html: highlightMatchHtml(numComp, deferredSearch) }}
                                                                                        />
                                                                                        {docTypeString !== 'COTIZACION' && (
                                                                                            <span className="text-[12px] font-medium bg-[#4A90E2]/10 text-[#4A90E2] border border-[#4A90E2]/20 px-1.5 py-0.5 rounded-md shadow-sm" title={docTypeString}>
                                                                                                {letter}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            } else {
                                                                                if (docTypeString === 'COTIZACION') return null;
                                                                                return (
                                                                                    <span className="text-[12px] font-[900] text-[#366480]/60 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md mt-1 w-fit tracking-wide shadow-sm uppercase">
                                                                                        {docTypeString} - Asignar
                                                                                    </span>
                                                                                );
                                                                            }
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="py-5 text-left">
                                                                <span className="text-[15px] font-bold text-[#2c3434]/80 uppercase tracking-tight truncate block max-w-[120px]" title={venta.usuario_nombre || '—'}>
                                                                    {venta.usuario_nombre || '—'}
                                                                </span>
                                                            </td>
                                                            <td className="py-5 text-left">
                                                                {!isStub && (
                                                                    <select
                                                                        value={venta.tipo_proyecto || ''}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value as 'OBRA' | 'TABLEROS' | '';
                                                                            handleVentaTipoChange(venta.id, val || null, venta.tipo_proyecto);
                                                                        }}
                                                                        className={`appearance-none text-[10px] font-black uppercase px-2.5 py-1.5 rounded-xl border cursor-pointer outline-none transition-all ${
                                                                            venta.tipo_proyecto === 'OBRA'
                                                                                ? 'bg-violet-50 text-violet-700 border-violet-200'
                                                                                : venta.tipo_proyecto === 'TABLEROS'
                                                                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                                                                    : 'bg-[#f8faf9] text-[#8b9ba5] border-[#e8eded]'
                                                                        }`}
                                                                        title="Tipo de proyecto"
                                                                    >
                                                                        <option value="">— Tipo —</option>
                                                                        <option value="OBRA">OBRA</option>
                                                                        <option value="TABLEROS">TABLEROS</option>
                                                                    </select>
                                                                )}
                                                            </td>
                                                            <td className="py-5 text-left">
                                                                <p className="text-[15px] font-black text-[#2c3434] uppercase tracking-tight"
                                                                    dangerouslySetInnerHTML={{ __html: highlightMatchHtml(venta.cliente_nombre, deferredSearch) }}
                                                                />
                                                                {venta.cotizacion_descripcion && (
                                                                    <p className="text-[13px] font-medium text-slate-500 truncate max-w-[180px] mt-0.5" title={venta.cotizacion_descripcion}>
                                                                        {venta.cotizacion_descripcion}
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td className="py-5 text-left font-[900] text-[17px] text-[#2c3434] tabular-nums">
                                                                {isStub ? '—' : `S/ ${formatCurrency(venta.monto_total)}`}
                                                            </td>
                                                            <td className="py-5 pl-8 text-left">
                                                                <div className="flex items-center gap-4">
                                                                    <span className={`px-4 py-1.5 text-[12px] font-black rounded-full border tracking-widest uppercase ${isStub ? 'bg-slate-100 text-slate-400 border-slate-200' : venta.estado_pago === 'CANCELADO' ? 'bg-[#dcfce7] text-[#166534] border-[#bbf7d0]' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                                                        {isStub ? 'Listo para Corte' : venta.estado_pago}
                                                                    </span>
                                                                    {!isStub && <span className="text-[14px] font-[900] text-[#366480]/60 tabular-nums">S/ {formatCurrency(venta.saldo_pendiente)}</span>}
                                                                </div>
                                                            </td>
                                                            <td className="py-5 text-left">
                                                                <div className="flex items-center justify-start gap-3 transition-all duration-300">
                                                                    {!isStub && <button onClick={() => openHistory(venta)} title="Historial de cobros" className="p-3 bg-white text-[#366480] hover:bg-[#f0f5f4] hover:text-[#4A90E2] rounded-xl transition-all shadow-sm border border-[#d3dcdb]/20"><HistoryIcon className="w-4 h-4" /></button>}
                                                                    {!isStub && venta.codigo_cotizacion && (
                                                                        <button
                                                                            onClick={() => openConfirmComprobanteModal(venta)}
                                                                            title={venta.cotizacion_comprobante_locked ? "Comprobante verificado y bloqueado" : "Verificar/Confirmar comprobante"}
                                                                            className={`p-3 rounded-xl transition-all shadow-sm border ${
                                                                                venta.cotizacion_comprobante_locked 
                                                                                    ? "bg-emerald-50 text-emerald-600 border-emerald-200/60 hover:bg-emerald-100/60" 
                                                                                    : "bg-white text-amber-500 border-[#d3dcdb]/20 hover:bg-amber-50 hover:text-amber-600"
                                                                            }`}
                                                                        >
                                                                            {venta.cotizacion_comprobante_locked ? (
                                                                                <ShieldCheck className="w-4 h-4" />
                                                                            ) : (
                                                                                <Edit3 className="w-4 h-4" />
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                    {!isStub && Number(venta.saldo_pendiente) > 0 && <button onClick={() => setShowCobroModal(venta)} className="px-6 py-3 bg-[#4A90E2] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-[#4A90E2]/10 hover:bg-[#357ABD] transition-all">Cobrar</button>}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {(expandedVenta === venta.id || exitingDesglose === venta.id) && (
                                                            <tr>
                                                                <td colSpan={7} className="p-0 border-none bg-[#f7faf9]/30">
                                                                    <div className={`px-10 py-4 ${exitingDesglose === venta.id ? 'animate-desglose-out' : 'animate-desglose'}`}>
                                                                        <div className="bg-white border border-[#d3dcdb]/20 rounded-[24px] p-8 shadow-sm">
                                                                            <p className="text-[10px] font-black text-[#366480]/40 uppercase tracking-[0.2em] mb-6 border-b border-[#d3dcdb]/10 pb-4 italic">Desglose Técnico del Proyecto</p>
                                                                            {(() => {
                                                                                const cotItems = ventaCotizacionItems[venta.id];
                                                                                const fallbackItems = ventaDetails[venta.id];
                                                                                const desgloseRows = cotItems || fallbackItems?.map(d => ({ descripcion: d.material_insumo, unidad: '', cantidad: d.cantidad, total: d.total }));
                                                                                const subtotal = desgloseRows?.reduce((s, d) => s + d.total, 0) ?? 0;
                                                                                const igv = subtotal * 0.18;
                                                                                const grandTotal = subtotal + igv;
                                                                                return (
                                                                                    <table className="desglose-table w-full">
                                                                                        <thead className="text-[#366480]/40 uppercase border-b border-[#d3dcdb]/10">
                                                                                            <tr>
                                                                                                <th className="pb-4 text-left">Componente / Recurso</th>
                                                                                                <th className="pb-4 text-left">Cantidad</th>
                                                                                                <th className="pb-4 text-left">Unidad</th>
                                                                                                <th className="pb-4 text-left">Subtotal</th>
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody className="divide-y divide-[#d3dcdb]/10">
                                                                                            {desgloseRows?.map((det, idx) => (
                                                                                                <tr key={idx} className="hover:bg-[#f7faf9] transition-all">
                                                                                                    <td className="py-4 text-left uppercase text-[#366480]/70 tracking-tight">{det.descripcion}</td>
                                                                                                    <td className="py-4 text-left tabular-nums">{Number(det.cantidad).toFixed(2)}</td>
                                                                                                    <td className="py-4 text-left text-[#366480]/50 uppercase text-[11px] tracking-widest">{det.unidad}</td>
                                                                                                    <td className="py-4 text-left text-[#2c3434]">S/ {formatCurrency(det.total)}</td>
                                                                                                </tr>
                                                                                            ))}
                                                                                            {!ventaDetails[venta.id] && !cotItems && (
                                                                                                <tr><td colSpan={4} className="py-10 text-center"><div className="flex flex-col items-center gap-3"><RefreshCw className="w-5 h-5 animate-spin text-[#4A90E2]" /><span className="font-black text-[#366480]/20 uppercase tracking-widest text-[9px]">Consultando desglose...</span></div></td></tr>
                                                                                            )}
                                                                                            {desgloseRows && desgloseRows.length > 0 && (
                                                                                                <>
                                                                                                    <tr className="border-t-2 border-[#d3dcdb]/20">
                                                                                                        <td colSpan={3} className="pt-4 pb-1 text-right text-[10px] font-black text-[#366480]/50 uppercase tracking-widest pr-4">Subtotal</td>
                                                                                                        <td className="pt-4 pb-1 text-left text-[#2c3434] font-black tabular-nums">S/ {formatCurrency(subtotal)}</td>
                                                                                                    </tr>
                                                                                                    <tr>
                                                                                                        <td colSpan={3} className="py-1 text-right text-[10px] font-black text-[#366480]/50 uppercase tracking-widest pr-4">IGV (18%)</td>
                                                                                                        <td className="py-1 text-left text-[#2c3434] font-black tabular-nums">S/ {formatCurrency(igv)}</td>
                                                                                                    </tr>
                                                                                                    <tr className="border-t border-[#d3dcdb]/20">
                                                                                                        <td colSpan={3} className="pt-3 text-right text-[11px] font-black text-[#2c3434] uppercase tracking-widest pr-4">Total</td>
                                                                                                        <td className="pt-3 text-left text-[15px] font-black text-[#2c3434] tabular-nums">S/ {formatCurrency(grandTotal)}</td>
                                                                                                    </tr>
                                                                                                </>
                                                                                            )}
                                                                                        </tbody>
                                                                                    </table>
                                                                                );
                                                                            })()}
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
                                    {ventasPageTotal > 1 && (
                                        <div className="flex items-center justify-center gap-2 py-6">
                                            <button
                                                onClick={() => setVentasPage(p => Math.max(1, p - 1))}
                                                disabled={ventasPage === 1}
                                                className="px-3 py-2 rounded-xl text-[11px] font-black text-[#366480] hover:bg-[#f0f5f4] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                            >
                                                <ChevronDown className="w-4 h-4 rotate-90" />
                                            </button>
                                            {Array.from({ length: ventasPageTotal }, (_, i) => i + 1).map(page => (
                                                <button
                                                    key={page}
                                                    onClick={() => setVentasPage(page)}
                                                    className={`w-8 h-8 rounded-xl text-[11px] font-black transition-all ${ventasPage === page ? 'bg-[#244c66] text-white shadow-sm' : 'text-[#366480]/60 hover:bg-[#f0f5f4]'}`}
                                                >
                                                    {page}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => setVentasPage(p => Math.min(ventasPageTotal, p + 1))}
                                                disabled={ventasPage === ventasPageTotal}
                                                className="px-3 py-2 rounded-xl text-[11px] font-black text-[#366480] hover:bg-[#f0f5f4] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                            >
                                                <ChevronDown className="w-4 h-4 -rotate-90" />
                                            </button>
                                        </div>
                                    )}
                                    </>
                                )}
                                {viewMode === 'COMPRAS' && (
                                    <table className="w-full text-left">
                                        <thead className="sticky top-0 z-10 bg-[#f7faf9]/80 backdrop-blur-md">
                                            <tr className="text-[#366480]/50 text-[13px] font-black uppercase tracking-[0.2em] border-b border-[#d3dcdb]/10">
                                                <th className="py-5 pl-4 text-left w-[13%]">Registro</th>
                                                <th className="py-5 text-left w-[11%]">Usuario</th>
                                                <th className="py-5 text-left w-[8%]">Tipo</th>
                                                <th className="py-5 text-left w-[14%]">Clasificación</th>
                                                <th className="py-5 text-left w-[12%]">Documento</th>
                                                <th className="py-5 text-left w-[18%]">Descripción</th>
                                                <th className="py-5 text-left w-[12%]">Monto</th>
                                                <th className="py-5 text-left w-[12%]">Gestión</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#d3dcdb]/10">
                                            {loading && filteredCompras.length === 0 ? <tr><td colSpan={8} className="py-20 text-center font-black animate-pulse text-[#366480]/30 uppercase tracking-[0.3em] text-[12px]">Escaneando egresos...</td></tr> : filteredCompras.length === 0 ? <tr><td colSpan={8} className="py-20 text-center font-black text-[#366480]/20 uppercase tracking-[0.3em] text-[12px]">Sin movimientos registrados</td></tr> : filteredCompras.map(compra => (
                                                <React.Fragment key={compra.id}>
                                                    <tr className="group hover:bg-[#fff0f2]/30 transition-all duration-300">
                                                        <td className="py-5 pl-4 text-left">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[15px] font-medium text-[#2c3434] uppercase">
                                                                    {format(new Date(compra.created_at!), "dd MMM, yyyy")}
                                                                </span>
                                                                <span className="text-[12px] font-medium text-[#366480]/50 tracking-wider">
                                                                    {fmtLimaTime(compra.created_at!)}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-5 text-left">
                                                            <span className="text-[15px] font-bold text-[#2c3434]/80 uppercase truncate block max-w-[110px]" title={compra.usuario_nombre || '—'}>
                                                                {compra.usuario_nombre || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="py-5 text-left">
                                                            <select
                                                                value={compra.tipo_proyecto || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value as 'OBRA' | 'TABLEROS' | '';
                                                                    handleEgresoTipoChange(compra.id, val || null, compra.tipo_proyecto);
                                                                }}
                                                                className={`appearance-none text-[10px] font-black uppercase px-2.5 py-1.5 rounded-xl border cursor-pointer outline-none transition-all ${
                                                                    compra.tipo_proyecto === 'OBRA'
                                                                        ? 'bg-violet-50 text-violet-700 border-violet-200'
                                                                        : compra.tipo_proyecto === 'TABLEROS'
                                                                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                                                                            : 'bg-[#f8faf9] text-[#8b9ba5] border-[#e8eded]'
                                                                }`}
                                                                title="Tipo de proyecto"
                                                            >
                                                                <option value="">— Tipo —</option>
                                                                <option value="OBRA">OBRA</option>
                                                                <option value="TABLEROS">TABLEROS</option>
                                                            </select>
                                                        </td>
                                                        <td className="py-5 text-left">
                                                            <span className="px-4 py-1.5 bg-white text-[#366480] text-[12px] font-black rounded-full uppercase border border-[#d3dcdb]/40 tracking-widest shadow-sm">{compra.categoria}</span>
                                                        </td>
                                                        <td className="py-5 text-left">
                                                            {compra.invoice_status === 'REGISTRADO' ? (
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#dcfce7] text-[#166534] text-[12px] font-black rounded-full uppercase tracking-tighter border border-[#bbf7d0]">
                                                                    <Lock className="w-3 h-3 shrink-0" />
                                                                    Factura Registrada
                                                                </span>
                                                            ) : compra.has_invoice ? (
                                                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#dcfce7] text-[#166534] text-[12px] font-black rounded-full uppercase tracking-tighter border border-[#bbf7d0]">Factura Registrada</span>
                                                            ) : (
                                                                <span className="text-[12px] font-black text-[#366480]/40 uppercase tracking-[0.2em]">S/D Fiscal</span>
                                                            )}
                                                        </td>
                                                        <td className="py-5 text-left">
                                                            {Array.isArray(compra.invoice_details) && compra.invoice_details.length > 0 ? (
                                                                <ul className="space-y-0.5">
                                                                    {compra.invoice_details.map((item: any, idx: number) => (
                                                                        <li key={idx} className="flex items-start gap-1.5 text-[13px] font-bold uppercase text-[#366480] tracking-tight leading-snug">
                                                                            <span className="text-[#4A90E2] shrink-0 mt-px select-none">·</span>
                                                                            <span className="whitespace-pre-wrap">{item.description}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <span className="text-[15px] font-bold uppercase text-[#366480] tracking-tight">{compra.observaciones}</span>
                                                            )}
                                                        </td>
                                                        <td className="py-5 text-left font-[900] text-rose-500 text-[17px] tabular-nums">S/ {formatCurrency(compra.monto)}</td>
                                                        <td className="py-5 text-left">
                                                            <div className="flex items-center justify-start gap-3 transition-all">
                                                                <button onClick={() => setManagingInvoice(compra)} title="Gestionar factura" className="p-3 bg-white border border-[#d3dcdb]/20 text-[#366480] hover:bg-[#f0f5f4] hover:text-[#4A90E2] rounded-xl transition-all shadow-sm"><Search className="w-4 h-4" /></button>
                                                                <button onClick={() => openEgresoHistory(compra)} title="Historial del egreso" className="p-3 bg-white border border-[#d3dcdb]/20 text-[#366480] hover:bg-[#f0f5f4] hover:text-[#4A90E2] rounded-xl transition-all shadow-sm"><HistoryIcon className="w-4 h-4" /></button>
                                                                <button onClick={() => setExpandedCompra(expandedCompra === compra.id ? null : compra.id)} className={`p-3 rounded-xl transition-all shadow-sm border ${expandedCompra === compra.id ? 'bg-[#366480] text-white border-[#366480]' : 'bg-white border-[#d3dcdb]/20 text-[#366480] hover:bg-[#f0f5f4] hover:text-[#4A90E2]'}`}><ChevronDown className={`w-4 h-4 transition-transform ${expandedCompra === compra.id ? 'rotate-180' : ''}`} /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {expandedCompra === compra.id && (
                                                        <tr>
                                                            <td colSpan={8} className="p-0 border-none bg-[#fff0f2]/20">
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
                                            <tr className="text-[#366480]/50 text-[11px] font-black uppercase tracking-[0.2em] border-b border-[#d3dcdb]/10">
                                                <th className="py-5 pl-4 text-left w-[20%]">Cod. / Emisión</th>
                                                <th className="py-5 text-left w-[35%]">Proveedor / Obra</th>
                                                <th className="py-5 text-left w-[15%]">Monto Total</th>
                                                <th className="py-5 text-left w-[15%]">Estado</th>
                                                <th className="py-5 text-left w-[15%]">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#d3dcdb]/10">
                                            {loading && filteredOrdenes.length === 0 ? <tr><td colSpan={5} className="py-20 text-center font-black animate-pulse text-[#366480]/30 uppercase tracking-[0.3em] text-[12px]">Recuperando requerimientos...</td></tr> : filteredOrdenes.length === 0 ? <tr><td colSpan={5} className="py-20 text-center font-black text-[#366480]/20 uppercase tracking-[0.3em] text-[12px]">No hay órdenes pendientes</td></tr> : filteredOrdenes.map(op => (
                                                <tr key={op.id} className="hover:bg-amber-50/20 transition-all group duration-300">
                                                    <td className="py-5 pl-4 text-left">
                                                        <div className="flex flex-col">
                                                            <span className="text-[14px] font-[900] text-[#2c3434] uppercase tracking-tight">#{op.codigo_orden}</span>
                                                            <span className="text-[11px] font-bold text-[#366480]/50 uppercase tracking-widest">{format(new Date(op.created_at!), "dd MMM, yyyy")}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-5 text-left">
                                                        <div className="flex flex-col">
                                                            <span className="text-[13px] font-black text-[#366480] uppercase tracking-tight leading-tight">{op.proveedor?.razon_social}</span>
                                                            <span className="text-[11px] font-bold text-[#366480]/50 uppercase tracking-widest italic mt-0.5">{op.obra_nombre}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-5 text-left">
                                                        <span className="text-[15px] font-[900] text-[#2c3434] tabular-nums">{op.moneda === 'PEN' ? 'S/' : '$'} {formatCurrency(op.monto_total)}</span>
                                                    </td>
                                                    <td className="py-5 text-left">
                                                        <span className={`px-4 py-1.5 text-[10px] font-black rounded-full uppercase tracking-widest border shadow-sm ${op.estado === 'pagado' ? 'bg-[#dcfce7] text-[#166534] border-[#bbf7d0]' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>{op.estado}</span>
                                                    </td>
                                                    <td className="py-5 text-left">
                                                        <div className="flex justify-start transition-all duration-300">
                                                            <button onClick={() => setShowPayOrderModal(op)} className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${op.estado === 'pagado' ? 'bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0]' : 'bg-[#4A90E2] text-white shadow-lg shadow-[#4A90E2]/10 hover:bg-[#357ABD]'}`}>
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
                    (() => {
                        const sortedHistory = historyData.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                        const ventaTotal = Number(showHistoryModal.monto_total);
                        let running = ventaTotal;
                        let cobroIndex = 0;
                        const rows = sortedHistory.map(item => {
                            if (item.type === 'COBRO') {
                                cobroIndex++;
                                running = running - Number(item.monto);
                                const saldoDespues = Math.max(0, running);
                                return { ...item, saldoDespues, index: cobroIndex };
                            }
                            return item;
                        });
                        // Reverse the items so newest shows first
                        const reversedRows = rows.slice().reverse();
                        return (
                            <div
                                className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/30 overflow-hidden ${isClosingHistory ? 'animate-backdrop-out' : 'animate-backdrop'}`}
                                style={{ backdropFilter: 'blur(8px)', fontFamily: "'Manrope', sans-serif" }}
                            >
                                <div className={`bg-white/75 backdrop-blur-xl rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.15)] w-full max-w-lg border border-white/60 flex flex-col max-h-[90vh] relative overflow-hidden ${isClosingHistory ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/60 z-10"></div>

                                    {/* Header */}
                                    <div className="px-5 py-4 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-[#4A90E2] flex items-center justify-center shadow-sm">
                                                <HistoryIcon className="w-4 h-4 text-white" />
                                            </div>
                                            <div>
                                                <h2 className="text-[20px] font-black text-[#2c3434] uppercase tracking-tight">Historial de la Venta</h2>
                                                <p className="text-[14px] font-semibold text-[#8b9ba5] uppercase tracking-widest mt-0.5">{showHistoryModal.cliente_nombre}</p>
                                            </div>
                                        </div>
                                        <button onClick={closeHistoryModal} className="w-8 h-8 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Totals strip */}
                                    <div className="px-5 py-3 border-b border-[#d3dcdb]/20 bg-white/30 flex items-center gap-5">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-semibold text-[#8b9ba5] uppercase tracking-wider">Monto Total</span>
                                            <span className="text-[16px] font-bold text-[#2c3434] tabular-nums">S/ {ventaTotal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="w-px h-8 bg-[#e8eded]" />
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-semibold text-[#8b9ba5] uppercase tracking-wider">Saldo Pendiente</span>
                                            <span className={`text-[16px] font-bold tabular-nums ${Number(showHistoryModal.saldo_pendiente) > 0 ? 'text-[#366480]' : 'text-[#166534]'}`}>S/ {Number(showHistoryModal.saldo_pendiente).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 custom-scrollbar">
                                        {loadingHistory ? (
                                            <div className="py-10 flex flex-col items-center gap-3">
                                                <RefreshCw className="w-5 h-5 animate-spin text-[#4A90E2]" />
                                                <p className="text-[#8b9ba5] font-semibold uppercase tracking-widest text-[15px]">Consultando historial...</p>
                                            </div>
                                        ) : reversedRows.length === 0 ? (
                                            <div className="py-10 text-center border-2 border-dashed border-[#e8eded] rounded-2xl">
                                                <p className="text-[#8b9ba5] font-semibold uppercase tracking-widest text-[13px] italic">No hay registros en el historial</p>
                                            </div>
                                        ) : reversedRows.map((item) => {
                                            if (item.type === 'COBRO') {
                                                const cobro = item;
                                                const isExpanded = expandedCobro === cobro.id;
                                                const isEfectivo = cobro.cuenta_destino === 'Efectivo';
                                                return (
                                                    <div key={cobro.id} className={`rounded-2xl border bg-white/60 transition-all ${isExpanded ? 'border-[#4A90E2]/40 shadow-sm' : 'border-[#e8eded]'}`}>
                                                        <div
                                                            onClick={() => toggleCobroTrail(cobro.id)}
                                                            className="grid grid-cols-2 gap-3 px-3.5 py-3 cursor-pointer items-center"
                                                        >
                                                            {/* Left: ingreso */}
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); toggleCobroTrail(cobro.id); }}
                                                                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all ${isExpanded ? 'bg-[#4A90E2] text-white rotate-180' : 'bg-[#f0f5f4] text-[#8b9ba5] hover:bg-[#e8eded]'}`}
                                                                >
                                                                    <ChevronDown className="w-3.5 h-3.5" />
                                                                </button>
                                                                <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${isEfectivo ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                                                    {isEfectivo ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="text-[11px] font-semibold text-[#8b9ba5] uppercase tracking-wider">Ingreso #{cobro.index}</span>
                                                                    <span className="text-[16px] font-bold tabular-nums text-emerald-600 leading-tight">+ S/ {Number(cobro.monto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                                                                    <span className="text-[11px] font-semibold text-[#8b9ba5] uppercase tracking-wider truncate">{format(new Date(cobro.created_at), "dd MMM yyyy · HH:mm", { locale: es })}</span>
                                                                </div>
                                                            </div>
                                                            {/* Right: saldo restante */}
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[11px] font-semibold text-[#8b9ba5] uppercase tracking-wider">Saldo Restante</span>
                                                                <span className={`text-lg font-bold tabular-nums leading-tight ${cobro.saldoDespues === 0 ? 'text-[#166534]' : 'text-[#366480]'}`}>S/ {cobro.saldoDespues.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                                                                <span className="text-[11px] font-semibold text-[#8b9ba5] uppercase tracking-wider truncate max-w-[140px]">{cobro.cuenta_destino}</span>
                                                            </div>
                                                        </div>

                                                        {isExpanded && (
                                                            <div className="px-3.5 pb-3.5 pt-2 border-t border-[#e8eded]/60 animate-in fade-in slide-in-from-top-1 duration-200">
                                                                {cobro.motivo_excedente && (
                                                                    <div className="mb-2.5 text-[13px] font-semibold text-rose-500 bg-rose-50/70 px-2.5 py-2 rounded-lg border border-rose-100 uppercase tracking-wide">
                                                                        Excedente: {cobro.motivo_excedente}
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-[11px] font-semibold text-[#8b9ba5] uppercase tracking-wider">N° Operación</p>
                                                                        <p className="text-[14px] font-bold font-mono text-[#2c3434] truncate">
                                                                            {cobro.numero_operacion ? `#${cobro.numero_operacion}` : '—'}
                                                                        </p>
                                                                    </div>
                                                                    {cobro.voucher_url ? (
                                                                        <div
                                                                            onClick={(e) => { e.stopPropagation(); setZoomImage(cobro.voucher_url!); }}
                                                                            className="shrink-0 w-16 h-16 rounded-lg overflow-hidden cursor-zoom-in border border-white shadow-sm hover:scale-105 transition-transform"
                                                                        >
                                                                            <img src={cobro.voucher_url} className="w-full h-full object-cover" />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="shrink-0 w-16 h-16 rounded-lg border border-dashed border-[#e8eded] bg-[#f8faf9] flex items-center justify-center">
                                                                            <Camera className="w-4 h-4 text-[#d3dcdb]" />
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {loadingCobroTrail && !cobroTrail[cobro.id] && (
                                                                    <div className="mt-2.5 flex items-center gap-2 text-[#8b9ba5] text-[13px] font-semibold uppercase tracking-widest">
                                                                        <RefreshCw className="w-3 h-3 animate-spin" /> Rastreando fondos...
                                                                    </div>
                                                                )}
                                                                {cobroTrail[cobro.id] && cobroTrail[cobro.id].length > 0 && (
                                                                    <div className="mt-2.5 space-y-1.5">
                                                                        <p className="text-[11px] font-semibold text-[#8b9ba5] uppercase tracking-wider mb-1">Ruta del Depósito</p>
                                                                        {cobroTrail[cobro.id].map((m, i) => (
                                                                            <div key={m.id} className="flex items-center gap-2 px-2.5 py-2 bg-white/70 rounded-lg border border-[#e8eded]/70">
                                                                                <span className="w-5 h-5 rounded-full bg-[#4A90E2]/10 text-[#4A90E2] flex items-center justify-center text-[11px] font-bold">{i + 1}</span>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-[13px] font-bold uppercase text-[#2c3434] truncate">
                                                                                        {m.tipo_movimiento === 'INGRESO'
                                                                                            ? (sortedHistory.filter(h => h.type === 'COBRO')[0]?.id === cobro.id ? 'PAGO INICIAL' : 'AMORTIZACIÓN')
                                                                                            : m.tipo_movimiento}
                                                                                    </p>
                                                                                    <p className="text-[11px] text-[#8b9ba5] truncate">{m.cuenta_destino || m.cuenta_origen}</p>
                                                                                </div>
                                                                                <span className={`text-[14px] font-bold tabular-nums ${m.tipo_movimiento === 'INGRESO' ? 'text-emerald-600' : 'text-[#2c3434]'}`}>S/ {Number(m.monto).toFixed(2)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            } else {
                                                const audit = item;
                                                const isDocType = audit.campo === 'tipo_documento';
                                                const isNumComp = audit.campo === 'numero_comprobante';
                                                const isLock = audit.campo === 'comprobante_locked';
                                                const isTipoProyecto = audit.campo === 'tipo_proyecto';

                                                let title = "Modificación de Comprobante";
                                                let content = "";
                                                let iconColor = "bg-sky-50 text-sky-500 border-sky-100";

                                                if (isTipoProyecto) {
                                                    title = "Tipo de Proyecto Asignado";
                                                    const anterior = audit.valor_anterior || 'Sin asignar';
                                                    const nuevo = audit.valor_nuevo || 'Sin asignar';
                                                    content = `Tipo de proyecto cambiado de "${anterior}" a "${nuevo}"`;
                                                    iconColor = audit.valor_nuevo === 'OBRA'
                                                        ? 'bg-violet-50 text-violet-600 border-violet-200/50'
                                                        : 'bg-sky-50 text-sky-600 border-sky-200/50';
                                                } else if (isDocType) {
                                                    title = "Tipo de Documento Modificado";
                                                    content = `Tipo de documento cambiado de "${audit.valor_anterior || 'COTIZACION'}" a "${audit.valor_nuevo}"`;
                                                    iconColor = "bg-[#4A90E2]/10 text-[#4A90E2] border-[#4A90E2]/20";
                                                } else if (isNumComp) {
                                                    title = "N° de Comprobante Modificado";
                                                    content = `Número de comprobante corregido de "${audit.valor_anterior || '—'}" a "${audit.valor_nuevo || '—'}"`;
                                                    iconColor = "bg-amber-50 text-amber-600 border-amber-200/50";
                                                } else if (isLock) {
                                                    title = "Comprobante Ratificado y Bloqueado";
                                                    content = "Comprobante verificado y bloqueado para edición por el vendedor";
                                                    iconColor = "bg-emerald-50 text-emerald-600 border-emerald-200/50";
                                                }
                                                
                                                return (
                                                    <div key={audit.id} className="rounded-2xl border border-slate-100 bg-[#f8faf9]/50 p-4 transition-all shadow-sm flex items-start gap-3 text-left">
                                                        <div className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center ${iconColor}`}>
                                                            {isLock ? <Lock className="w-4.5 h-4.5" /> : <FileText className="w-4.5 h-4.5" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-[17px] font-bold text-slate-800 tracking-tight">{title}</span>
                                                                <span className="text-[14px] font-medium text-slate-400 tabular-nums">
                                                                    {format(new Date(audit.created_at), "dd/MM/yyyy · HH:mm", { locale: es })}
                                                                </span>
                                                            </div>
                                                            <p className="text-[14px] font-medium text-slate-500 mt-1 leading-relaxed">{content}</p>
                                                            <div className="flex items-center gap-1 mt-2 text-[11px] font-bold text-[#366480] uppercase tracking-wider bg-[#366480]/5 px-2 py-0.5 rounded w-fit">
                                                                <span>Por: {audit.usuario_nombre}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })(),
                    document.body
                )}

                {/* ── HISTORIAL DE EGRESO MODAL ──────────────────────────────────── */}
                {showEgresoHistoryModal && createPortal(
                    <div
                        className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/30 overflow-hidden ${isClosingEgresoHistory ? 'animate-backdrop-out' : 'animate-backdrop'}`}
                        style={{ backdropFilter: 'blur(8px)', fontFamily: "'Manrope', sans-serif" }}
                    >
                        <div className={`bg-[#f4f8f8] rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.15)] w-full max-w-lg border border-[#d3dcdb]/60 flex flex-col max-h-[90vh] relative overflow-hidden ${isClosingEgresoHistory ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/80 z-10"></div>

                            {/* Header */}
                            <div className="px-5 py-4 border-b border-[#d3dcdb]/40 flex items-center justify-between bg-white">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center shadow-sm shrink-0">
                                        <HistoryIcon className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-[20px] font-black text-[#2c3434] uppercase tracking-tight">Historial del Egreso</h2>
                                        <p className="text-[14px] font-semibold text-[#5a7080] uppercase tracking-widest mt-0.5">
                                            {showEgresoHistoryModal.categoria} · S/ {Number(showEgresoHistoryModal.monto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>
                                <button onClick={closeEgresoHistory} className="w-9 h-9 rounded-full text-[#5a7080] hover:text-[#2c3434] hover:bg-[#e8eded] flex items-center justify-center transition-all">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Metadata strip */}
                            <div className="px-5 py-3.5 border-b border-[#d3dcdb]/40 bg-[#eef3f4] flex items-center gap-6 shrink-0">
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-semibold text-[#5a7080] uppercase tracking-wider">Cuenta</span>
                                    <span className="text-[16px] font-bold text-[#2c3434] uppercase">{showEgresoHistoryModal.cuenta_origen || 'Efectivo'}</span>
                                </div>
                                <div className="w-px h-9 bg-[#d3dcdb]" />
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-semibold text-[#5a7080] uppercase tracking-wider">Estado Factura</span>
                                    <span className={`text-[16px] font-bold uppercase ${showEgresoHistoryModal.invoice_status === 'REGISTRADO' ? 'text-emerald-600' : 'text-amber-500'}`}>
                                        {showEgresoHistoryModal.invoice_status === 'REGISTRADO' ? 'Registrada' : 'Sin factura'}
                                    </span>
                                </div>
                                {showEgresoHistoryModal.proveedor_nombre && (
                                    <>
                                        <div className="w-px h-9 bg-[#d3dcdb]" />
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[11px] font-semibold text-[#5a7080] uppercase tracking-wider">Proveedor</span>
                                            <span className="text-[16px] font-bold text-[#2c3434] uppercase truncate max-w-[180px]">{showEgresoHistoryModal.proveedor_nombre}</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Timeline */}
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 custom-scrollbar">
                                {loadingEgresoHistory ? (
                                    <div className="py-10 flex flex-col items-center gap-3">
                                        <RefreshCw className="w-5 h-5 animate-spin text-rose-400" />
                                        <p className="text-[#5a7080] font-semibold uppercase tracking-widest text-[15px]">Consultando historial...</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Audit log entries (newest first) */}
                                        {egresoHistoryData.map((log: any) => {
                                            const isFactura = log.evento === 'FACTURA_REGISTRADA';
                                            const iconColor = isFactura
                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200/50'
                                                : 'bg-[#4A90E2]/10 text-[#4A90E2] border-[#4A90E2]/20';
                                            const title = isFactura ? 'Factura Registrada y Bloqueada' : log.evento.replace(/_/g, ' ');
                                            return (
                                                <div key={log.id} className="rounded-2xl border border-[#d3dcdb]/60 bg-white p-4 shadow-sm flex items-start gap-3">
                                                    <div className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center ${iconColor}`}>
                                                        {isFactura ? <CheckCircle2 className="w-5 h-5" /> : <FileSpreadsheet className="w-5 h-5" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                                            <span className="text-[17px] font-bold text-[#1a2a35] tracking-tight capitalize">{title}</span>
                                                            <span className="text-[14px] font-medium text-[#5a7080] tabular-nums shrink-0">
                                                                {format(new Date(log.created_at), "dd/MM/yyyy · HH:mm", { locale: es })}
                                                            </span>
                                                        </div>
                                                        {log.detalle && (
                                                            <p className="text-[15px] font-medium text-[#366480] mt-1 leading-relaxed">{log.detalle}</p>
                                                        )}
                                                        <div className="flex items-center gap-1 mt-2 text-[13px] font-bold text-[#366480] uppercase tracking-wider bg-[#366480]/10 px-2.5 py-1 rounded-lg w-fit">
                                                            <span>Por: {log.usuario_nombre || 'Sistema'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Synthesized creation event (always at the bottom) */}
                                        <div className="rounded-2xl border border-[#d3dcdb]/60 bg-[#eef3f4] p-4 shadow-sm flex items-start gap-3 opacity-85">
                                            <div className="shrink-0 w-10 h-10 rounded-lg border bg-[#e8eded] text-[#366480] border-[#d3dcdb] flex items-center justify-center">
                                                <TrendingDown className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <span className="text-[17px] font-bold text-[#2c3434] tracking-tight">Egreso Registrado</span>
                                                    <span className="text-[14px] font-medium text-[#5a7080] tabular-nums shrink-0">
                                                        {format(new Date(showEgresoHistoryModal.created_at), "dd/MM/yyyy · HH:mm", { locale: es })}
                                                    </span>
                                                </div>
                                                <p className="text-[15px] font-medium text-[#366480] mt-1">
                                                    S/ {Number(showEgresoHistoryModal.monto).toFixed(2)} · {showEgresoHistoryModal.categoria}
                                                    {showEgresoHistoryModal.observaciones ? ` · ${showEgresoHistoryModal.observaciones}` : ''}
                                                </p>
                                                <div className="flex items-center gap-1 mt-2 text-[13px] font-bold text-[#366480] uppercase tracking-wider bg-[#366480]/10 px-2.5 py-1 rounded-lg w-fit">
                                                    <span>Por: {showEgresoHistoryModal.usuario_nombre || 'Sistema'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {egresoHistoryData.length === 0 && (
                                            <div className="py-3"></div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-5 py-4 border-t border-[#d3dcdb]/40 bg-white shrink-0 flex justify-end">
                                <button onClick={closeEgresoHistory} className="px-5 py-2.5 rounded-xl text-[14px] font-medium uppercase tracking-wider text-[#5a7080] hover:text-rose-500 transition-all">
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showConfirmComprobanteModal && createPortal(
                    <div
                        className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/30 overflow-hidden animate-backdrop"
                        style={{ backdropFilter: 'blur(8px)', fontFamily: "'Manrope', sans-serif" }}
                    >
                        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.15)] w-full max-w-md border border-white/60 flex flex-col max-h-[90vh] relative overflow-hidden animate-modal-panel">
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/60 z-10"></div>

                            {/* Header */}
                            <div className="px-5 py-4 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm">
                                        <Edit3 className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-[20px] font-black text-[#2c3434] uppercase tracking-tight">Verificar Comprobante</h2>
                                        <p className="text-[14px] font-semibold text-[#8b9ba5] uppercase tracking-widest mt-0.5">
                                            Venta: {showConfirmComprobanteModal.cliente_nombre}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowConfirmComprobanteModal(null)}
                                    className="w-8 h-8 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
                                {/* Locking status alert */}
                                {showConfirmComprobanteModal.cotizacion_comprobante_locked ? (
                                    <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl flex gap-3 text-left">
                                        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-[14px] font-bold text-emerald-800">Comprobante verificado y bloqueado</p>
                                            <p className="text-[13px] text-emerald-600 mt-0.5 leading-relaxed">
                                                Los vendedores ya no pueden editar esta información. Como tesorero, puedes realizar correcciones administrativas si es necesario.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-2xl flex gap-3 text-left">
                                        <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-[14px] font-bold text-amber-800">Comprobante pendiente de verificación</p>
                                            <p className="text-[13px] text-amber-600 mt-0.5 leading-relaxed">
                                                Al confirmar y bloquear, esta información quedará inmutable para los vendedores en la sección de Cotizaciones.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Document Type */}
                                <div className="space-y-2 text-left">
                                    <label className="text-[13px] font-semibold text-[#8b9ba5] uppercase tracking-wider block">Tipo de Documento</label>
                                    <select
                                        value={confirmComprobanteType}
                                        onChange={(e) => setConfirmComprobanteType(e.target.value as 'FACTURA' | 'BOLETA' | 'TICKET')}
                                        className="w-full px-4 py-3 bg-[#f8faf9] border border-[#e8eded] rounded-xl text-sm font-semibold text-[#2c3434] focus:outline-none focus:border-[#4A90E2] focus:bg-white transition-colors cursor-pointer appearance-none"
                                    >
                                        <option value="BOLETA">Boleta</option>
                                        <option value="FACTURA">Factura</option>
                                        <option value="TICKET">Ticket</option>
                                    </select>
                                </div>

                                {/* Voucher Number */}
                                <div className="space-y-2 text-left">
                                    <label className="text-[13px] font-semibold text-[#8b9ba5] uppercase tracking-wider block">N° de Comprobante</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={confirmComprobanteNumber}
                                            onChange={(e) => setConfirmComprobanteNumber(e.target.value)}
                                            placeholder="N° de comprobante de pago..."
                                            className="w-full px-4 py-3 bg-[#f8faf9] border border-[#e8eded] rounded-xl text-sm font-medium text-[#2c3434] placeholder-slate-400 focus:outline-none focus:border-[#4A90E2] focus:bg-white transition-colors"
                                        />
                                    </div>
                                </div>

                                {/* Sustento Image */}
                                <div className="space-y-2 text-left">
                                    <label className="text-[13px] font-semibold text-[#8b9ba5] uppercase tracking-wider block">Imagen de Sustento</label>
                                    {confirmComprobanteSustentoPreview ? (
                                        <div className="relative rounded-xl overflow-hidden border border-[#e8eded]">
                                            <img
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setZoomImage(confirmComprobanteSustentoPreview)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        setZoomImage(confirmComprobanteSustentoPreview);
                                                    }
                                                }}
                                                src={confirmComprobanteSustentoPreview}
                                                alt="Sustento"
                                                className="w-full max-h-40 object-contain bg-[#f8faf9] cursor-zoom-in hover:opacity-90 transition-opacity focus:outline-none"
                                            />
                                            <button
                                                onClick={() => {
                                                    setConfirmComprobanteSustentoFile(null);
                                                    setConfirmComprobanteSustentoPreview(prev => { if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev); return null; });
                                                }}
                                                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 text-slate-500 hover:text-red-500 flex items-center justify-center shadow-sm transition-all"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="flex flex-col items-center justify-center gap-1.5 px-4 py-5 border-2 border-dashed border-[#d3dcdb] rounded-xl cursor-pointer hover:border-[#4A90E2] hover:bg-[#4A90E2]/5 transition-all group">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="sr-only"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        setConfirmComprobanteSustentoFile(file);
                                                        setConfirmComprobanteSustentoPreview(prev => { if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
                                                    }
                                                    e.target.value = '';
                                                }}
                                            />
                                            <Camera className="w-5 h-5 text-slate-400 group-hover:text-[#4A90E2] transition-colors" />
                                            <span className="text-[13px] font-semibold text-slate-400 group-hover:text-[#4A90E2] text-center transition-colors">
                                                Pegar imagen <span className="font-black">Ctrl+V</span> o clic para seleccionar
                                            </span>
                                        </label>
                                    )}
                                </div>

                                {/* Mini History / Audit Log */}
                                <div className="space-y-2.5 text-left border-t border-[#d3dcdb]/20 pt-4">
                                    <label className="text-[13px] font-semibold text-[#8b9ba5] uppercase tracking-wider block">Historial de Cambios</label>
                                    <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                                        {loadingConfirmComprobanteAuditLogs ? (
                                            <div className="py-4 flex items-center justify-center gap-2 text-[#8b9ba5] text-[13px] font-semibold uppercase tracking-widest">
                                                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando auditoría...
                                            </div>
                                        ) : confirmComprobanteAuditLogs.length === 0 ? (
                                            <p className="text-[13px] font-medium text-slate-400 italic py-2 text-center">No hay modificaciones previas registradas</p>
                                        ) : (
                                            confirmComprobanteAuditLogs.map((log) => {
                                                const isDoc = log.campo === 'tipo_documento';
                                                const isLock = log.campo === 'comprobante_locked';
                                                let desc = "";
                                                if (isDoc) {
                                                    desc = `Documento cambiado de "${log.valor_anterior || 'COTIZACION'}" a "${log.valor_nuevo}"`;
                                                } else if (isLock) {
                                                    desc = "Comprobante verificado y bloqueado";
                                                } else {
                                                    desc = `N° Comprobante corregido de "${log.valor_anterior || '—'}" a "${log.valor_nuevo || '—'}"`;
                                                }
                                                return (
                                                    <div key={log.id} className="p-2.5 bg-[#f8faf9] border border-[#e8eded] rounded-xl text-[13px] space-y-1">
                                                        <div className="flex items-center justify-between text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                                                            <span>Por: {log.usuario_nombre}</span>
                                                            <span className="tabular-nums">{format(new Date(log.created_at), "dd/MM/yyyy · HH:mm", { locale: es })}</span>
                                                        </div>
                                                        <p className="font-medium text-slate-600 leading-tight">{desc}</p>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Footer actions */}
                            <div className="px-5 py-4 border-t border-[#d3dcdb]/30 bg-white/40 flex items-center justify-end gap-3 rounded-b-3xl shrink-0">
                                <button
                                    onClick={() => setShowConfirmComprobanteModal(null)}
                                    className="px-5 py-2.5 bg-[#f0f5f4] text-slate-600 text-[13px] font-black rounded-xl uppercase tracking-widest hover:bg-[#e8eded] transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmComprobante}
                                    disabled={savingConfirmComprobante}
                                    className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white text-[13px] font-black rounded-xl uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-600/10 transition-all disabled:opacity-50"
                                >
                                    {savingConfirmComprobante ? (
                                        <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck className="w-3.5 h-3.5" /> Confirmar y Bloquear
                                        </>
                                    )}
                                </button>
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

                {/* ── KARDEX DE CUENTAS MODAL ──────────────────────────────────── */}
                {showKardexModal && createPortal(
                    <div className={`treasury-ui fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden ${isClosingKardexModal ? 'animate-backdrop-out' : 'animate-backdrop'}`} style={{ backdropFilter: 'blur(6px)' }}>
                        <div className={`bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-[95vw] max-w-[1450px] border border-white/50 flex flex-col max-h-[95vh] min-h-[640px] relative ${isClosingKardexModal ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                            {/* Header */}
                            <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40 shrink-0 rounded-t-3xl">
                                <div className="flex items-center gap-4">
                                    <BarChart2 className="w-8 h-8 text-[#366480] drop-shadow-sm" />
                                    <div>
                                        <h2 className="text-xl font-black text-[#2c3434] uppercase tracking-tight">Historial de Cuentas</h2>
                                        <p className="text-[11px] font-bold text-[#6f7e8a] uppercase tracking-wider mt-0.5">Kardex de movimientos por cuenta bancaria</p>
                                    </div>
                                </div>
                                <button onClick={closeKardexModal} className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Controls */}
                            <div className="px-8 py-5 border-b border-[#f0f5f4] flex flex-wrap items-center gap-3 shrink-0 bg-white/20">
                                {/* Account dropdown */}
                                <div className="relative">
                                    <select
                                        value={kardexAccount}
                                        onChange={(e) => setKardexAccount(e.target.value)}
                                        className="appearance-none bg-[#f8faf9] text-[#244c66] pl-5 pr-12 py-3 rounded-full text-[13px] font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-[#e8eded] transition-all border border-[#d3dcdb]/30"
                                    >
                                        {KARDEX_ACCOUNTS.map(acc => (
                                            <option key={acc} value={acc}>{acc === 'TODOS' ? 'Todas las cuentas' : acc}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#366480] pointer-events-none" />
                                </div>

                                {/* Search bar */}
                                <div className="relative min-w-[240px]">
                                    <span className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                        <Search className="w-4 h-4 text-[#8b9ba5]" />
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Buscar por descripción..."
                                        value={kardexSearch}
                                        onChange={(e) => setKardexSearch(e.target.value)}
                                        className="bg-[#f8faf9] text-[#244c66] pl-10 pr-8 py-2.5 rounded-full text-[13px] font-bold outline-none border border-[#d3dcdb]/30 placeholder-[#8b9ba5] focus:ring-2 focus:ring-[#366480]/15 focus:bg-white transition-all w-64"
                                    />
                                    {kardexSearch && (
                                        <button
                                            onClick={() => setKardexSearch('')}
                                            className="absolute inset-y-0 right-4 flex items-center text-[#8b9ba5] hover:text-rose-500 font-bold text-xs"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* Date range */}
                                <div className="relative ml-auto" ref={kardexDatePickerRef}>
                                    <button
                                        onClick={() => setShowKardexDatePicker(p => !p)}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-[#f8faf9] text-[#366480] rounded-full text-[13px] font-bold hover:bg-[#e8eded] transition-all"
                                    >
                                        <Calendar className="w-4 h-4 text-[#4A90E2]" />
                                        {`${format(new Date(kardexStart + 'T12:00:00'), "dd MMM", { locale: es })} — ${format(new Date(kardexEnd + 'T12:00:00'), "dd MMM yyyy", { locale: es })}`}
                                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showKardexDatePicker ? 'rotate-180' : ''}`} />
                                    </button>
                                    <RangeDatePicker
                                        isOpen={showKardexDatePicker}
                                        startDate={kardexStart}
                                        endDate={kardexEnd}
                                        triggerRef={kardexDatePickerRef}
                                        onApply={(s, e) => { setKardexStart(s); setKardexEnd(e); setShowKardexDatePicker(false); }}
                                        onCancel={() => setShowKardexDatePicker(false)}
                                    />
                                </div>
                            </div>

                            {/* Table */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {kardexRows.length === 0 ? (
                                    <div className="py-24 text-center font-black text-[#366480]/20 uppercase tracking-[0.3em] text-[10px]">Sin movimientos en el rango seleccionado</div>
                                ) : (
                                    <table className="w-full text-left">
                                        <thead className="sticky top-0 z-10 bg-[#f7faf9]/95 backdrop-blur-md border-b border-[#d3dcdb]/20">
                                            <tr className="text-[#366480]/70 text-[13px] font-black uppercase tracking-wider">
                                                <th className="py-4 pl-8 w-40">Fecha</th>
                                                {kardexAccount === 'TODOS' && <th className="py-4 px-4 w-32">Cuenta</th>}
                                                <th className="py-4 px-4">Descripción</th>
                                                <th className="py-4 px-4 w-40">Contrapartida</th>
                                                <th className="py-4 px-4 w-36">Usuario</th>
                                                <th className="py-4 px-4 text-right text-emerald-600/70 w-36">Entrada (S/)</th>
                                                <th className="py-4 px-4 text-right text-rose-500/70 w-36">Salida (S/)</th>
                                                {kardexAccount !== 'TODOS' && <th className="py-4 pr-8 text-right w-36">Saldo (S/)</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#d3dcdb]/10">
                                            {paginatedKardex.map((row, i) => (
                                                <tr key={i} className="hover:bg-[#f8faf9]/60 transition-colors">
                                                    <td className="py-3.5 pl-8 whitespace-nowrap">
                                                        <span className="text-[14px] font-bold text-[#2c3434]">{format(new Date(row.date), 'dd/MM/yy', { locale: es })}</span>
                                                        <span className="block text-[12px] font-semibold text-[#8b9ba5] mt-0.5">{format(new Date(row.date), 'HH:mm', { locale: es })}{row.numOp ? ` · #${row.numOp}` : ''}</span>
                                                    </td>
                                                    {kardexAccount === 'TODOS' && (
                                                        <td className="py-3.5 px-4">
                                                            <span className="px-4 py-2 bg-[#244c66]/10 text-[#244c66] text-[14px] font-semibold rounded-full uppercase tracking-wide">
                                                                {row.cuenta}
                                                            </span>
                                                        </td>
                                                    )}
                                                    <td className="py-3.5 px-4 text-[14px] font-bold text-[#2c3434] max-w-[220px] truncate uppercase" title={row.desc}>
                                                        {row.desc || '—'}
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <span className="px-4 py-2 bg-[#f0f5f4] text-[#366480] text-[14px] font-semibold rounded-full uppercase tracking-wide">
                                                            {row.contra}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 px-4 text-[14px] font-semibold text-[#366480] max-w-[120px] truncate uppercase" title={row.usuario_nombre || '—'}>
                                                        {row.usuario_nombre || '—'}
                                                    </td>
                                                    <td className="py-3.5 px-4 text-right tabular-nums text-[15px] font-black">
                                                        {row.entrada > 0 ? <span className="text-emerald-600">+{formatCurrency(row.entrada)}</span> : <span className="text-[#d3dcdb]">—</span>}
                                                    </td>
                                                    <td className="py-3.5 px-4 text-right tabular-nums text-[15px] font-black">
                                                        {row.salida > 0 ? <span className="text-rose-500">−{formatCurrency(row.salida)}</span> : <span className="text-[#d3dcdb]">—</span>}
                                                    </td>
                                                    {kardexAccount !== 'TODOS' && (
                                                        <td className={`py-3.5 pr-8 text-right tabular-nums text-[15px] font-[900] ${row.balance >= 0 ? 'text-[#2c3434]' : 'text-rose-600'}`}>
                                                            {formatCurrency(row.balance)}
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {kardexPageTotal > 1 && (
                                <div className="flex items-center justify-center gap-2 py-4 bg-white/20 shrink-0 border-t border-[#f0f5f4]">
                                    <button
                                        onClick={() => setKardexPage(p => Math.max(1, p - 1))}
                                        disabled={kardexPage === 1}
                                        className="px-3 py-2 rounded-xl text-[11px] font-black text-[#366480] hover:bg-[#f0f5f4] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    >
                                        <ChevronDown className="w-4 h-4 rotate-90" />
                                    </button>
                                    {Array.from({ length: kardexPageTotal }, (_, i) => i + 1).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => setKardexPage(page)}
                                            className={`w-8 h-8 rounded-xl text-[11px] font-black transition-all ${kardexPage === page ? 'bg-[#244c66] text-white shadow-sm' : 'text-[#366480]/60 hover:bg-[#f0f5f4]'}`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setKardexPage(p => Math.min(kardexPageTotal, p + 1))}
                                        disabled={kardexPage === kardexPageTotal}
                                        className="px-3 py-2 rounded-xl text-[11px] font-black text-[#366480] hover:bg-[#f0f5f4] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    >
                                        <ChevronDown className="w-4 h-4 -rotate-90" />
                                    </button>
                                </div>
                            )}

                            {/* Footer — summary + actions */}
                            {kardexRows.length > 0 && (() => {
                                const totalEntrada = kardexRows.reduce((s, r) => s + r.entrada, 0);
                                const totalSalida  = kardexRows.reduce((s, r) => s + r.salida,  0);
                                const isAll = kardexAccount === 'TODOS';
                                const saldoFinal   = isAll
                                    ? KARDEX_TRACKED.reduce((acc, a) => acc + calculateGlobalBalance(a), 0)
                                    : kardexRows[0]?.balance ?? 0;
                                return (
                                    <div className="px-8 py-5 border-t border-[#f0f5f4] bg-white/40 shrink-0 flex items-center justify-between gap-6 rounded-b-3xl">
                                        <div className="flex items-center gap-8">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-[#8b9ba5] uppercase tracking-widest">Total Entradas</span>
                                                <span className="text-[15px] font-[900] text-emerald-600 tabular-nums">+S/ {formatCurrency(totalEntrada)}</span>
                                            </div>
                                            <div className="w-px h-8 bg-[#d3dcdb]/30"></div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-[#8b9ba5] uppercase tracking-widest">Total Salidas</span>
                                                <span className="text-[15px] font-[900] text-rose-500 tabular-nums">−S/ {formatCurrency(totalSalida)}</span>
                                            </div>
                                            <div className="w-px h-8 bg-[#d3dcdb]/30"></div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-[#8b9ba5] uppercase tracking-widest">{isAll ? 'Patrimonio Global' : 'Saldo Final'}</span>
                                                <span className={`text-[15px] font-[900] tabular-nums ${saldoFinal >= 0 ? 'text-[#244c66]' : 'text-rose-600'}`}>S/ {formatCurrency(saldoFinal)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => {
                                                    const dateLabel = `${format(new Date(kardexStart + 'T12:00:00'), 'dd/MM/yyyy', { locale: es })} al ${format(new Date(kardexEnd + 'T12:00:00'), 'dd/MM/yyyy', { locale: es })}`;
                                                    if (isAll) {
                                                        const title = `HISTORIAL UNIFICADO DE CUENTAS — ${dateLabel}`;
                                                        const cols = ['FECHA', 'CUENTA', 'DESCRIPCIÓN', 'CONTRAPARTIDA', 'USUARIO', 'ENTRADA (S/)', 'SALIDA (S/)'];
                                                        const rows = kardexRows.map(r => [
                                                            format(new Date(r.date), 'dd/MM/yy HH:mm', { locale: es }),
                                                            r.cuenta.toUpperCase(),
                                                            (r.desc || '').toUpperCase(),
                                                            (r.contra || '—').toUpperCase(),
                                                            (r.usuario_nombre || '—').toUpperCase(),
                                                            r.entrada > 0 ? `+${formatCurrency(r.entrada)}` : '—',
                                                            r.salida  > 0 ? `-${formatCurrency(r.salida)}`  : '—'
                                                        ]);
                                                        exportToPDF(title, cols, rows, `Kardex_Unificado`);
                                                    } else {
                                                        const title = `HISTORIAL DE CUENTA ${kardexAccount} — ${dateLabel}`;
                                                        const cols = ['FECHA', 'DESCRIPCIÓN', 'CONTRAPARTIDA', 'USUARIO', 'ENTRADA (S/)', 'SALIDA (S/)', 'SALDO (S/)'];
                                                        const rows = kardexRows.map(r => [
                                                            format(new Date(r.date), 'dd/MM/yy HH:mm', { locale: es }),
                                                            (r.desc || '').toUpperCase(),
                                                            (r.contra || '—').toUpperCase(),
                                                            (r.usuario_nombre || '—').toUpperCase(),
                                                            r.entrada > 0 ? `+${formatCurrency(r.entrada)}` : '—',
                                                            r.salida  > 0 ? `-${formatCurrency(r.salida)}`  : '—',
                                                            formatCurrency(r.balance)
                                                        ]);
                                                        exportToPDF(title, cols, rows, `Kardex_${kardexAccount.replace('/', '-')}`);
                                                    }
                                                }}
                                                className="flex items-center gap-2 px-6 py-3 bg-[#e8eded] text-[#366480] hover:bg-[#dce3e3] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                            >
                                                <FileText className="w-4 h-4" /> {isAll ? 'Reporte Unificado' : 'Exportar PDF'}
                                            </button>
                                            <button onClick={closeKardexModal} className="px-6 py-3 bg-[#2c3434] text-white text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-[#366480] transition-all">Cerrar</button>
                                        </div>
                                    </div>
                                );
                            })()}
                            {kardexRows.length === 0 && (
                                <div className="px-8 py-5 border-t border-[#f0f5f4] bg-white/40 shrink-0 flex justify-end rounded-b-3xl">
                                    <button onClick={closeKardexModal} className="px-6 py-3 bg-[#2c3434] text-white text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-[#366480] transition-all">Cerrar</button>
                                </div>
                            )}
                        </div>
                    </div>,
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
                <div className={`treasury-ui fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden ${isClosingCashModal ? 'animate-backdrop-out' : 'animate-backdrop'}`} style={{ backdropFilter: 'blur(6px)' }}>
                    <div className={`bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-6xl border border-white/50 flex flex-col max-h-[92vh] min-h-[640px] relative ${isClosingCashModal ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                        {/* Header */}
                        <div className="px-8 py-5 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40 shrink-0 rounded-t-3xl">
                            <div className="flex items-center gap-4">
                                <Banknote className="w-8 h-8 text-[#4A90E2] drop-shadow-sm" />
                                <div>
                                    <h2 className="text-2xl font-black text-[#2c3434] uppercase tracking-tight">Libro de Caja Efectivo</h2>
                                    <p className="text-xs font-semibold text-[#8b9ba5] uppercase tracking-widest mt-0.5">Detalle de ingresos y salidas en efectivo</p>
                                </div>
                            </div>
                            <button onClick={closeCashModal} className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Controls */}
                        <div className="px-8 py-4 border-b border-[#f0f5f4] flex flex-wrap items-center gap-3 shrink-0 bg-white/20">
                            {/* Date range */}
                            <div className="relative" ref={cashDatePickerRef}>
                                <button
                                    onClick={() => {
                                        if (cashQuickFilter !== 'PERSONALIZADO') {
                                            setCashQuickFilter('PERSONALIZADO');
                                        }
                                        setShowCashDatePicker(p => !p);
                                    }}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#f8faf9] text-[#366480] rounded-full text-[13px] font-bold hover:bg-[#e8eded] transition-all"
                                >
                                    <Calendar className="w-4 h-4 text-[#4A90E2]" />
                                    {cashFilterStart && cashFilterEnd
                                        ? `${format(new Date(cashFilterStart + 'T12:00:00'), "dd MMM", { locale: es })} — ${format(new Date(cashFilterEnd + 'T12:00:00'), "dd MMM yyyy", { locale: es })}`
                                        : 'Todas las fechas'}
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showCashDatePicker ? 'rotate-180' : ''}`} />
                                </button>
                                <RangeDatePicker
                                    isOpen={showCashDatePicker}
                                    startDate={cashFilterStart || format(new Date(), 'yyyy-MM-dd')}
                                    endDate={cashFilterEnd || format(new Date(), 'yyyy-MM-dd')}
                                    onApply={(s, e) => { setCashFilterStart(s); setCashFilterEnd(e); setTempCashFilterStart(s); setTempCashFilterEnd(e); setCashQuickFilter('PERSONALIZADO'); setShowCashDatePicker(false); }}
                                    onCancel={() => setShowCashDatePicker(false)}
                                    align="left"
                                />
                            </div>

                            {/* Quick filter */}
                            <div className="relative">
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
                                    className="appearance-none bg-[#f8faf9] text-[#244c66] pl-5 pr-10 py-2.5 rounded-full text-[13px] font-bold outline-none cursor-pointer hover:bg-[#e8eded] transition-all"
                                >
                                    <option value="PERSONALIZADO">Personalizado</option>
                                    <option value="HOY">Hoy</option>
                                    <option value="ESTA_SEMANA">Última Semana</option>
                                    <option value="MES_ACTUAL">Mes Actual</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                            </div>

                            <button
                                onClick={() => {
                                    setCashFilterStart(''); setCashFilterEnd('');
                                    setTempCashFilterStart(''); setTempCashFilterEnd('');
                                    setCashQuickFilter('PERSONALIZADO');
                                }}
                                title="Limpiar filtros"
                                className="p-2.5 bg-[#f8faf9] text-[#8b9ba5] hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>

                            <div className="ml-auto flex items-center gap-3">
                                <div className="bg-[#244c66] px-5 py-2.5 rounded-full text-white shadow-md flex items-center gap-3">
                                    <span className="text-xs font-black uppercase tracking-[0.2em] opacity-70">Saldo Disponible</span>
                                    <span className="text-[17px] font-black tabular-nums">S/ {saldoEf.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <button
                                    onClick={() => setShowDeposit8059Modal(true)}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-[13px] font-black uppercase tracking-widest shadow-md transition-all"
                                >
                                    <ArrowRightLeft className="w-4 h-4" /> Depósito 8059
                                </button>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-left">
                                <thead className="sticky top-0 z-10 bg-[#f7faf9]/95 backdrop-blur-md border-b border-[#d3dcdb]/20">
                                    <tr className="text-[#366480]/70 text-[12px] font-extrabold uppercase tracking-wider">
                                        <th className="py-3.5 pl-8">Fecha</th>
                                        <th className="py-3.5 px-3 text-center">Tipo</th>
                                        <th className="py-3.5 px-3">Movimiento</th>
                                        <th className="py-3.5 px-3">Descripción</th>
                                        <th className="py-3.5 px-3 text-right">Monto</th>
                                        <th className="py-3.5 pr-8 text-center min-w-[120px]">Dep. a 8059</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#d3dcdb]/10">
                                    {unifiedCashTimeline.map((item, idx) => {
                                        const prevItem = idx > 0 ? unifiedCashTimeline[idx - 1] : null;
                                        const isNewDay = !prevItem || item.date !== prevItem.date;

                                        return (
                                            <React.Fragment key={item.isConsolidated ? `cons-${item.date}` : `mov-${item.id}`}>
                                                {isNewDay && idx > 0 && (
                                                    <tr className="bg-[#f8faf9]/30 border-none">
                                                        <td colSpan={6} className="py-2.5 px-4 border-y border-[#d3dcdb]/20">
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex-1 h-px bg-[#d3dcdb]/40"></div>
                                                                <div className="flex items-center gap-2">
                                                                    <Clock className="w-3 h-3 text-[#4A90E2]" />
                                                                    <span className="text-[11px] font-bold text-[#366480] uppercase tracking-[0.2em]">Corte del día {prevItem?.date}</span>
                                                                </div>
                                                                <div className="flex-1 h-px bg-[#d3dcdb]/40"></div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                {item.isConsolidated ? (
                                                    <React.Fragment>
                                                        <tr className="hover:bg-[#f8faf9]/60 transition-colors group">
                                                            <td className="py-3.5 pl-8 text-[14px] font-bold text-[#2c3434] tabular-nums">{item.date}</td>
                                                            <td className="py-3 px-3 text-center">
                                                                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[12px] font-extrabold rounded-full uppercase tracking-wide">Ingreso</span>
                                                            </td>
                                                            <td className="py-3 px-3">
                                                                <span className="text-[14px] font-bold text-[#2c3434] uppercase">Consolidado Ventas ({item.count})</span>
                                                            </td>
                                                            <td className="py-3 px-3">
                                                                <div
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (selectedCashDay === item.date) setSelectedCashDay(null);
                                                                        else getCashMovementsForDay(item.date);
                                                                    }}
                                                                    className="inline-flex items-center gap-1.5 cursor-pointer group/btn"
                                                                >
                                                                    <span className="text-[12px] font-extrabold text-[#8b9ba5] group-hover/btn:text-[#4A90E2] uppercase italic transition-colors">Ver detalle</span>
                                                                    <ChevronDown className={`w-3 h-3 text-[#d3dcdb] group-hover/btn:text-[#4A90E2] transition-all duration-300 ${selectedCashDay === item.date ? 'rotate-180' : ''}`} />
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-3 text-right">
                                                                <span className="text-[15px] font-black text-emerald-600 tabular-nums">S/ {Number(item.total).toFixed(2)}</span>
                                                            </td>
                                                            <td className="py-3 pr-8 text-center">
                                                                <span className="text-[13px] font-bold text-[#d3dcdb] tabular-nums italic">—</span>
                                                            </td>
                                                        </tr>
                                                        <tr className={selectedCashDay === item.date ? 'bg-[#f8faf9]/40' : ''}>
                                                            <td colSpan={6} className="p-0 border-none focus:outline-none">
                                                                <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${selectedCashDay === item.date ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                                                    <div className="overflow-hidden">
                                                                        <div className="p-5 border-l-4 border-[#4A90E2]">
                                                                            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#d3dcdb]/30">
                                                                                <table className="w-full text-left">
                                                                                    <thead className="bg-[#f7faf9]/50 border-b border-[#d3dcdb]/20">
                                                                                        <tr>
                                                                                            <th className="py-3 px-5 text-[11px] font-bold uppercase tracking-wider text-[#366480]/60">Hora</th>
                                                                                            <th className="py-3 px-5 text-[11px] font-bold uppercase tracking-wider text-[#366480]/60">Referencia Venta</th>
                                                                                            <th className="py-3 px-5 text-[11px] font-bold uppercase tracking-wider text-[#366480]/60">Observación</th>
                                                                                            <th className="py-3 px-5 text-[11px] font-bold uppercase tracking-wider text-right text-[#366480]/60">Subtotal</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="divide-y divide-[#d3dcdb]/10">
                                                                                        {loadingCashDetail ? (
                                                                                            <tr><td colSpan={4} className="py-8 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#4A90E2]" /></td></tr>
                                                                                        ) : cashDetailList.map(innerItem => {
                                                                                            const v = (ventas || []).find(v => v.id === innerItem.referencia_id);
                                                                                            return (
                                                                                                <tr key={innerItem.id} className="hover:bg-[#f8faf9]/40 transition-colors">
                                                                                                    <td className="py-3 px-5 text-[13px] font-medium text-[#8b9ba5] tabular-nums">{format(new Date(innerItem.created_at), 'HH:mm:ss')}</td>
                                                                                                    <td className="py-3 px-5">
                                                                                                        <div className="flex flex-col">
                                                                                                            <span className="text-[13px] font-bold text-[#244c66] uppercase tracking-tighter">#{v?.codigo_cotizacion || innerItem.referencia_id?.slice(0,8)}</span>
                                                                                                            <span className="text-[11px] font-medium text-[#8b9ba5] uppercase">{v?.cliente_nombre}</span>
                                                                                                        </div>
                                                                                                    </td>
                                                                                                    <td className="py-3 px-5 text-[13px] font-medium text-[#8b9ba5] italic">{(innerItem.observaciones || '').toUpperCase()}</td>
                                                                                                    <td className="py-3 px-5 text-right text-[14px] font-black text-[#2c3434] tabular-nums">S/ {Number(innerItem.monto).toFixed(2)}</td>
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
                                                    <tr key={item.id} className="hover:bg-[#f8faf9]/60 transition-colors">
                                                        <td className="py-3.5 pl-8 text-[14px] font-bold text-[#2c3434]/70 tabular-nums">{item.date}</td>
                                                        <td className="py-3 px-3 text-center">
                                                            <span className={`px-3 py-1 text-[12px] font-extrabold rounded-full uppercase tracking-wide ${
                                                                item.tipo_movimiento === 'EGRESO' ? 'bg-rose-50 text-rose-600' : 'bg-[#244c66]/10 text-[#244c66]'
                                                            }`}>
                                                                {item.tipo_movimiento}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-3">
                                                            <span className="text-[14px] font-bold text-[#2c3434] uppercase">{item.categoria}</span>
                                                        </td>
                                                        <td className="py-3.5 px-3 text-[13px] font-medium text-[#8b9ba5] italic uppercase max-w-[260px] truncate" title={item.observaciones}>
                                                            {item.observaciones}
                                                        </td>
                                                        <td className="py-3 px-3 text-right">
                                                            <span className={`text-[15px] font-black tabular-nums ${item.tipo_movimiento === 'EGRESO' || item.cuenta_origen === 'Efectivo' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                                S/ {Number(item.monto).toFixed(2)}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 pr-8 text-center">
                                                            {item.cuenta_destino === '8059' ? (
                                                                <span className="text-[15px] font-black text-emerald-600 tabular-nums">
                                                                    S/ {Number(item.monto).toFixed(2)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[13px] font-bold text-[#d3dcdb] tabular-nums italic">—</span>
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

                        {/* Footer summary */}
                        <div className="px-8 py-4 border-t border-[#f0f5f4] bg-white/40 shrink-0 flex items-center justify-between gap-6 rounded-b-3xl">
                            <div className="flex items-center gap-8">
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-[#8b9ba5] uppercase tracking-wider">Entradas Totales</span>
                                    <span className="text-[18px] font-black text-emerald-600 tabular-nums">+S/ {formatCurrency(cashOnlyMovements.filter(m => m.cuenta_destino === 'Efectivo').reduce((a, b) => a + Number(b.monto), 0))}</span>
                                </div>
                                <div className="w-px h-8 bg-[#d3dcdb]/30"></div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-[#8b9ba5] uppercase tracking-wider">Salidas Totales</span>
                                    <span className="text-[18px] font-black text-rose-500 tabular-nums">−S/ {formatCurrency(cashOnlyMovements.filter(m => m.cuenta_origen === 'Efectivo').reduce((a, b) => a + Number(b.monto), 0))}</span>
                                </div>
                            </div>
                            <button onClick={() => setShowCashAccountModal(false)} className="px-6 py-3 bg-[#2c3434] text-white text-[12px] font-black rounded-xl uppercase tracking-widest hover:bg-[#366480] transition-all">Cerrar</button>
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
