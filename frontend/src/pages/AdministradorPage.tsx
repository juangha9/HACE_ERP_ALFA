import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import {
    LayoutGrid,
    Ruler,
    Wrench,
    Calendar,
    RefreshCw,
    X,
    Search,
    ChevronDown,
    ChevronUp,
    History as HistoryIcon,
    Check,
    Users,
    AlertCircle,
    UserPlus,
    Phone,
    Pencil,
    ArrowUpDown,
} from 'lucide-react';
import {
    format,
    parseISO,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    eachWeekOfInterval,
    eachMonthOfInterval,
    subDays,
    subWeeks,
    subMonths,
    addDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../services/supabase';
import { RangeDatePicker } from '../components/RangeDatePicker';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CotizacionItemRow {
    cantidad: number;
    unidad: string;
    descripcion: string;
    total: number;
    created_at: string;
    cotizacion_id: string;
    cotizaciones: {
        id: string;
        codigo: string;
        cliente_nombre: string;
        fecha_emision: string;
        estado: string;
        total: number;
    } | null;
}

interface MaterialDetalle {
    desc: string;
    unidad: string;
    qty: number;
    total: number;
}

interface ServicioRecientePresentacion {
    id: string;
    codigo: string;
    cliente: string;
    material: string;
    materialesDetalle: MaterialDetalle[];
    estado: string;
    monto: number;
    fecha: string;
    estadoPago: string | null;
    saldoPendiente: number | null;
}

type GroupingMode = 'DIARIO' | 'SEMANAL' | 'MENSUAL';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatNumber = (n: number, digits = 0) =>
    n.toLocaleString('es-PE', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });

const ESTADO_BADGE: Record<string, string> = {
    LISTO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    COMPLETADO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    CANCELADO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    BORRADOR: 'bg-amber-100 text-amber-700 border-amber-200',
    PARCIAL: 'bg-amber-100 text-amber-700 border-amber-200',
    PENDIENTE: 'bg-rose-100 text-rose-700 border-rose-200',
    EN_PROCESO: 'bg-sky-100 text-sky-700 border-sky-200',
};

const friendlyEstado = (s: string) =>
    s === 'LISTO' ? 'COMPLETADO' : s === 'BORRADOR' ? 'PENDIENTE' : s;

const highlight = (text: string, query: string): React.ReactNode => {
    if (!query.trim() || !text) return <>{text}</>;
    const q = query.trim().toLowerCase();
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, idx)}
            <mark style={{ backgroundColor: '#fde68a', color: '#78350f', borderRadius: '3px', padding: '0 2px', fontStyle: 'normal' }}>
                {text.slice(idx, idx + q.length)}
            </mark>
            {text.slice(idx + q.length)}
        </>
    );
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdministradorPage() {
    const today = new Date();
    const defaultStart = format(startOfMonth(today), 'yyyy-MM-dd');
    const defaultEnd = format(today, 'yyyy-MM-dd');

    const [items, setItems] = useState<CotizacionItemRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Current range filter
    const [startDate, setStartDate] = useState<string>(defaultStart);
    const [endDate, setEndDate] = useState<string>(defaultEnd);
    const [mainQuickFilter, setMainQuickFilter] = useState<'HOY' | 'ULTIMOS_7' | 'ULTIMOS_30' | 'MES_ACTUAL' | 'PERSONALIZADO'>('MES_ACTUAL');

    // Comparison range filter (optional)
    const [compareEnabled, setCompareEnabled] = useState(false);
    const [compareStartDate, setCompareStartDate] = useState<string>(
        format(subDays(startOfMonth(today), 30), 'yyyy-MM-dd')
    );
    const [compareEndDate, setCompareEndDate] = useState<string>(
        format(subDays(today, 30), 'yyyy-MM-dd')
    );

    const [groupingMode, setGroupingMode] = useState<GroupingMode>('DIARIO');
    const [excludeWeekends, setExcludeWeekends] = useState(false);

    // Date pickers visibility
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const datePickerWrapRef = useRef<HTMLDivElement>(null);

    // Compare quick-menu (replaces direct calendar)
    const [compareMenuOpen, setCompareMenuOpen] = useState(false);
    const [monthPickerOpen, setMonthPickerOpen] = useState(false);
    const [monthPickerCursor, setMonthPickerCursor] = useState(new Date(today.getFullYear(), 0, 1));
    const compareWrapRef = useRef<HTMLDivElement>(null);
    const [compareLabel, setCompareLabel] = useState<string>('Comparar');

    // Clients modal state
    const [clientsOpen, setClientsOpen] = useState(false);
    const [clientsClosing, setClientsClosing] = useState(false);
    const [clientsSearch, setClientsSearch] = useState('');
    const [clientsQuickFilter, setClientsQuickFilter] = useState<'HOY' | 'ULTIMOS_7' | 'ULTIMOS_30' | 'MES_ACTUAL' | 'TODO' | 'PERSONALIZADO'>('TODO');
    const [clientsStart, setClientsStart] = useState(format(subDays(today, 90), 'yyyy-MM-dd'));
    const [clientsEnd, setClientsEnd] = useState(format(today, 'yyyy-MM-dd'));
    const [clientsDatePickerOpen, setClientsDatePickerOpen] = useState(false);
    const clientsDatePickerWrapRef = useRef<HTMLDivElement>(null);
    const [clientsDebtFilter, setClientsDebtFilter] = useState<'TODOS' | 'CON_DEUDA' | 'SIN_DEUDA'>('TODOS');
    const [clientsSort, setClientsSort] = useState<{ col: 'ventas' | 'tableros'; dir: 'desc' | 'asc' } | null>(null);
    const [ventasCabecera, setVentasCabecera] = useState<{ cliente_nombre: string; saldo_pendiente: number; estado_pago: string }[]>([]);
    // Local input value (decoupled from filter state to avoid re-rendering chart on every keystroke)
    const [clientsInputValue, setClientsInputValue] = useState('');
    const clientsSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // New client sub-modal state
    const [newClientOpen, setNewClientOpen] = useState(false);
    const [newClientClosing, setNewClientClosing] = useState(false);
    const [newClientData, setNewClientData] = useState<{ name: string; type: 'CLIENT' | 'SUPPLIER' | 'BOTH'; tax_id: string; phone: string }>({ name: '', type: 'CLIENT', tax_id: '', phone: '' });
    const [newClientSaving, setNewClientSaving] = useState(false);
    const [newClientError, setNewClientError] = useState<string | null>(null);
    const [newClientSuccess, setNewClientSuccess] = useState(false);
    const [newClientIsEdit, setNewClientIsEdit] = useState(false);
    const [newClientEditId, setNewClientEditId] = useState<string | null>(null);
    // Contacts cache for edit-in-place (type = CLIENT)
    const [clientContacts, setClientContacts] = useState<{ id: string; name: string; type: string; tax_id: string | null; phone: string | null }[]>([]);
    const [editClientListOpen, setEditClientListOpen] = useState(false);
    const [editClientListClosing, setEditClientListClosing] = useState(false);
    const [editClientSearch, setEditClientSearch] = useState('');

    // Payment info from ventas_cabecera for the dashboard (KPIs, últimos servicios, history filter)
    const [ventasParaDashboard, setVentasParaDashboard] = useState<{ codigo_cotizacion: string | null; saldo_pendiente: number; estado_pago: string }[]>([]);

    // Tooltip for Material column in Últimos Servicios (portal-based to avoid overflow clipping)
    const [matTooltip, setMatTooltip] = useState<{ x: number; y: number; items: MaterialDetalle[] } | null>(null);
    const matTooltipLeaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // History modal state
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyClosing, setHistoryClosing] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [historyEstado, setHistoryEstado] = useState<'TODOS' | 'PENDIENTE' | 'PARCIAL' | 'CANCELADO'>('TODOS');
    const [historyQuickFilter, setHistoryQuickFilter] = useState<'ULTIMOS_7' | 'ULTIMOS_30' | 'MES_ACTUAL' | 'PERSONALIZADO'>('ULTIMOS_30');
    const [historyStart, setHistoryStart] = useState(format(subDays(today, 30), 'yyyy-MM-dd'));
    const [historyEnd, setHistoryEnd] = useState(format(today, 'yyyy-MM-dd'));
    const [historyDatePickerOpen, setHistoryDatePickerOpen] = useState(false);
    const historyDatePickerWrapRef = useRef<HTMLDivElement>(null);
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

    // ── Fetch ───────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            // Determine the widest interval we need (so the chart can also
            // render the comparison range without a second round-trip).
            const ranges = [{ start: startDate, end: endDate }];
            if (compareEnabled) ranges.push({ start: compareStartDate, end: compareEndDate });
            const minStart = ranges.reduce((acc, r) => (r.start < acc ? r.start : acc), ranges[0].start);
            const maxEnd = ranges.reduce((acc, r) => (r.end > acc ? r.end : acc), ranges[0].end);

            const [itemsRes, ventasDashRes] = await Promise.all([
                supabase
                    .from('cotizaciones_items')
                    .select(
                        'cantidad,unidad,descripcion,total,created_at,cotizacion_id,' +
                            'cotizaciones!inner(id,codigo,cliente_nombre,fecha_emision,estado,total)'
                    )
                    .neq('cotizaciones.estado', 'ELIMINADO')
                    .gte('cotizaciones.fecha_emision', minStart)
                    .lte('cotizaciones.fecha_emision', maxEnd)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('ventas_cabecera')
                    .select('codigo_cotizacion,saldo_pendiente,estado_pago'),
            ]);

            if (itemsRes.error) throw itemsRes.error;
            setItems(((itemsRes.data ?? []) as unknown) as CotizacionItemRow[]);
            if (ventasDashRes.data) setVentasParaDashboard(ventasDashRes.data as any);
        } catch (e: any) {
            console.error(e);
            setFetchError(e?.message || 'Error desconocido al cargar datos');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, compareEnabled, compareStartDate, compareEndDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Real-time: reload when cotizaciones or ventas_cabecera change
    const fetchDataRef = useRef(fetchData);
    useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);
    useEffect(() => {
        const debounce = { t: null as ReturnType<typeof setTimeout> | null };
        const triggerReload = () => {
            if (debounce.t) clearTimeout(debounce.t);
            debounce.t = setTimeout(() => fetchDataRef.current(), 800);
        };
        const channel = supabase
            .channel('admin-dashboard-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, triggerReload)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas_cabecera' }, triggerReload)
            .subscribe();
        return () => {
            if (debounce.t) clearTimeout(debounce.t);
            supabase.removeChannel(channel);
        };
    }, []);

    // ── Click-away for date pickers / menus ─────────────────────────────────
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (datePickerWrapRef.current && !datePickerWrapRef.current.contains(target)) {
                setDatePickerOpen(false);
            }
            if (compareWrapRef.current && !compareWrapRef.current.contains(target)) {
                setCompareMenuOpen(false);
                setMonthPickerOpen(false);
            }
            if (historyDatePickerWrapRef.current && !historyDatePickerWrapRef.current.contains(target)) {
                setHistoryDatePickerOpen(false);
            }
            if (clientsDatePickerWrapRef.current && !clientsDatePickerWrapRef.current.contains(target)) {
                setClientsDatePickerOpen(false);
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    // Debounce search to avoid triggering heavy re-renders on every keystroke
    useEffect(() => {
        if (clientsSearchDebounceRef.current) clearTimeout(clientsSearchDebounceRef.current);
        clientsSearchDebounceRef.current = setTimeout(() => {
            setClientsSearch(clientsInputValue);
        }, 300);
        return () => {
            if (clientsSearchDebounceRef.current) clearTimeout(clientsSearchDebounceRef.current);
        };
    }, [clientsInputValue]);

    // ── Slice items by range ────────────────────────────────────────────────
    const sliceByRange = useCallback(
        (start: string, end: string) =>
            items.filter(it => {
                const f = it.cotizaciones?.fecha_emision;
                if (!f) return false;
                return f >= start && f <= end;
            }),
        [items]
    );

    const currentRangeItems = useMemo(
        () => sliceByRange(startDate, endDate),
        [sliceByRange, startDate, endDate]
    );

    // ── KPI totals (current range only) ─────────────────────────────────────
    const totals = useMemo(() => {
        let pls = 0,
            mts = 0,
            serv = 0;
        for (const it of currentRangeItems) {
            const u = (it.unidad || '').toUpperCase();
            const q = Number(it.cantidad) || 0;
            if (u === 'PLS' || u === 'PLN') pls += q;
            else if (u === 'MTS' || u === 'ML') mts += q;
            else if (u === 'SERV') serv += Number(it.total) || 0;
        }
        return { pls, mts, serv };
    }, [currentRangeItems]);


    // ── Chart series (PLS over time, current vs comparison) ─────────────────
    const chartData = useMemo(() => {
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        if (!start || !end || start > end) return [];

        // Build buckets based on grouping mode
        let buckets: { date: Date; label: string }[] = [];
        if (groupingMode === 'DIARIO') {
            buckets = eachDayOfInterval({ start, end })
                .filter(d => !excludeWeekends || (d.getDay() !== 0 && d.getDay() !== 6))
                .map(d => ({
                    date: d,
                    label: format(d, 'dd MMM', { locale: es }),
                }));
        } else if (groupingMode === 'SEMANAL') {
            buckets = eachWeekOfInterval(
                { start, end },
                { weekStartsOn: 1 }
            ).map(d => ({
                date: d,
                label: `S${format(d, 'w', { locale: es })}`,
            }));
        } else {
            buckets = eachMonthOfInterval({ start, end }).map(d => ({
                date: d,
                label: format(d, 'MMM yyyy', { locale: es }),
            }));
        }

        const aggregate = (rangeStart: string, rangeEnd: string) => {
            const rangeItems = sliceByRange(rangeStart, rangeEnd);
            const map = new Map<string, number>();
            for (const it of rangeItems) {
                if ((it.unidad || '').toUpperCase() !== 'PLS' &&
                    (it.unidad || '').toUpperCase() !== 'PLN') continue;
                const f = it.cotizaciones?.fecha_emision;
                if (!f) continue;
                const d = parseISO(f);
                let key = '';
                if (groupingMode === 'DIARIO') key = format(d, 'yyyy-MM-dd');
                else if (groupingMode === 'SEMANAL')
                    key = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                else key = format(startOfMonth(d), 'yyyy-MM');
                map.set(key, (map.get(key) || 0) + (Number(it.cantidad) || 0));
            }
            return map;
        };

        const currentMap = aggregate(startDate, endDate);

        // For comparison, normalise its buckets to align positionally with the
        // current range so the lines overlay even if dates are different.
        let comparisonValues: number[] | null = null;
        if (compareEnabled) {
            const cStart = parseISO(compareStartDate);
            const cBuckets: Date[] =
                groupingMode === 'DIARIO'
                    ? excludeWeekends
                        ? eachDayOfInterval({ start: cStart, end: addDays(cStart, buckets.length + 13) })
                              .filter(d => d.getDay() !== 0 && d.getDay() !== 6)
                              .slice(0, buckets.length)
                        : eachDayOfInterval({
                              start: cStart,
                              end: addDays(cStart, buckets.length - 1),
                          })
                    : groupingMode === 'SEMANAL'
                    ? Array.from({ length: buckets.length }, (_, i) =>
                          addDays(cStart, i * 7)
                      )
                    : eachMonthOfInterval({
                          start: startOfMonth(cStart),
                          end: endOfMonth(addDays(cStart, 31 * (buckets.length - 1))),
                      }).slice(0, buckets.length);

            const cMap = aggregate(compareStartDate, compareEndDate);
            comparisonValues = cBuckets.map(d => {
                let key = '';
                if (groupingMode === 'DIARIO') key = format(d, 'yyyy-MM-dd');
                else if (groupingMode === 'SEMANAL')
                    key = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                else key = format(startOfMonth(d), 'yyyy-MM');
                return cMap.get(key) || 0;
            });
        }

        return buckets.map((b, idx) => {
            let key = '';
            if (groupingMode === 'DIARIO') key = format(b.date, 'yyyy-MM-dd');
            else if (groupingMode === 'SEMANAL')
                key = format(startOfWeek(b.date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
            else key = format(startOfMonth(b.date), 'yyyy-MM');
            return {
                label: b.label,
                real: currentMap.get(key) || 0,
                proyectado: comparisonValues ? comparisonValues[idx] : null,
            };
        });
    }, [
        sliceByRange,
        startDate,
        endDate,
        compareEnabled,
        compareStartDate,
        compareEndDate,
        groupingMode,
        excludeWeekends,
    ]);

    // ── Últimos servicios (last 4 cotizaciones with at least one item) ──────
    const ultimosServicios: ServicioRecientePresentacion[] = useMemo(() => {
        // Group all items by cotización first
        const grouped = new Map<string, { cot: NonNullable<CotizacionItemRow['cotizaciones']>; items: CotizacionItemRow[] }>();
        for (const it of currentRangeItems) {
            const c = it.cotizaciones;
            if (!c) continue;
            const entry = grouped.get(c.id);
            if (entry) entry.items.push(it);
            else grouped.set(c.id, { cot: c, items: [it] });
        }
        const result: ServicioRecientePresentacion[] = [];
        for (const [, { cot, items }] of grouped) {
            const ventaEntry = ventasParaDashboard.find(v => v.codigo_cotizacion === cot.codigo);
            // Pick item with highest monetary total as the display material
            let topItem = items[0];
            for (const it of items) {
                if ((Number(it.total) || 0) > (Number(topItem?.total) || 0)) topItem = it;
            }
            result.push({
                id: cot.id,
                codigo: cot.codigo,
                cliente: cot.cliente_nombre || '—',
                material: topItem?.descripcion || '—',
                materialesDetalle: items.map(it => ({
                    desc: it.descripcion || '—',
                    unidad: it.unidad || '',
                    qty: Number(it.cantidad) || 0,
                    total: Number(it.total) || 0,
                })),
                estado: friendlyEstado(cot.estado),
                monto: Number(cot.total) || 0,
                fecha: cot.fecha_emision,
                estadoPago: ventaEntry?.estado_pago ?? null,
                saldoPendiente: ventaEntry ? Number(ventaEntry.saldo_pendiente) : null,
            });
        }
        return result.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 5);
    }, [currentRangeItems, ventasParaDashboard]);

    const formatRangeLabel = (s: string, e: string) =>
        `${format(parseISO(s), 'dd MMM, yyyy', { locale: es })} — ${format(
            parseISO(e),
            'dd MMM, yyyy',
            { locale: es }
        )}`;

    // ── Quick filter for the dashboard header ───────────────────────────────
    const applyMainQuickFilter = (val: typeof mainQuickFilter) => {
        setMainQuickFilter(val);
        const n = new Date();
        if (val === 'HOY') {
            const d = format(n, 'yyyy-MM-dd');
            setStartDate(d);
            setEndDate(d);
            setDatePickerOpen(false);
        } else if (val === 'ULTIMOS_7') {
            setStartDate(format(subDays(n, 7), 'yyyy-MM-dd'));
            setEndDate(format(n, 'yyyy-MM-dd'));
            setDatePickerOpen(false);
        } else if (val === 'ULTIMOS_30') {
            setStartDate(format(subDays(n, 30), 'yyyy-MM-dd'));
            setEndDate(format(n, 'yyyy-MM-dd'));
            setDatePickerOpen(false);
        } else if (val === 'MES_ACTUAL') {
            setStartDate(format(startOfMonth(n), 'yyyy-MM-dd'));
            setEndDate(format(endOfMonth(n), 'yyyy-MM-dd'));
            setDatePickerOpen(false);
        } else {
            setDatePickerOpen(true);
        }
    };

    // ── Compare presets ─────────────────────────────────────────────────────
    const applyComparePreset = (preset: 'SEMANA' | 'MES') => {
        if (preset === 'SEMANA') {
            const lastWeek = subWeeks(today, 1);
            const s = format(startOfWeek(lastWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');
            const e = format(endOfWeek(lastWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');
            setCompareStartDate(s);
            setCompareEndDate(e);
            setCompareLabel('Semana anterior');
        } else {
            const lastMonth = subMonths(today, 1);
            const s = format(startOfMonth(lastMonth), 'yyyy-MM-dd');
            const e = format(endOfMonth(lastMonth), 'yyyy-MM-dd');
            setCompareStartDate(s);
            setCompareEndDate(e);
            setCompareLabel('Mes anterior');
        }
        setCompareEnabled(true);
        setCompareMenuOpen(false);
    };

    const applyCompareMonth = (d: Date) => {
        const s = format(startOfMonth(d), 'yyyy-MM-dd');
        const e = format(endOfMonth(d), 'yyyy-MM-dd');
        setCompareStartDate(s);
        setCompareEndDate(e);
        setCompareLabel(format(d, 'MMM yyyy', { locale: es }));
        setCompareEnabled(true);
        setCompareMenuOpen(false);
        setMonthPickerOpen(false);
    };

    // ── History modal helpers ───────────────────────────────────────────────
    const openHistory = () => {
        setHistoryOpen(true);
        setHistoryClosing(false);
    };
    const closeHistory = () => {
        setHistoryClosing(true);
        window.setTimeout(() => {
            setHistoryOpen(false);
            setHistoryClosing(false);
        }, 220);
    };

    // ── Clients modal helpers ───────────────────────────────────────────────
    const openClients = () => {
        setClientsOpen(true);
        setClientsClosing(false);
    };
    const closeClients = () => {
        setClientsClosing(true);
        window.setTimeout(() => {
            setClientsOpen(false);
            setClientsClosing(false);
        }, 220);
    };

    const openNewClient = (prefillName?: string) => {
        setNewClientData({ name: prefillName || '', type: 'CLIENT', tax_id: '', phone: '' });
        setNewClientError(null);
        setNewClientSuccess(false);
        setNewClientIsEdit(false);
        setNewClientEditId(null);
        setNewClientOpen(true);
        setNewClientClosing(false);
    };

    const openEditClient = (contact: { id: string; name: string; type: string; tax_id: string | null; phone: string | null }) => {
        setNewClientData({
            name: contact.name,
            type: contact.type as 'CLIENT' | 'SUPPLIER' | 'BOTH',
            tax_id: contact.tax_id ?? '',
            phone: contact.phone ?? '',
        });
        setNewClientError(null);
        setNewClientSuccess(false);
        setNewClientIsEdit(true);
        setNewClientEditId(contact.id);
        setNewClientOpen(true);
        setNewClientClosing(false);
    };
    const closeNewClient = () => {
        setNewClientClosing(true);
        window.setTimeout(() => {
            setNewClientOpen(false);
            setNewClientClosing(false);
        }, 220);
    };
    const saveNewClient = async () => {
        if (!newClientData.name.trim()) {
            setNewClientError('El nombre es requerido');
            return;
        }
        setNewClientSaving(true);
        setNewClientError(null);
        try {
            const payload = {
                name: newClientData.name.trim(),
                type: newClientData.type,
                tax_id: newClientData.tax_id.trim() || null,
                phone: newClientData.phone.trim() || null,
            };
            const { error } = newClientIsEdit && newClientEditId
                ? await supabase.from('contacts').update(payload).eq('id', newClientEditId)
                : await supabase.from('contacts').insert(payload);
            if (error) {
                if (error.code === '23505' || error.message?.includes('contacts_tax_id_key')) {
                    setNewClientError('El DNI / RUC ingresado ya está registrado en el sistema.');
                } else {
                    setNewClientError(error.message || 'Error al guardar');
                }
                return;
            }
            // Refresh contacts cache so pencil stays in sync
            const refreshed = await supabase.from('contacts').select('id,name,type,tax_id,phone').eq('type', 'CLIENT');
            if (refreshed.data) setClientContacts(refreshed.data as any);
            setNewClientSuccess(true);
            window.setTimeout(() => closeNewClient(), 2000);
        } catch (e: any) {
            setNewClientError(e?.message || 'Error al guardar');
        } finally {
            setNewClientSaving(false);
        }
    };

    const applyClientsQuickFilter = (val: typeof clientsQuickFilter) => {
        setClientsQuickFilter(val);
        const n = new Date();
        if (val === 'HOY') {
            const d = format(n, 'yyyy-MM-dd');
            setClientsStart(d);
            setClientsEnd(d);
        } else if (val === 'ULTIMOS_7') {
            setClientsStart(format(subDays(n, 7), 'yyyy-MM-dd'));
            setClientsEnd(format(n, 'yyyy-MM-dd'));
        } else if (val === 'ULTIMOS_30') {
            setClientsStart(format(subDays(n, 30), 'yyyy-MM-dd'));
            setClientsEnd(format(n, 'yyyy-MM-dd'));
        } else if (val === 'MES_ACTUAL') {
            setClientsStart(format(startOfMonth(n), 'yyyy-MM-dd'));
            setClientsEnd(format(endOfMonth(n), 'yyyy-MM-dd'));
        } else if (val === 'TODO') {
            // Use a very broad range as "all time"
            setClientsStart('2000-01-01');
            setClientsEnd(format(n, 'yyyy-MM-dd'));
        }
    };

    // Fetch items for the clients range (decoupled from dashboard scope) and
    // load ventas_cabecera (for saldo_pendiente per cliente).
    useEffect(() => {
        if (!clientsOpen) return;
        let cancelled = false;
        (async () => {
            try {
                const [itemsRes, ventasRes] = await Promise.all([
                    supabase
                        .from('cotizaciones_items')
                        .select(
                            'cantidad,unidad,descripcion,total,created_at,cotizacion_id,' +
                                'cotizaciones!inner(id,codigo,cliente_nombre,fecha_emision,estado,total)'
                        )
                        .neq('cotizaciones.estado', 'ELIMINADO')
                        .gte('cotizaciones.fecha_emision', clientsStart)
                        .lte('cotizaciones.fecha_emision', clientsEnd)
                        .order('created_at', { ascending: false }),
                    supabase
                        .from('ventas_cabecera')
                        .select('cliente_nombre,saldo_pendiente,estado_pago'),
                ]);
                if (cancelled) return;
                if (itemsRes.data) {
                    setItems(prev => {
                        const seen = new Set(prev.map(p => `${p.cotizacion_id}|${p.descripcion}|${p.cantidad}`));
                        const merged = [...prev];
                        for (const row of itemsRes.data as unknown as CotizacionItemRow[]) {
                            const key = `${row.cotizacion_id}|${row.descripcion}|${row.cantidad}`;
                            if (!seen.has(key)) merged.push(row);
                        }
                        return merged;
                    });
                }
                if (ventasRes.data) {
                    setVentasCabecera(ventasRes.data as any);
                }
                // Also load contacts of type CLIENT for the edit pencil
                const contactsRes = await supabase
                    .from('contacts')
                    .select('id,name,type,tax_id,phone')
                    .eq('type', 'CLIENT');
                if (!cancelled && contactsRes.data) {
                    setClientContacts(contactsRes.data as any);
                }
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [clientsOpen, clientsStart, clientsEnd]);

    // Aggregate per-client stats
    const clientsRows = useMemo(() => {
        const inRange = items.filter(it => {
            const f = it.cotizaciones?.fecha_emision;
            if (!f) return false;
            return f >= clientsStart && f <= clientsEnd;
        });

        interface ClientAgg {
            cliente: string;
            ventas: Set<string>; // unique cotizacion ids
            tableros: number;
            materialCount: Map<string, number>;
            ultimaFecha: string;
        }
        const grouped = new Map<string, ClientAgg>();
        for (const it of inRange) {
            const c = it.cotizaciones;
            if (!c) continue;
            const key = (c.cliente_nombre || '— Sin nombre —').trim();
            let agg = grouped.get(key);
            if (!agg) {
                agg = {
                    cliente: key,
                    ventas: new Set(),
                    tableros: 0,
                    materialCount: new Map(),
                    ultimaFecha: c.fecha_emision,
                };
                grouped.set(key, agg);
            }
            agg.ventas.add(c.id);
            const u = (it.unidad || '').toUpperCase();
            const isTablero = u === 'PLS' || u === 'PLN';
            if (isTablero) {
                agg.tableros += Number(it.cantidad) || 0;
                const desc = (it.descripcion || '').trim();
                if (desc) {
                    agg.materialCount.set(desc, (agg.materialCount.get(desc) || 0) + (Number(it.cantidad) || 0));
                }
            }
            if (c.fecha_emision > agg.ultimaFecha) agg.ultimaFecha = c.fecha_emision;
        }

        // Build deuda lookup from ventas_cabecera
        const debtByClient = new Map<string, number>();
        for (const v of ventasCabecera) {
            const k = (v.cliente_nombre || '').trim();
            if (!k) continue;
            if (v.estado_pago === 'CANCELADO') continue;
            debtByClient.set(k, (debtByClient.get(k) || 0) + (Number(v.saldo_pendiente) || 0));
        }

        let rows = Array.from(grouped.values()).map(agg => {
            let topMaterial = '—';
            let topCount = -1;
            for (const [name, count] of agg.materialCount) {
                if (count > topCount) {
                    topCount = count;
                    topMaterial = name;
                }
            }
            const deuda = debtByClient.get(agg.cliente) || 0;
            return {
                cliente: agg.cliente,
                ventas: agg.ventas.size,
                tableros: agg.tableros,
                topMaterial,
                deuda,
                ultimaFecha: agg.ultimaFecha,
            };
        });

        // Filters
        if (clientsSearch.trim()) {
            const q = clientsSearch.toLowerCase();
            rows = rows.filter(r => r.cliente.toLowerCase().includes(q));
        }
        if (clientsDebtFilter === 'CON_DEUDA') rows = rows.filter(r => r.deuda > 0);
        else if (clientsDebtFilter === 'SIN_DEUDA') rows = rows.filter(r => r.deuda <= 0);

        if (clientsSort) {
            const { col, dir } = clientsSort;
            rows = rows.sort((a, b) =>
                dir === 'asc'
                    ? a[col] - b[col]
                    : b[col] - a[col]
            );
        } else {
            rows = rows.sort((a, b) => a.cliente.localeCompare(b.cliente, 'es'));
        }
        return rows;
    }, [items, ventasCabecera, clientsStart, clientsEnd, clientsSearch, clientsDebtFilter, clientsSort]);

    const applyHistoryQuickFilter = (val: typeof historyQuickFilter) => {
        setHistoryQuickFilter(val);
        const n = new Date();
        if (val === 'ULTIMOS_7') {
            setHistoryStart(format(subDays(n, 7), 'yyyy-MM-dd'));
            setHistoryEnd(format(n, 'yyyy-MM-dd'));
        } else if (val === 'ULTIMOS_30') {
            setHistoryStart(format(subDays(n, 30), 'yyyy-MM-dd'));
            setHistoryEnd(format(n, 'yyyy-MM-dd'));
        } else if (val === 'MES_ACTUAL') {
            setHistoryStart(format(startOfMonth(n), 'yyyy-MM-dd'));
            setHistoryEnd(format(endOfMonth(n), 'yyyy-MM-dd'));
        }
    };

    // History: independent slice so the filter inside the modal is decoupled
    const historyItemsByCotizacion = useMemo(() => {
        // Pull items that fall in the history range (separate from the dashboard range)
        const inRange = items.filter(it => {
            const f = it.cotizaciones?.fecha_emision;
            if (!f) return false;
            return f >= historyStart && f <= historyEnd;
        });
        const grouped = new Map<string, { cot: NonNullable<CotizacionItemRow['cotizaciones']>; items: CotizacionItemRow[] }>();
        for (const it of inRange) {
            const c = it.cotizaciones;
            if (!c) continue;
            if (historyEstado !== 'TODOS') {
                const ventaEntry = ventasParaDashboard.find(v => v.codigo_cotizacion === c.codigo);
                if (!ventaEntry || ventaEntry.estado_pago !== historyEstado) continue;
            }
            if (historySearch.trim()) {
                const q = historySearch.toLowerCase();
                if (
                    !(c.codigo?.toLowerCase().includes(q) ||
                        c.cliente_nombre?.toLowerCase().includes(q))
                ) {
                    continue;
                }
            }
            const entry = grouped.get(c.id);
            if (entry) entry.items.push(it);
            else grouped.set(c.id, { cot: c, items: [it] });
        }
        return Array.from(grouped.values()).sort((a, b) =>
            a.cot.fecha_emision < b.cot.fecha_emision ? 1 : -1
        );
    }, [items, historyStart, historyEnd, historyEstado, historySearch, ventasParaDashboard]);

    // Make sure the underlying fetch covers the history range too
    useEffect(() => {
        if (historyOpen) {
            // No-op: data fetched on demand uses dashboard range; we extend it
            // here so the modal can show the user-selected range.
            // Done via a transient extension: refetch the broader window if needed.
            const needsRefetch =
                historyStart < startDate || historyEnd > endDate;
            if (needsRefetch) {
                // Temporarily widen the fetch by using supabase directly so we
                // don't pollute the dashboard's stat scope.
                (async () => {
                    try {
                        const { data } = await supabase
                            .from('cotizaciones_items')
                            .select(
                                'cantidad,unidad,descripcion,total,created_at,cotizacion_id,' +
                                    'cotizaciones!inner(id,codigo,cliente_nombre,fecha_emision,estado,total)'
                            )
                            .neq('cotizaciones.estado', 'ELIMINADO')
                            .gte('cotizaciones.fecha_emision', historyStart)
                            .lte('cotizaciones.fecha_emision', historyEnd)
                            .order('created_at', { ascending: false });
                        if (data) {
                            // Merge into items state, deduping by id
                            setItems(prev => {
                                const seen = new Set(prev.map(p => `${p.cotizacion_id}|${p.descripcion}|${p.cantidad}`));
                                const merged = [...prev];
                                for (const row of data as unknown as CotizacionItemRow[]) {
                                    const key = `${row.cotizacion_id}|${row.descripcion}|${row.cantidad}`;
                                    if (!seen.has(key)) merged.push(row);
                                }
                                return merged;
                            });
                        }
                    } catch {
                        /* ignore */
                    }
                })();
            }
        }
    }, [historyOpen, historyStart, historyEnd, startDate, endDate]);

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <div
            className="space-y-8 pt-8 pb-24 px-8 animate-in fade-in duration-500"
            style={{ fontFamily: "'Manrope', sans-serif" }}
        >
            {/* HEADER */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                        Visión General
                    </h2>
                    <p className="text-slate-400 font-medium text-sm mt-1">
                        Estado actual de la producción y flujo de servicios operativos.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* CLIENTES modal trigger */}
                    <button
                        onClick={openClients}
                        className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl shadow-sm hover:shadow-md hover:bg-slate-800 transition-all"
                        title="Ver clientes"
                    >
                        <Users className="w-4 h-4" />
                        <span className="text-[11px] font-black tracking-widest uppercase">Clientes</span>
                    </button>

                    {/* Quick filter dropdown */}
                    <div className="relative">
                        <select
                            value={mainQuickFilter}
                            onChange={e => applyMainQuickFilter(e.target.value as any)}
                            className="bg-white border border-slate-200 px-5 py-3 pr-10 rounded-2xl text-[11px] font-black text-slate-700 tracking-widest uppercase outline-none appearance-none cursor-pointer shadow-sm hover:shadow-md transition-all"
                        >
                            <option value="HOY">Hoy</option>
                            <option value="ULTIMOS_7">Últimos 7 días</option>
                            <option value="ULTIMOS_30">Últimos 30 días</option>
                            <option value="MES_ACTUAL">Mes actual</option>
                            <option value="PERSONALIZADO">Personalizado</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                    </div>

                    {/* Date range button (only for "Personalizado") */}
                    {mainQuickFilter === 'PERSONALIZADO' && (
                        <div ref={datePickerWrapRef} className="relative">
                            <button
                                onClick={() => setDatePickerOpen(o => !o)}
                                className="flex items-center gap-2 px-5 py-3 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all"
                            >
                                <Calendar className="w-4 h-4 text-slate-500" />
                                <span className="text-[11px] font-black text-slate-700 tracking-widest uppercase">
                                    {formatRangeLabel(startDate, endDate)}
                                </span>
                                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${datePickerOpen ? 'rotate-180' : ''}`} />
                            </button>
                            <RangeDatePicker
                                isOpen={datePickerOpen}
                                startDate={startDate}
                                endDate={endDate}
                                align="right"
                                onApply={(s, e) => {
                                    setStartDate(s);
                                    setEndDate(e);
                                    setDatePickerOpen(false);
                                }}
                                onCancel={() => setDatePickerOpen(false)}
                            />
                        </div>
                    )}

                    <button
                        onClick={fetchData}
                        className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all text-slate-500 hover:text-slate-700"
                        title="Refrescar"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {fetchError && (
                <div className="bg-rose-50 border-2 border-rose-200 text-rose-600 rounded-2xl p-4 text-xs font-black uppercase tracking-widest">
                    ⚠️ {fetchError}
                </div>
            )}

            {/* KPI CARDS */}
            <div className="grid grid-cols-3 gap-5 items-stretch">
                <KpiCard
                    label="Tableros Vendidos"
                    value={loading ? '—' : formatNumber(totals.pls, 0)}
                    helper="Unidades acumuladas en el rango"
                    icon={<LayoutGrid className="w-5 h-5 text-slate-400" />}
                    accent="#2c3434"
                />
                <KpiCard
                    label="Metros de Canto"
                    value={loading ? '—' : formatNumber(totals.mts, 0)}
                    helper="Uso total en producción actual"
                    icon={<Ruler className="w-5 h-5 text-slate-400" />}
                    accent="#2c3434"
                />
                <KpiCard
                    label="Monto de Servicio"
                    value={loading ? '—' : `S/ ${formatNumber(totals.serv, 0)}`}
                    helper="Ingresos brutos por servicios realizados"
                    icon={<Wrench className="w-5 h-5 text-slate-400" />}
                    accent="#2c3434"
                />
            </div>

            {/* CHART CARD */}
            <div className="bg-white p-7 rounded-[2rem] border border-slate-200 shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight">
                            Comparativo Histórico
                        </h3>
                        <p className="text-slate-400 font-medium text-xs mt-1">
                            Tableros vendidos · vista {groupingMode.toLowerCase()}
                            {compareEnabled
                                ? ` · vs. ${formatRangeLabel(compareStartDate, compareEndDate)}`
                                : ''}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Grouping toggle */}
                        <div className="bg-slate-100 rounded-full p-1 flex">
                            {(['DIARIO', 'SEMANAL', 'MENSUAL'] as GroupingMode[]).map(g => (
                                <button
                                    key={g}
                                    onClick={() => setGroupingMode(g)}
                                    className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-full transition-all ${
                                        groupingMode === g
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>
                        {/* Exclude weekends toggle (only relevant in DIARIO mode) */}
                        {groupingMode === 'DIARIO' && (
                            <button
                                onClick={() => setExcludeWeekends(v => !v)}
                                className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-full border transition-all ${
                                    excludeWeekends
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                Sin S/D
                            </button>
                        )}
                        {/* Comparison: opens a small menu with quick presets */}
                        <div ref={compareWrapRef} className="relative">
                            <button
                                onClick={() => {
                                    setCompareMenuOpen(o => !o);
                                    setMonthPickerOpen(false);
                                }}
                                className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-full border transition-all ${
                                    compareEnabled
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                {compareEnabled ? compareLabel : 'Comparar'}
                                <ChevronDown className={`w-3 h-3 transition-transform ${compareMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {compareMenuOpen && !monthPickerOpen && (
                                <div className="absolute right-0 mt-2 w-64 z-30 bg-white rounded-2xl border border-slate-200 shadow-[0_20px_45px_rgba(0,0,0,0.12)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <button
                                        onClick={() => applyComparePreset('SEMANA')}
                                        className="w-full px-4 py-3 text-left text-[11px] font-black text-slate-700 uppercase tracking-widest hover:bg-slate-50 flex items-center justify-between"
                                    >
                                        Semana anterior
                                        {compareEnabled && compareLabel === 'Semana anterior' && <Check className="w-3 h-3 text-emerald-500" />}
                                    </button>
                                    <button
                                        onClick={() => applyComparePreset('MES')}
                                        className="w-full px-4 py-3 text-left text-[11px] font-black text-slate-700 uppercase tracking-widest hover:bg-slate-50 flex items-center justify-between"
                                    >
                                        Mes anterior
                                        {compareEnabled && compareLabel === 'Mes anterior' && <Check className="w-3 h-3 text-emerald-500" />}
                                    </button>
                                    <button
                                        onClick={() => setMonthPickerOpen(true)}
                                        className="w-full px-4 py-3 text-left text-[11px] font-black text-slate-700 uppercase tracking-widest hover:bg-slate-50 flex items-center justify-between"
                                    >
                                        Elegir un mes
                                        <ChevronDown className="w-3 h-3 -rotate-90 text-slate-400" />
                                    </button>
                                    {compareEnabled && (
                                        <button
                                            onClick={() => {
                                                setCompareEnabled(false);
                                                setCompareMenuOpen(false);
                                                setCompareLabel('Comparar');
                                            }}
                                            className="w-full px-4 py-3 text-left text-[10px] font-black text-rose-500 uppercase tracking-widest hover:bg-rose-50 border-t border-slate-100"
                                        >
                                            Quitar comparación
                                        </button>
                                    )}
                                </div>
                            )}
                            {compareMenuOpen && monthPickerOpen && (
                                <div className="absolute right-0 mt-2 w-72 z-30 bg-white rounded-2xl border border-slate-200 shadow-[0_20px_45px_rgba(0,0,0,0.12)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                        <button
                                            onClick={() => setMonthPickerCursor(d => new Date(d.getFullYear() - 1, 0, 1))}
                                            className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
                                        >
                                            <ChevronDown className="w-4 h-4 rotate-90" />
                                        </button>
                                        <span className="text-[11px] font-black text-slate-700 tracking-widest uppercase">
                                            {monthPickerCursor.getFullYear()}
                                        </span>
                                        <button
                                            onClick={() => setMonthPickerCursor(d => new Date(d.getFullYear() + 1, 0, 1))}
                                            className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
                                        >
                                            <ChevronDown className="w-4 h-4 -rotate-90" />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 p-3">
                                        {Array.from({ length: 12 }, (_, i) => i).map(monthIdx => {
                                            const d = new Date(monthPickerCursor.getFullYear(), monthIdx, 1);
                                            const monthLabel = format(d, 'MMM', { locale: es });
                                            return (
                                                <button
                                                    key={monthIdx}
                                                    onClick={() => applyCompareMonth(d)}
                                                    className="px-2 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 rounded-lg hover:bg-slate-900 hover:text-white transition-all"
                                                >
                                                    {monthLabel}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <button
                                        onClick={() => setMonthPickerOpen(false)}
                                        className="w-full px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 border-t border-slate-100"
                                    >
                                        ← Volver
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="w-full h-[300px]">
                    <AdministratorChart chartData={chartData} compareEnabled={compareEnabled} />
                </div>
            </div>

            {/* ÚLTIMOS SERVICIOS TABLE */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-[0_10px_40px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-7 py-6 flex items-center justify-between border-b border-slate-100">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                        Últimos Servicios
                    </h3>
                    <button
                        onClick={openHistory}
                        className="text-[11px] font-black text-slate-500 hover:text-slate-900 uppercase tracking-widest flex items-center gap-1 transition-colors"
                    >
                        Ver todo el historial →
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] bg-slate-50/60">
                                <th className="px-7 py-4">ID Servicio</th>
                                <th className="px-7 py-4">Cliente</th>
                                <th className="px-7 py-4">Material</th>
                                <th className="px-7 py-4">Balance de Pago</th>
                                <th className="px-7 py-4 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="py-16 text-center text-slate-300 font-black uppercase tracking-widest text-xs">
                                        Cargando datos…
                                    </td>
                                </tr>
                            ) : ultimosServicios.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-16 text-center text-slate-300 font-black uppercase tracking-widest text-xs">
                                        Sin servicios en el rango seleccionado
                                    </td>
                                </tr>
                            ) : (
                                ultimosServicios.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-50/40 transition-colors">
                                        <td className="px-7 py-5 text-[13px] font-black text-slate-900 tracking-tight">
                                            #{s.codigo}
                                        </td>
                                        <td className="px-7 py-5 text-[13px] font-black text-slate-700">
                                            {s.cliente}
                                        </td>
                                        <td
                                            className="px-7 py-5"
                                            onMouseEnter={e => {
                                                if (matTooltipLeaveRef.current) clearTimeout(matTooltipLeaveRef.current);
                                                if (s.materialesDetalle.length === 0) return;
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                const tooltipH = Math.min(s.materialesDetalle.length * 28 + 40, 300);
                                                const spaceBelow = window.innerHeight - r.bottom;
                                                const x = Math.min(r.left, window.innerWidth - 250);
                                                const y = spaceBelow < tooltipH + 12 ? r.top - tooltipH - 6 : r.bottom + 6;
                                                setMatTooltip({ x, y, items: s.materialesDetalle });
                                            }}
                                            onMouseLeave={() => {
                                                matTooltipLeaveRef.current = setTimeout(() => setMatTooltip(null), 120);
                                            }}
                                        >
                                            <span className="text-[12px] font-bold text-slate-500 cursor-default underline decoration-dashed decoration-slate-300 underline-offset-2">
                                                {s.material}
                                            </span>
                                        </td>
                                        <td className="px-7 py-5">
                                            {s.estadoPago ? (
                                                <div className="flex items-center gap-3">
                                                    <span className={`px-3 py-1 text-[9px] font-black rounded-full border tracking-widest uppercase ${
                                                        s.estadoPago === 'CANCELADO'
                                                            ? 'bg-[#dcfce7] text-[#166534] border-[#bbf7d0]'
                                                            : 'bg-amber-50 text-amber-700 border-amber-100'
                                                    }`}>
                                                        {s.estadoPago}
                                                    </span>
                                                    {s.saldoPendiente !== null && s.saldoPendiente > 0 && (
                                                        <span className="text-[11px] font-black text-[#366480]/60 tabular-nums">
                                                            S/ {formatNumber(s.saldoPendiente, 2)}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="px-3 py-1 text-[9px] font-black rounded-full border tracking-widest uppercase bg-slate-100 text-slate-400 border-slate-200">
                                                    {s.estado}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-7 py-5 text-right text-[13px] font-black text-slate-900 tabular-nums">
                                            S/ {formatNumber(s.monto, 2)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Material tooltip portal */}
            {matTooltip && createPortal(
                <div
                    style={{ position: 'fixed', left: matTooltip.x, top: matTooltip.y, zIndex: 9999, fontFamily: "'Manrope', sans-serif", minWidth: '200px', maxWidth: '245px' }}
                    onMouseEnter={() => { if (matTooltipLeaveRef.current) clearTimeout(matTooltipLeaveRef.current); }}
                    onMouseLeave={() => setMatTooltip(null)}
                    className="bg-white border border-slate-200 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-3"
                >
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Items del servicio</p>
                    <div className="space-y-1.5">
                        {matTooltip.items.map((m, i) => (
                            <div key={i} className="flex items-start justify-between gap-2">
                                <span className="text-[10px] font-semibold text-slate-700 uppercase leading-tight">{m.desc}</span>
                                <span className="text-[10px] text-slate-500 whitespace-nowrap tabular-nums shrink-0">{m.qty % 1 === 0 ? m.qty : m.qty.toFixed(2)} {m.unidad} · S/{formatNumber(m.total, 2)}</span>
                            </div>
                        ))}
                    </div>
                </div>,
                document.body
            )}

            {/* HISTORY MODAL */}
            {historyOpen && createPortal(
                <div
                    className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden ${historyClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
                    style={{ backdropFilter: 'blur(6px)', fontFamily: "'Manrope', sans-serif" }}
                >
                    <div
                        className={`bg-white/95 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-5xl border border-white/50 flex flex-col max-h-[92vh] relative overflow-hidden ${historyClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                        {/* Header */}
                        <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40">
                            <div className="flex items-center gap-4">
                                <HistoryIcon className="w-7 h-7 text-[#4A90E2] drop-shadow-sm" />
                                <div>
                                    <h2 className="text-xl font-black text-[#2c3434] uppercase tracking-tight">
                                        Historial de Servicios
                                    </h2>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                        Detalle técnico por cotización
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={closeHistory}
                                className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Advanced filter bar */}
                        <div className="px-8 py-4 flex flex-wrap items-center gap-3 border-b border-[#f0f5f4] bg-white/40">
                            <div className="relative flex-1 min-w-[260px]">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b9ba5]" />
                                <input
                                    type="text"
                                    value={historySearch}
                                    onChange={e => setHistorySearch(e.target.value)}
                                    placeholder="Buscar por código o cliente..."
                                    className="w-full pl-12 pr-6 py-3 bg-[#f8faf9] border-none rounded-full text-[12px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#8b9ba5]"
                                />
                            </div>
                            <div className="relative">
                                <select
                                    value={historyEstado}
                                    onChange={e => setHistoryEstado(e.target.value as any)}
                                    className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
                                >
                                    <option value="TODOS">Todos</option>
                                    <option value="PENDIENTE">Pendiente</option>
                                    <option value="PARCIAL">Parcial</option>
                                    <option value="CANCELADO">Cancelado</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                            </div>
                            <div className="relative">
                                <select
                                    value={historyQuickFilter}
                                    onChange={e => applyHistoryQuickFilter(e.target.value as any)}
                                    className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
                                >
                                    <option value="ULTIMOS_7">Últimos 7 días</option>
                                    <option value="ULTIMOS_30">Últimos 30 días</option>
                                    <option value="MES_ACTUAL">Mes actual</option>
                                    <option value="PERSONALIZADO">Personalizado</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                            </div>
                            {historyQuickFilter === 'PERSONALIZADO' && (
                                <div ref={historyDatePickerWrapRef} className="relative">
                                    <button
                                        onClick={() => setHistoryDatePickerOpen(o => !o)}
                                        className="flex items-center gap-3 px-6 py-3 bg-[#f8faf9] text-[#366480] rounded-full text-[12px] font-bold hover:bg-[#e8eded] transition-all"
                                    >
                                        <Calendar className="w-4 h-4 text-[#4A90E2]" />
                                        {format(parseISO(historyStart), 'dd MMM', { locale: es })} — {format(parseISO(historyEnd), 'dd MMM', { locale: es })}
                                        <ChevronDown className={`w-3 h-3 transition-transform ${historyDatePickerOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    <RangeDatePicker
                                        isOpen={historyDatePickerOpen}
                                        startDate={historyStart}
                                        endDate={historyEnd}
                                        align="right"
                                        triggerRef={historyDatePickerWrapRef}
                                        onApply={(s, e) => {
                                            setHistoryStart(s);
                                            setHistoryEnd(e);
                                            setHistoryDatePickerOpen(false);
                                        }}
                                        onCancel={() => setHistoryDatePickerOpen(false)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Cotizaciones list */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                            {historyItemsByCotizacion.length === 0 ? (
                                <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                                    <p className="text-slate-300 font-black uppercase tracking-widest text-xs italic">
                                        Sin cotizaciones en el rango seleccionado
                                    </p>
                                </div>
                            ) : (
                                historyItemsByCotizacion.map(({ cot, items: rows }) => {
                                    const isExpanded = expandedHistoryId === cot.id;
                                    return (
                                        <div
                                            key={cot.id}
                                            className={`bg-white border rounded-[1.5rem] shadow-sm transition-all overflow-hidden ${
                                                isExpanded ? 'border-[#4A90E2]/40 shadow-md' : 'border-[#d3dcdb]/30'
                                            }`}
                                        >
                                            <button
                                                onClick={() => setExpandedHistoryId(isExpanded ? null : cot.id)}
                                                className="w-full flex items-center justify-between gap-6 px-7 py-5 hover:bg-slate-50/50 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-6 min-w-0">
                                                    <div className="flex flex-col">
                                                        <span className="text-[13px] font-bold text-[#2c3434] uppercase tracking-tight">
                                                            #{highlight(cot.codigo, historySearch)}
                                                        </span>
                                                        <span className="text-[10px] font-medium text-[#366480]/50 uppercase tracking-widest mt-0.5">
                                                            {format(parseISO(cot.fecha_emision), "dd MMM, yyyy", { locale: es })}
                                                        </span>
                                                    </div>
                                                    <div className="w-px h-10 bg-[#d3dcdb]/30 hidden sm:block" />
                                                    <p className="text-[13px] font-semibold text-[#366480] uppercase tracking-tight truncate">
                                                        {highlight(cot.cliente_nombre || '—', historySearch)}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-4 flex-shrink-0">
                                                    {(() => {
                                                        const ve = ventasParaDashboard.find(v => v.codigo_cotizacion === cot.codigo);
                                                        const ds = ve?.estado_pago || (cot.estado === 'BORRADOR' ? 'BORRADOR' : 'LISTO');
                                                        return (
                                                            <span className={`px-4 py-1.5 text-[10px] font-bold rounded-full border tracking-widest uppercase ${ESTADO_BADGE[ds] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                                {ds}
                                                            </span>
                                                        );
                                                    })()}
                                                    <span className="text-[14px] font-bold text-[#2c3434] tabular-nums">
                                                        S/ {formatNumber(Number(cot.total) || 0, 2)}
                                                    </span>
                                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[#4A90E2]" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <div className="px-7 pb-6 animate-desglose">
                                                    <div className="bg-[#f7faf9]/40 border border-[#d3dcdb]/20 rounded-[20px] p-6">
                                                        <p className="text-[10px] font-semibold text-[#366480]/40 uppercase tracking-[0.2em] mb-5 border-b border-[#d3dcdb]/20 pb-3 italic">
                                                            Desglose Técnico del Proyecto
                                                        </p>
                                                        <table className="w-full text-[12px]">
                                                            <thead className="text-[#366480]/40 uppercase border-b border-[#d3dcdb]/10">
                                                                <tr className="text-[10px] tracking-[0.2em]">
                                                                    <th className="pb-3 text-left font-semibold">Componente / Recurso</th>
                                                                    <th className="pb-3 text-left font-semibold">Unidad</th>
                                                                    <th className="pb-3 text-left font-semibold">Cantidad</th>
                                                                    <th className="pb-3 text-right font-semibold">Subtotal</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-[#d3dcdb]/10">
                                                                {rows.map((r, idx) => (
                                                                    <tr key={`${cot.id}-${idx}`} className="hover:bg-white/60 transition-colors">
                                                                        <td className="py-3 text-left uppercase text-[#366480]/80 font-semibold tracking-tight">
                                                                            {r.descripcion || '—'}
                                                                        </td>
                                                                        <td className="py-3 text-left text-[#366480]/60 font-medium uppercase tracking-widest text-[10px]">
                                                                            {r.unidad}
                                                                        </td>
                                                                        <td className="py-3 text-left tabular-nums font-semibold text-[#2c3434]">
                                                                            {Number(r.cantidad).toFixed(2)}
                                                                        </td>
                                                                        <td className="py-3 text-right text-[#2c3434] font-bold tabular-nums">
                                                                            S/ {formatNumber(Number(r.total) || 0, 2)}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                                {(() => {
                                                                    const subtotal = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
                                                                    const igv = subtotal * 0.18;
                                                                    const grandTotal = subtotal + igv;
                                                                    return (
                                                                        <>
                                                                            <tr className="border-t-2 border-[#d3dcdb]/20">
                                                                                <td colSpan={3} className="pt-4 pb-1 text-right text-[10px] font-semibold text-[#366480]/50 uppercase tracking-widest pr-3">Subtotal</td>
                                                                                <td className="pt-4 pb-1 text-right text-[#2c3434] font-bold tabular-nums">S/ {formatNumber(subtotal, 2)}</td>
                                                                            </tr>
                                                                            <tr>
                                                                                <td colSpan={3} className="py-1 text-right text-[10px] font-semibold text-[#366480]/50 uppercase tracking-widest pr-3">IGV (18%)</td>
                                                                                <td className="py-1 text-right text-[#2c3434] font-bold tabular-nums">S/ {formatNumber(igv, 2)}</td>
                                                                            </tr>
                                                                            <tr className="border-t border-[#d3dcdb]/20">
                                                                                <td colSpan={3} className="pt-3 text-right text-[11px] font-bold text-[#2c3434] uppercase tracking-widest pr-3">Total</td>
                                                                                <td className="pt-3 text-right text-[14px] font-extrabold text-[#2c3434] tabular-nums">S/ {formatNumber(grandTotal, 2)}</td>
                                                                            </tr>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* CLIENTS MODAL */}
            {clientsOpen && createPortal(
                <div
                    className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden ${clientsClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
                    style={{ backdropFilter: 'blur(6px)', fontFamily: "'Manrope', sans-serif" }}
                >
                    <div
                        className={`bg-white/95 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-5xl border border-white/50 flex flex-col max-h-[92vh] relative overflow-hidden ${clientsClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}
                    >
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                        {/* Header */}
                        <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40">
                            <div className="flex items-center gap-4">
                                <Users className="w-7 h-7 text-[#4A90E2] drop-shadow-sm" />
                                <div>
                                    <h2 className="text-xl font-black text-[#2c3434] uppercase tracking-tight">
                                        Clientes
                                    </h2>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                        Ventas, consumo y deuda por cliente
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => { setEditClientSearch(''); setEditClientListOpen(true); setEditClientListClosing(false); }}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                    <span>Editar</span>
                                </button>
                                <button
                                    onClick={openNewClient}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-800 transition-all"
                                >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    <span>Registrar</span>
                                </button>
                                <button
                                    onClick={closeClients}
                                    className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Filter bar */}
                        <div className="px-8 py-4 flex flex-wrap items-center gap-3 border-b border-[#f0f5f4] bg-white/40">
                            <div className="relative flex-1 min-w-[260px]">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b9ba5]" />
                                <input
                                    type="text"
                                    value={clientsInputValue}
                                    onChange={e => setClientsInputValue(e.target.value)}
                                    placeholder="Buscar cliente..."
                                    className="w-full pl-12 pr-6 py-3 bg-[#f8faf9] border-none rounded-full text-[12px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#8b9ba5]"
                                />
                            </div>
                            <div className="relative">
                                <select
                                    value={clientsDebtFilter}
                                    onChange={e => setClientsDebtFilter(e.target.value as any)}
                                    className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
                                >
                                    <option value="TODOS">Todos</option>
                                    <option value="CON_DEUDA">Con deuda</option>
                                    <option value="SIN_DEUDA">Sin deuda</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                            </div>
                            <div className="relative">
                                <select
                                    value={clientsQuickFilter}
                                    onChange={e => applyClientsQuickFilter(e.target.value as any)}
                                    className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
                                >
                                    <option value="TODO">Histórico completo</option>
                                    <option value="HOY">Hoy</option>
                                    <option value="ULTIMOS_7">Últimos 7 días</option>
                                    <option value="ULTIMOS_30">Últimos 30 días</option>
                                    <option value="MES_ACTUAL">Mes actual</option>
                                    <option value="PERSONALIZADO">Personalizado</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                            </div>
                            {clientsQuickFilter === 'PERSONALIZADO' && (
                                <div ref={clientsDatePickerWrapRef} className="relative">
                                    <button
                                        onClick={() => setClientsDatePickerOpen(o => !o)}
                                        className="flex items-center gap-3 px-6 py-3 bg-[#f8faf9] text-[#366480] rounded-full text-[12px] font-bold hover:bg-[#e8eded] transition-all"
                                    >
                                        <Calendar className="w-4 h-4 text-[#4A90E2]" />
                                        {format(parseISO(clientsStart), 'dd MMM', { locale: es })} — {format(parseISO(clientsEnd), 'dd MMM', { locale: es })}
                                        <ChevronDown className={`w-3 h-3 transition-transform ${clientsDatePickerOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    <RangeDatePicker
                                        isOpen={clientsDatePickerOpen}
                                        startDate={clientsStart}
                                        endDate={clientsEnd}
                                        align="right"
                                        onApply={(s, e) => {
                                            setClientsStart(s);
                                            setClientsEnd(e);
                                            setClientsDatePickerOpen(false);
                                        }}
                                        onCancel={() => setClientsDatePickerOpen(false)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Summary strip */}
                        <div className="px-8 py-3 flex items-center gap-6 border-b border-[#f0f5f4] bg-white/30">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                {clientsRows.length} cliente{clientsRows.length === 1 ? '' : 's'}
                            </span>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                Tableros · <span className="text-[#2c3434] tabular-nums">{formatNumber(clientsRows.reduce((a, r) => a + r.tableros, 0), 0)}</span>
                            </span>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                Deuda total · <span className="text-rose-500 tabular-nums">S/ {formatNumber(clientsRows.reduce((a, r) => a + r.deuda, 0), 2)}</span>
                            </span>
                        </div>

                        {/* Clients table */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {clientsRows.length === 0 ? (
                                <div className="py-24 text-center">
                                    <p className="text-slate-300 font-black uppercase tracking-widest text-xs italic">
                                        Sin clientes en el rango seleccionado
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 bg-white/90 backdrop-blur-md z-10">
                                        <tr className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] border-b border-[#d3dcdb]/30">
                                            <th className="px-7 py-4">Cliente</th>
                                            <th className="px-7 py-4 text-right">
                                                <button
                                                    onClick={() => setClientsSort(prev => {
                                                        if (!prev || prev.col !== 'ventas') return { col: 'ventas', dir: 'desc' };
                                                        if (prev.dir === 'desc') return { col: 'ventas', dir: 'asc' };
                                                        return null;
                                                    })}
                                                    className="inline-flex items-center gap-1 ml-auto hover:text-[#366480] transition-colors"
                                                >
                                                    Ventas
                                                    {clientsSort?.col === 'ventas'
                                                        ? clientsSort.dir === 'desc'
                                                            ? <ChevronDown className="w-3 h-3 text-[#366480]" />
                                                            : <ChevronUp className="w-3 h-3 text-[#366480]" />
                                                        : <ArrowUpDown className="w-3 h-3 opacity-30" />
                                                    }
                                                </button>
                                            </th>
                                            <th className="px-7 py-4 text-right">
                                                <button
                                                    onClick={() => setClientsSort(prev => {
                                                        if (!prev || prev.col !== 'tableros') return { col: 'tableros', dir: 'desc' };
                                                        if (prev.dir === 'desc') return { col: 'tableros', dir: 'asc' };
                                                        return null;
                                                    })}
                                                    className="inline-flex items-center gap-1 ml-auto hover:text-[#366480] transition-colors"
                                                >
                                                    Tableros (PLS)
                                                    {clientsSort?.col === 'tableros'
                                                        ? clientsSort.dir === 'desc'
                                                            ? <ChevronDown className="w-3 h-3 text-[#366480]" />
                                                            : <ChevronUp className="w-3 h-3 text-[#366480]" />
                                                        : <ArrowUpDown className="w-3 h-3 opacity-30" />
                                                    }
                                                </button>
                                            </th>
                                            <th className="px-7 py-4">Tablero más comprado</th>
                                            <th className="px-7 py-4 text-right">Deuda</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {clientsRows.map(row => {
                                            return (
                                            <tr key={row.cliente} className="hover:bg-slate-50/40 transition-colors group">
                                                <td className="px-7 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-[13px] font-black text-[#2c3434] uppercase tracking-tight">
                                                            {highlight(row.cliente, clientsInputValue)}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                                            Última compra: {format(parseISO(row.ultimaFecha), "dd MMM, yyyy", { locale: es })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-7 py-4 text-right text-[13px] font-black text-[#366480] tabular-nums">
                                                    {row.ventas}
                                                </td>
                                                <td className="px-7 py-4 text-right text-[13px] font-black text-[#2c3434] tabular-nums">
                                                    {formatNumber(row.tableros, 0)}
                                                </td>
                                                <td className="px-7 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-tight truncate max-w-[260px]" title={row.topMaterial}>
                                                    {row.topMaterial}
                                                </td>
                                                <td className="px-7 py-4 text-right">
                                                    {row.deuda > 0 ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black rounded-full border bg-rose-50 text-rose-600 border-rose-200 tracking-widest uppercase tabular-nums">
                                                            <AlertCircle className="w-3 h-3" />
                                                            S/ {formatNumber(row.deuda, 2)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                                                            Al día
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {/* EDIT CLIENT LIST SUB-MODAL */}
            {editClientListOpen && createPortal(
                <div
                    className={`fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-[#2c3434]/30 ${editClientListClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
                    style={{ backdropFilter: 'blur(8px)', fontFamily: "'Manrope', sans-serif" }}
                    onClick={() => { setEditClientListClosing(true); window.setTimeout(() => { setEditClientListOpen(false); setEditClientListClosing(false); }, 220); }}
                >
                    <div
                        className={`bg-white/97 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.15)] w-full max-w-lg border border-white/60 relative overflow-hidden flex flex-col max-h-[80vh] ${editClientListClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/60 z-10" />
                        <div className="px-7 pt-7 pb-5 flex items-center justify-between border-b border-[#d3dcdb]/30">
                            <div>
                                <h2 className="text-[16px] font-black text-[#2c3434] tracking-tight">Editar Cliente</h2>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5 tracking-wide">Selecciona un cliente registrado para editar sus datos</p>
                            </div>
                            <button
                                onClick={() => { setEditClientListClosing(true); window.setTimeout(() => { setEditClientListOpen(false); setEditClientListClosing(false); }, 220); }}
                                className="w-8 h-8 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="px-7 py-4 border-b border-[#f0f5f4]">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8b9ba5]" />
                                <input
                                    type="text"
                                    value={editClientSearch}
                                    onChange={e => setEditClientSearch(e.target.value)}
                                    placeholder="Buscar cliente..."
                                    className="w-full pl-10 pr-5 py-2.5 bg-[#f8faf9] border-none rounded-full text-[12px] font-bold text-[#2c3434] outline-none placeholder:text-[#8b9ba5]"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {clientContacts.filter(c => !editClientSearch.trim() || c.name.toLowerCase().includes(editClientSearch.toLowerCase())).length === 0 ? (
                                <div className="py-16 text-center">
                                    <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Sin clientes registrados</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {clientContacts
                                        .filter(c => !editClientSearch.trim() || c.name.toLowerCase().includes(editClientSearch.toLowerCase()))
                                        .map(contact => (
                                            <div key={contact.id} className="flex items-center justify-between px-7 py-4 hover:bg-slate-50/50 transition-colors">
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[13px] font-black text-[#2c3434] uppercase tracking-tight truncate">{highlight(contact.name, editClientSearch)}</span>
                                                    {contact.tax_id && (
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">RUC/DNI: {highlight(contact.tax_id, editClientSearch)}</span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        openEditClient(contact);
                                                    }}
                                                    title="Editar datos del cliente"
                                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-[#e8f0fe] hover:text-[#4A90E2] text-slate-400 flex items-center justify-center transition-all flex-shrink-0 ml-4"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {/* NEW CLIENT SUB-MODAL */}
            {newClientOpen && createPortal(
                <div
                    className={`fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-[#2c3434]/30 ${newClientClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
                    style={{ backdropFilter: 'blur(8px)', fontFamily: "'Manrope', sans-serif" }}
                >
                    <div
                        className={`bg-white/97 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.15)] w-full max-w-md border border-white/60 relative overflow-hidden ${newClientClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}
                    >
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/60 z-10" />
                        {/* Header */}
                        <div className="px-8 pt-8 pb-6">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-[18px] font-black text-[#2c3434] tracking-tight leading-snug">
                                        {newClientIsEdit ? 'Editar Cliente / Empresa' : 'Registrar Nuevo Cliente / Empresa'}
                                    </h2>
                                    <p className="text-[11px] font-bold text-slate-400 mt-1.5 tracking-wide leading-relaxed">
                                        {newClientIsEdit
                                            ? 'Modifica los datos fiscales o de contacto del registro.'
                                            : 'Ingrese los datos fiscales y de contacto para dar de alta en el sistema.'}
                                    </p>
                                </div>
                                <button
                                    onClick={closeNewClient}
                                    className="w-8 h-8 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all flex-shrink-0 ml-4 mt-0.5"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        {/* Form */}
                        <div className="px-8 pb-8 flex flex-col gap-5">
                            {/* Nombre */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">
                                    Nombre / Razón Social
                                </label>
                                <input
                                    type="text"
                                    value={newClientData.name}
                                    onChange={e => setNewClientData(d => ({ ...d, name: e.target.value }))}
                                    placeholder="Ej: Corporación Industrial S.A."
                                    className="w-full px-5 py-3.5 bg-[#f8faf9] border border-[#e8eded] rounded-2xl text-[13px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#b0bec5] focus:border-[#4A90E2]/40 focus:bg-white"
                                />
                            </div>
                            {/* Tipo + DNI/RUC */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Tipo</label>
                                    <div className="relative">
                                        <select
                                            value={newClientData.type}
                                            onChange={e => setNewClientData(d => ({ ...d, type: e.target.value as 'CLIENT' | 'SUPPLIER' | 'BOTH' }))}
                                            className="appearance-none w-full px-5 py-3.5 bg-[#f8faf9] border border-[#e8eded] rounded-2xl text-[13px] font-bold text-[#2c3434] outline-none cursor-pointer transition-all focus:border-[#4A90E2]/40 focus:bg-white pr-10"
                                        >
                                            <option value="CLIENT">Cliente</option>
                                            <option value="SUPPLIER">Proveedor</option>
                                            <option value="BOTH">Ambos</option>
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#366480] pointer-events-none" />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">DNI / RUC</label>
                                    <input
                                        type="text"
                                        value={newClientData.tax_id}
                                        onChange={e => setNewClientData(d => ({ ...d, tax_id: e.target.value }))}
                                        placeholder="20XXXXXXXXX"
                                        className="w-full px-5 py-3.5 bg-[#f8faf9] border border-[#e8eded] rounded-2xl text-[13px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#b0bec5] focus:border-[#4A90E2]/40 focus:bg-white"
                                    />
                                </div>
                            </div>
                            {/* Teléfono */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Teléfono</label>
                                <div className="relative">
                                    <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b0bec5] pointer-events-none" />
                                    <input
                                        type="tel"
                                        value={newClientData.phone}
                                        onChange={e => setNewClientData(d => ({ ...d, phone: e.target.value }))}
                                        placeholder="+51 900 000.000"
                                        className="w-full px-5 pr-12 py-3.5 bg-[#f8faf9] border border-[#e8eded] rounded-2xl text-[13px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#b0bec5] focus:border-[#4A90E2]/40 focus:bg-white"
                                    />
                                </div>
                            </div>
                            {/* Feedback banners */}
                            {newClientSuccess && (
                                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-2xl">
                                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                    <p className="text-[11px] font-bold text-emerald-700">
                                        {newClientIsEdit ? 'Datos actualizados con éxito. Cerrando…' : 'Cliente registrado con éxito. Cerrando…'}
                                    </p>
                                </div>
                            )}
                            {newClientError && !newClientSuccess && (
                                <p className="text-[11px] font-bold text-rose-500 bg-rose-50 px-4 py-3 rounded-2xl border border-rose-100">
                                    {newClientError}
                                </p>
                            )}
                            {/* Actions */}
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    onClick={closeNewClient}
                                    className="px-6 py-3 text-[10px] font-black text-slate-500 hover:text-slate-700 transition-all uppercase tracking-widest"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={saveNewClient}
                                    disabled={newClientSaving || newClientSuccess}
                                    className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-800 transition-all disabled:opacity-60"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                    {newClientSaving ? 'Guardando...' : newClientIsEdit ? 'Guardar Cambios' : 'Guardar Registro'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

interface KpiCardProps {
    label: string;
    value: string;
    helper: string;
    icon: React.ReactNode;
    accent: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, helper, icon, accent }) => {
    return (
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-[0_10px_40px_rgba(0,0,0,0.04)] flex flex-col h-full">
            <div className="flex items-start justify-between mb-3">
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                    {label}
                </p>
                <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
                    {icon}
                </div>
            </div>
            <p
                className="text-[34px] font-black tracking-tight tabular-nums leading-none"
                style={{ color: accent }}
            >
                {value}
            </p>
            <p className="text-slate-400 text-[10px] font-bold mt-3 tracking-wider">
                {helper}
            </p>
        </div>
    );
};

// ─── Memoized chart (insulated from unrelated parent state changes) ───────────

interface AdministratorChartProps {
    chartData: { label: string; real: number; proyectado: number | null }[];
    compareEnabled: boolean;
}

const AdministratorChart = React.memo<AdministratorChartProps>(({ chartData, compareEnabled }) => (
    <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="0" />
            <XAxis
                dataKey="label"
                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700, fontFamily: 'Manrope' }}
                axisLine={false}
                tickLine={false}
            />
            <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700, fontFamily: 'Manrope' }}
                axisLine={false}
                tickLine={false}
                width={40}
            />
            <Tooltip
                contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 12, fontFamily: 'Manrope', fontWeight: 700, color: '#fff' }}
                labelStyle={{ color: '#94a3b8', fontWeight: 700 }}
                itemStyle={{ color: '#fff', fontWeight: 800 }}
            />
            <Legend
                iconType="circle"
                wrapperStyle={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}
            />
            {compareEnabled && (
                <Line
                    type="monotone"
                    dataKey="proyectado"
                    name="Comparación"
                    stroke="#bae6fd"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                    animationDuration={800}
                />
            )}
            <Line
                type="monotone"
                dataKey="real"
                name="Periodo Actual"
                stroke="#0f172a"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
                animationDuration={800}
            />
        </LineChart>
    </ResponsiveContainer>
));
AdministratorChart.displayName = 'AdministratorChart';
