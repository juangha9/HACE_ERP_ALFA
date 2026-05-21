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
    Settings,
    Plus,
    Package,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { catalogService } from '../services/catalogService';
import type { ProductCategory, ProductFamily, ProductSubfamily } from '../services/catalogService';
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
        descripcion?: string | null;
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
    ventaCreatedAt: string | null;
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
    // Estados propios de los modales: cada uno consulta su propio rango y NO contamina
    // el arreglo `items` del dashboard (que solo lo llena fetchData).
    const [clientsItems, setClientsItems] = useState<CotizacionItemRow[]>([]);
    const [historyItems, setHistoryItems] = useState<CotizacionItemRow[]>([]);
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

    // ── Ajuste Avanzado modal ───────────────────────────────────────────────
    const [ajusteOpen, setAjusteOpen] = useState(false);
    const [ajusteClosing, setAjusteClosing] = useState(false);
    const [ajusteTab, setAjusteTab] = useState<'materiales' | 'usuarios'>('materiales');
    // USUARIOS sub-tab
    const [sysUsers, setSysUsers] = useState<{ id: string; full_name: string; role: string; email: string }[]>([]);
    const [sysUsersLoading, setSysUsersLoading] = useState(false);
    const [generatingLinkUserId, setGeneratingLinkUserId] = useState<string | null>(null);
    const [generatedLinks, setGeneratedLinks] = useState<Record<string, string>>({});
    const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
    // Materiales Controlados sub-tab
    const [controlProducts, setControlProducts] = useState<any[]>([]);
    const [controlLoading, setControlLoading] = useState(false);
    // Add-product sub-modal
    const [addProdOpen, setAddProdOpen] = useState(false);
    const [addProdClosing, setAddProdClosing] = useState(false);
    const [addProdSaving, setAddProdSaving] = useState(false);
    const [addProdError, setAddProdError] = useState<string | null>(null);
    const [addProdForm, setAddProdForm] = useState({ base_name: '', presentation: '', unit: '', min_price: '' as number | '', reference_cost: '' as number | '' });
    const [addProdMode, setAddProdMode] = useState<'create' | 'edit'>('create');
    const [editProdId, setEditProdId] = useState<string | null>(null);
    const [addProdCats, setAddProdCats] = useState<ProductCategory[]>([]);
    const [addProdFams, setAddProdFams] = useState<ProductFamily[]>([]);
    const [addProdSubs, setAddProdSubs] = useState<ProductSubfamily[]>([]);
    const [addProdAllFams, setAddProdAllFams] = useState<ProductFamily[]>([]);
    const [addProdAllSubs, setAddProdAllSubs] = useState<ProductSubfamily[]>([]);
    const [addProdSelCat, setAddProdSelCat] = useState('');
    const [addProdSelFam, setAddProdSelFam] = useState('');
    const [addProdSelSub, setAddProdSelSub] = useState('');
    // Materiales Controlados filters + pagination
    const [controlSearch, setControlSearch] = useState('');
    const [controlPage, setControlPage] = useState(1);
    const [filterCat, setFilterCat] = useState('');
    const [filterFam, setFilterFam] = useState('');
    const [filterSub, setFilterSub] = useState('');

    // Payment info from ventas_cabecera for the dashboard (KPIs, últimos servicios, history filter)
    const [ventasParaDashboard, setVentasParaDashboard] = useState<{ codigo_cotizacion: string | null; saldo_pendiente: number; estado_pago: string; created_at: string }[]>([]);

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
                            'cotizaciones!inner(id,codigo,cliente_nombre,fecha_emision,estado,total,descripcion)'
                    )
                    .neq('cotizaciones.estado', 'ELIMINADO')
                    .gte('cotizaciones.fecha_emision', minStart)
                    .lte('cotizaciones.fecha_emision', maxEnd)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('ventas_cabecera')
                    .select('codigo_cotizacion,saldo_pendiente,estado_pago,created_at'),
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

    useEffect(() => {
        // Pre-fetch product taxonomy for add/edit product modals in the background
        loadAddProdTaxonomy().catch(console.error);
    }, []);

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
                ventaCreatedAt: ventaEntry?.created_at ?? null,
            });
        }
        return result
            .sort((a, b) => {
                // Primary: by when it was registered as a sale (most recent LISTO first)
                const aKey = a.ventaCreatedAt ?? a.fecha;
                const bKey = b.ventaCreatedAt ?? b.fecha;
                return aKey < bKey ? 1 : -1;
            })
            .slice(0, 5);
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

    // ── Ajuste Avanzado helpers ────────────────────────────────────────────────
    const fetchControlProducts = async () => {
        setControlLoading(true);
        try {
            const { data } = await supabase
                .from('catalog_products')
                .select(`id,sku,base_name,presentation,unit,min_price,reference_cost,subfamily_id,
                    product_subfamilies(name,family_id,product_families(name,category_id,product_categories(name)))`)
                .eq('status', 'Activo')
                .order('base_name');
            setControlProducts(data || []);
        } catch (e) { console.error(e); }
        finally { setControlLoading(false); }
    };

    const fetchSysUsers = async () => {
        setSysUsersLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_all_users_for_admin');
            if (error) throw error;
            setSysUsers(data || []);
        } catch (e) { console.error(e); }
        finally { setSysUsersLoading(false); }
    };

    const generateResetLink = async (userId: string, email: string) => {
        setGeneratingLinkUserId(userId);
        try {
            const { data, error } = await supabase.functions.invoke('generate-reset-link', {
                body: { email, redirectTo: `${window.location.origin}/set-password` },
            });
            if (error || !data?.link) throw error || new Error('no_link');
            setGeneratedLinks(prev => ({ ...prev, [userId]: data.link as string }));
        } catch {
            setGeneratedLinks(prev => ({ ...prev, [userId]: '__error__' }));
            setTimeout(() => setGeneratedLinks(prev => {
                const next = { ...prev };
                delete next[userId];
                return next;
            }), 4000);
        } finally {
            setGeneratingLinkUserId(null);
        }
    };

    const openAjuste = () => {
        setAjusteOpen(true);
        setAjusteClosing(false);
        setAjusteTab('materiales');
        setControlSearch('');
        setControlPage(1);
        setFilterCat('');
        setFilterFam('');
        setFilterSub('');
        fetchControlProducts();
        setGeneratedLinks({});
        fetchSysUsers();
        // Pre-fetch taxonomy in case it's not loaded yet
        if (addProdCats.length === 0) {
            loadAddProdTaxonomy().catch(console.error);
        }
    };
    const closeAjuste = () => {
        setAjusteClosing(true);
        window.setTimeout(() => { setAjusteOpen(false); setAjusteClosing(false); }, 220);
    };

    const filterCatOptions = useMemo(() => {
        const seen = new Set<string>();
        const cats: { id: string; name: string }[] = [];
        controlProducts.forEach((p: any) => {
            const catId = p.product_subfamilies?.product_families?.category_id;
            const catName = p.product_subfamilies?.product_families?.product_categories?.name;
            if (catId && catName && !seen.has(catId)) { seen.add(catId); cats.push({ id: catId, name: catName }); }
        });
        return cats.sort((a, b) => a.name.localeCompare(b.name));
    }, [controlProducts]);

    const filterFamOptions = useMemo(() => {
        if (!filterCat) return [];
        const seen = new Set<string>();
        const fams: { id: string; name: string }[] = [];
        controlProducts.forEach((p: any) => {
            const catId = p.product_subfamilies?.product_families?.category_id;
            const famId = p.product_subfamilies?.family_id;
            const famName = p.product_subfamilies?.product_families?.name;
            if (catId === filterCat && famId && famName && !seen.has(famId)) { seen.add(famId); fams.push({ id: famId, name: famName }); }
        });
        return fams.sort((a, b) => a.name.localeCompare(b.name));
    }, [controlProducts, filterCat]);

    const filterSubOptions = useMemo(() => {
        if (!filterFam) return [];
        const seen = new Set<string>();
        const subs: { id: string; name: string }[] = [];
        controlProducts.forEach((p: any) => {
            const famId = p.product_subfamilies?.family_id;
            if (famId === filterFam && !seen.has(p.subfamily_id)) {
                seen.add(p.subfamily_id);
                subs.push({ id: p.subfamily_id, name: p.product_subfamilies?.name || '' });
            }
        });
        return subs.sort((a, b) => a.name.localeCompare(b.name));
    }, [controlProducts, filterFam]);

    const filteredControlProducts = useMemo(() => {
        const q = controlSearch.toLowerCase().trim();
        return controlProducts.filter((p: any) => {
            if (filterSub && p.subfamily_id !== filterSub) return false;
            if (filterFam && p.product_subfamilies?.family_id !== filterFam) return false;
            if (filterCat && p.product_subfamilies?.product_families?.category_id !== filterCat) return false;
            if (q && !p.base_name?.toLowerCase().includes(q) && !p.sku?.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [controlProducts, filterCat, filterFam, filterSub, controlSearch]);

    const CONTROL_PAGE_SIZE = 10;
    const controlTotalPages = Math.max(1, Math.ceil(filteredControlProducts.length / CONTROL_PAGE_SIZE));
    const pagedControlProducts = filteredControlProducts.slice((controlPage - 1) * CONTROL_PAGE_SIZE, controlPage * CONTROL_PAGE_SIZE);

    const loadAddProdTaxonomy = async () => {
        const [cats, fams, subs] = await Promise.all([
            catalogService.getCategories(),
            catalogService.getFamilies(),
            catalogService.getSubfamilies(),
        ]);
        setAddProdAllFams(fams); setAddProdAllSubs(subs);
        const validFams = fams.filter(f => subs.some(s => s.family_id === f.id));
        setAddProdCats(cats.filter(c => validFams.some(f => f.category_id === c.id)));
        return { fams, subs };
    };

    const openAddProd = () => {
        setAddProdMode('create');
        setEditProdId(null);
        setAddProdForm({ base_name: '', presentation: '', unit: '', min_price: '', reference_cost: '' });
        setAddProdSelCat(''); setAddProdSelFam(''); setAddProdSelSub('');
        setAddProdFams([]); setAddProdSubs([]);
        setAddProdError(null);
        setAddProdOpen(true);
        setAddProdClosing(false);
        if (addProdCats.length === 0) {
            loadAddProdTaxonomy().catch(console.error);
        }
    };

    const openEditProd = async (p: any) => {
        setAddProdMode('edit');
        setEditProdId(p.id);
        setAddProdForm({ base_name: p.base_name || '', presentation: p.presentation || '', unit: p.unit || '', min_price: p.min_price ?? '', reference_cost: p.reference_cost ?? '' });
        setAddProdSelCat(''); setAddProdSelFam(''); setAddProdSelSub('');
        setAddProdFams([]); setAddProdSubs([]);
        setAddProdError(null);
        setAddProdOpen(true);
        setAddProdClosing(false);
        try {
            let fams = addProdAllFams;
            let subs = addProdAllSubs;
            if (fams.length === 0 || subs.length === 0 || addProdCats.length === 0) {
                const res = await loadAddProdTaxonomy();
                fams = res.fams;
                subs = res.subs;
            }
            // Cascade: subfamily → family → category
            const sub = subs.find(s => s.id === p.subfamily_id);
            if (sub) {
                const fam = fams.find(f => f.id === sub.family_id);
                if (fam) {
                    setAddProdSelCat(fam.category_id);
                    const filteredFams = fams.filter(f => f.category_id === fam.category_id && subs.some(s => s.family_id === f.id));
                    setAddProdFams(filteredFams);
                    setAddProdSelFam(fam.id);
                    setAddProdSubs(subs.filter(s => s.family_id === fam.id));
                    setAddProdSelSub(p.subfamily_id);
                }
            }
        } catch (e) { console.error(e); }
    };
    const closeAddProd = () => {
        setAddProdClosing(true);
        window.setTimeout(() => { setAddProdOpen(false); setAddProdClosing(false); }, 220);
    };
    const saveAddProd = async () => {
        if (!addProdSelSub) { setAddProdError('Selecciona una subfamilia'); return; }
        if (!addProdForm.base_name.trim()) { setAddProdError('El nombre base es requerido'); return; }
        if (!addProdForm.presentation.trim()) { setAddProdError('La presentación es requerida'); return; }
        if (!addProdForm.unit) { setAddProdError('Selecciona una unidad de medida'); return; }
        setAddProdSaving(true);
        setAddProdError(null);
        const payload = {
            subfamily_id: addProdSelSub,
            base_name: addProdForm.base_name.trim(),
            presentation: addProdForm.presentation.trim(),
            unit: addProdForm.unit,
            min_price: addProdForm.min_price === '' ? 0 : Number(addProdForm.min_price),
            reference_cost: addProdForm.reference_cost === '' ? 0 : Number(addProdForm.reference_cost),
            min_stock: 0,
            stock_alerts: false,
            status: 'Activo' as const,
        };
        try {
            if (addProdMode === 'edit' && editProdId) {
                const { error } = await supabase.from('catalog_products').update(payload).eq('id', editProdId);
                if (error) throw error;
            } else {
                await catalogService.createProduct(payload);
            }
            closeAddProd();
            await fetchControlProducts();
        } catch (e: any) {
            setAddProdError(e?.message || 'Error al guardar');
        } finally { setAddProdSaving(false); }
    };

    const handleCatChange = (catId: string) => {
        setAddProdSelCat(catId);
        if (!catId) { setAddProdFams([]); setAddProdSubs([]); setAddProdSelFam(''); setAddProdSelSub(''); return; }
        const fams = addProdAllFams.filter(f => f.category_id === catId && addProdAllSubs.some(s => s.family_id === f.id));
        setAddProdFams(fams); setAddProdSubs([]); setAddProdSelFam(''); setAddProdSelSub('');
    };

    const handleFamChange = (famId: string) => {
        setAddProdSelFam(famId);
        if (!famId) { setAddProdSubs([]); setAddProdSelSub(''); return; }
        setAddProdSubs(addProdAllSubs.filter(s => s.family_id === famId));
        setAddProdSelSub('');
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
                                'cotizaciones!inner(id,codigo,cliente_nombre,fecha_emision,estado,total,descripcion)'
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
                    setClientsItems(itemsRes.data as unknown as CotizacionItemRow[]);
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
        const inRange = clientsItems.filter(it => {
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

        // Build deuda lookup from ventas_cabecera.
        // Clave normalizada (mayúsculas + espacios colapsados) para que el cruce no
        // falle por diferencias de mayúsculas/espaciado entre cotizaciones y ventas.
        const normName = (s: string | null | undefined) => (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
        const debtByClient = new Map<string, number>();
        for (const v of ventasCabecera) {
            const k = normName(v.cliente_nombre);
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
            const deuda = debtByClient.get(normName(agg.cliente)) || 0;
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
    }, [clientsItems, ventasCabecera, clientsStart, clientsEnd, clientsSearch, clientsDebtFilter, clientsSort]);

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
        const inRange = historyItems.filter(it => {
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
        return Array.from(grouped.values()).sort((a, b) => {
            if (a.cot.fecha_emision !== b.cot.fecha_emision) {
                return a.cot.fecha_emision < b.cot.fecha_emision ? 1 : -1;
            }
            // Same emission date: sort by when it was registered as a sale
            const aVenta = ventasParaDashboard.find(v => v.codigo_cotizacion === a.cot.codigo);
            const bVenta = ventasParaDashboard.find(v => v.codigo_cotizacion === b.cot.codigo);
            const aCreated = aVenta?.created_at ?? '';
            const bCreated = bVenta?.created_at ?? '';
            return aCreated < bCreated ? 1 : -1;
        });
    }, [historyItems, historyStart, historyEnd, historyEstado, historySearch, ventasParaDashboard]);

    // Carga los ítems del rango del historial en su propio estado (historyItems), sin
    // contaminar el arreglo `items` del dashboard. Es autosuficiente: siempre consulta
    // su propio rango al abrir el modal o cambiar las fechas.
    useEffect(() => {
        if (!historyOpen) return;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase
                    .from('cotizaciones_items')
                    .select(
                        'cantidad,unidad,descripcion,total,created_at,cotizacion_id,' +
                            'cotizaciones!inner(id,codigo,cliente_nombre,fecha_emision,estado,total,descripcion)'
                    )
                    .neq('cotizaciones.estado', 'ELIMINADO')
                    .gte('cotizaciones.fecha_emision', historyStart)
                    .lte('cotizaciones.fecha_emision', historyEnd)
                    .order('created_at', { ascending: false });
                if (!cancelled && data) setHistoryItems(data as unknown as CotizacionItemRow[]);
            } catch {
                /* ignore */
            }
        })();
        return () => { cancelled = true; };
    }, [historyOpen, historyStart, historyEnd]);

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
                    {/* AJUSTE AVANZADO modal trigger */}
                    <button
                        onClick={openAjuste}
                        className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl shadow-sm hover:shadow-md hover:bg-slate-50 transition-all"
                        title="Ajuste avanzado"
                    >
                        <Settings className="w-4 h-4" />
                        <span className="text-[11px] font-black tracking-widest uppercase">Ajuste Avanzado</span>
                    </button>
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
                                    <h2 className="text-[25px] font-black text-[#2c3434] uppercase tracking-tight">
                                        Historial de Servicios
                                    </h2>
                                    <p className="text-[13px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
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
                                    className="w-full pl-12 pr-6 py-3 bg-[#f8faf9] border-none rounded-full text-[15px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#8b9ba5]"
                                />
                            </div>
                            <div className="relative">
                                <select
                                    value={historyEstado}
                                    onChange={e => setHistoryEstado(e.target.value as any)}
                                    className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[15px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
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
                                    className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[15px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
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
                                        className="flex items-center gap-3 px-6 py-3 bg-[#f8faf9] text-[#366480] rounded-full text-[15px] font-bold hover:bg-[#e8eded] transition-all"
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
                                    <p className="text-slate-300 font-black uppercase tracking-widest text-[15px] italic">
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
                                                        <span className="text-[16px] font-bold text-[#2c3434] uppercase tracking-tight">
                                                            #{highlight(cot.codigo, historySearch)}
                                                        </span>
                                                        <span className="text-[13px] font-medium text-[#366480]/50 uppercase tracking-widest mt-0.5">
                                                            {format(parseISO(cot.fecha_emision), "dd MMM, yyyy", { locale: es })}
                                                        </span>
                                                    </div>
                                                    <div className="w-px h-10 bg-[#d3dcdb]/30 hidden sm:block" />
                                                    <div className="flex flex-col min-w-0">
                                                        <p className="text-[16px] font-semibold text-[#366480] uppercase tracking-tight truncate">
                                                            {highlight(cot.cliente_nombre || '—', historySearch)}
                                                        </p>
                                                        {cot.descripcion && (
                                                            <span className="text-[13px] font-medium text-slate-400 truncate max-w-[200px]" title={cot.descripcion}>
                                                                {cot.descripcion}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 flex-shrink-0">
                                                    {(() => {
                                                        const ve = ventasParaDashboard.find(v => v.codigo_cotizacion === cot.codigo);
                                                        const ds = ve?.estado_pago || (cot.estado === 'BORRADOR' ? 'BORRADOR' : 'LISTO');
                                                        return (
                                                            <span className={`px-4 py-1.5 text-[13px] font-bold rounded-full border tracking-widest uppercase ${ESTADO_BADGE[ds] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                                {ds}
                                                            </span>
                                                        );
                                                    })()}
                                                    <span className="text-[18px] font-bold text-[#2c3434] tabular-nums">
                                                        S/ {formatNumber(Number(cot.total) || 0, 2)}
                                                    </span>
                                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[#4A90E2]" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <div className="px-7 pb-6 animate-desglose">
                                                    <div className="bg-[#f7faf9]/40 border border-[#d3dcdb]/20 rounded-[20px] p-6">
                                                        <p className="text-[13px] font-semibold text-[#366480]/40 uppercase tracking-[0.2em] mb-5 border-b border-[#d3dcdb]/20 pb-3 italic">
                                                            Desglose Técnico del Proyecto
                                                        </p>
                                                        <table className="w-full text-[15px]">
                                                            <thead className="text-[#366480]/40 uppercase border-b border-[#d3dcdb]/10">
                                                                <tr className="text-[13px] tracking-[0.2em]">
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
                                                                        <td className="py-3 text-left text-[#366480]/60 font-medium uppercase tracking-widest text-[13px]">
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
                                                                                <td colSpan={3} className="pt-4 pb-1 text-right text-[13px] font-semibold text-[#366480]/50 uppercase tracking-widest pr-3">Subtotal</td>
                                                                                <td className="pt-4 pb-1 text-right text-[#2c3434] font-bold tabular-nums">S/ {formatNumber(subtotal, 2)}</td>
                                                                            </tr>
                                                                            <tr>
                                                                                <td colSpan={3} className="py-1 text-right text-[13px] font-semibold text-[#366480]/50 uppercase tracking-widest pr-3">IGV (18%)</td>
                                                                                <td className="py-1 text-right text-[#2c3434] font-bold tabular-nums">S/ {formatNumber(igv, 2)}</td>
                                                                            </tr>
                                                                            <tr className="border-t border-[#d3dcdb]/20">
                                                                                <td colSpan={3} className="pt-3 text-right text-[14px] font-bold text-[#2c3434] uppercase tracking-widest pr-3">Total</td>
                                                                                <td className="pt-3 text-right text-[18px] font-extrabold text-[#2c3434] tabular-nums">S/ {formatNumber(grandTotal, 2)}</td>
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
                                    <h2 className="text-[25px] font-black text-[#2c3434] uppercase tracking-tight">
                                        Clientes
                                    </h2>
                                    <p className="text-[13px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                        Ventas, consumo y deuda por cliente
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => { setEditClientSearch(''); setEditClientListOpen(true); setEditClientListClosing(false); }}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-2xl text-[13px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                    <span>Editar</span>
                                </button>
                                <button
                                    onClick={openNewClient}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-2xl text-[13px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-800 transition-all"
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
                                    className="w-full pl-12 pr-6 py-3 bg-[#f8faf9] border-none rounded-full text-[15px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#8b9ba5]"
                                />
                            </div>
                            <div className="relative">
                                <select
                                    value={clientsDebtFilter}
                                    onChange={e => setClientsDebtFilter(e.target.value as any)}
                                    className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[15px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
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
                                    className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[15px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
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
                                        className="flex items-center gap-3 px-6 py-3 bg-[#f8faf9] text-[#366480] rounded-full text-[15px] font-bold hover:bg-[#e8eded] transition-all"
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
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                {clientsRows.length} cliente{clientsRows.length === 1 ? '' : 's'}
                            </span>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                Tableros · <span className="text-[#2c3434] tabular-nums">{formatNumber(clientsRows.reduce((a, r) => a + r.tableros, 0), 0)}</span>
                            </span>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                Deuda total · <span className="text-rose-500 tabular-nums">S/ {formatNumber(clientsRows.reduce((a, r) => a + r.deuda, 0), 2)}</span>
                            </span>
                        </div>

                        {/* Clients table */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {clientsRows.length === 0 ? (
                                <div className="py-24 text-center">
                                    <p className="text-slate-300 font-black uppercase tracking-widest text-[15px] italic">
                                        Sin clientes en el rango seleccionado
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 bg-white/90 backdrop-blur-md z-10">
                                        <tr className="text-slate-400 text-[11px] font-black uppercase tracking-[0.2em] border-b border-[#d3dcdb]/30">
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
                                                        <span className="text-[16px] font-black text-[#2c3434] uppercase tracking-tight">
                                                            {highlight(row.cliente, clientsInputValue)}
                                                        </span>
                                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                                            Última compra: {format(parseISO(row.ultimaFecha), "dd MMM, yyyy", { locale: es })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-7 py-4 text-right text-[16px] font-black text-[#366480] tabular-nums">
                                                    {row.ventas}
                                                </td>
                                                <td className="px-7 py-4 text-right text-[16px] font-black text-[#2c3434] tabular-nums">
                                                    {formatNumber(row.tableros, 0)}
                                                </td>
                                                <td className="px-7 py-4 text-[14px] font-bold text-slate-500 uppercase tracking-tight truncate max-w-[260px]" title={row.topMaterial}>
                                                    {row.topMaterial}
                                                </td>
                                                <td className="px-7 py-4 text-right">
                                                    {row.deuda > 0 ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[13px] font-black rounded-full border bg-rose-50 text-rose-600 border-rose-200 tracking-widest uppercase tabular-nums">
                                                            <AlertCircle className="w-3 h-3" />
                                                            S/ {formatNumber(row.deuda, 2)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[13px] font-black text-emerald-600 uppercase tracking-widest">
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
                                <h2 className="text-[20px] font-black text-[#2c3434] tracking-tight">Editar Cliente</h2>
                                <p className="text-[13px] font-bold text-slate-400 mt-0.5 tracking-wide">Selecciona un cliente registrado para editar sus datos</p>
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
                                    className="w-full pl-10 pr-5 py-2.5 bg-[#f8faf9] border-none rounded-full text-[15px] font-bold text-[#2c3434] outline-none placeholder:text-[#8b9ba5]"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {clientContacts.filter(c => !editClientSearch.trim() || c.name.toLowerCase().includes(editClientSearch.toLowerCase())).length === 0 ? (
                                <div className="py-16 text-center">
                                    <p className="text-[14px] font-bold text-slate-300 uppercase tracking-widest">Sin clientes registrados</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {clientContacts
                                        .filter(c => !editClientSearch.trim() || c.name.toLowerCase().includes(editClientSearch.toLowerCase()))
                                        .map(contact => (
                                            <div key={contact.id} className="flex items-center justify-between px-7 py-4 hover:bg-slate-50/50 transition-colors">
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[16px] font-black text-[#2c3434] uppercase tracking-tight truncate">{highlight(contact.name, editClientSearch)}</span>
                                                    {contact.tax_id && (
                                                        <span className="text-[13px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">RUC/DNI: {highlight(contact.tax_id, editClientSearch)}</span>
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
                                    <h2 className="text-[23px] font-black text-[#2c3434] tracking-tight leading-snug">
                                        {newClientIsEdit ? 'Editar Cliente / Empresa' : 'Registrar Nuevo Cliente / Empresa'}
                                    </h2>
                                    <p className="text-[14px] font-bold text-slate-400 mt-1.5 tracking-wide leading-relaxed">
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
                                <label className="text-[13px] font-black text-[#2c3434] uppercase tracking-widest">
                                    Nombre / Razón Social
                                </label>
                                <input
                                    type="text"
                                    value={newClientData.name}
                                    onChange={e => setNewClientData(d => ({ ...d, name: e.target.value }))}
                                    placeholder="Ej: Corporación Industrial S.A."
                                    className="w-full px-5 py-3.5 bg-[#f8faf9] border border-[#e8eded] rounded-2xl text-[16px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#b0bec5] focus:border-[#4A90E2]/40 focus:bg-white"
                                />
                            </div>
                            {/* Tipo + DNI/RUC */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[13px] font-black text-[#2c3434] uppercase tracking-widest">Tipo</label>
                                    <div className="relative">
                                        <select
                                            value={newClientData.type}
                                            onChange={e => setNewClientData(d => ({ ...d, type: e.target.value as 'CLIENT' | 'SUPPLIER' | 'BOTH' }))}
                                            className="appearance-none w-full px-5 py-3.5 bg-[#f8faf9] border border-[#e8eded] rounded-2xl text-[16px] font-bold text-[#2c3434] outline-none cursor-pointer transition-all focus:border-[#4A90E2]/40 focus:bg-white pr-10"
                                        >
                                            <option value="CLIENT">Cliente</option>
                                            <option value="SUPPLIER">Proveedor</option>
                                            <option value="BOTH">Ambos</option>
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#366480] pointer-events-none" />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[13px] font-black text-[#2c3434] uppercase tracking-widest">DNI / RUC</label>
                                    <input
                                        type="text"
                                        value={newClientData.tax_id}
                                        onChange={e => setNewClientData(d => ({ ...d, tax_id: e.target.value }))}
                                        placeholder="20XXXXXXXXX"
                                        className="w-full px-5 py-3.5 bg-[#f8faf9] border border-[#e8eded] rounded-2xl text-[16px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#b0bec5] focus:border-[#4A90E2]/40 focus:bg-white"
                                    />
                                </div>
                            </div>
                            {/* Teléfono */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[13px] font-black text-[#2c3434] uppercase tracking-widest">Teléfono</label>
                                <div className="relative">
                                    <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b0bec5] pointer-events-none" />
                                    <input
                                        type="tel"
                                        value={newClientData.phone}
                                        onChange={e => setNewClientData(d => ({ ...d, phone: e.target.value }))}
                                        placeholder="+51 900 000.000"
                                        className="w-full px-5 pr-12 py-3.5 bg-[#f8faf9] border border-[#e8eded] rounded-2xl text-[16px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#b0bec5] focus:border-[#4A90E2]/40 focus:bg-white"
                                    />
                                </div>
                            </div>
                            {/* Feedback banners */}
                            {newClientSuccess && (
                                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-2xl">
                                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                    <p className="text-[14px] font-bold text-emerald-700">
                                        {newClientIsEdit ? 'Datos actualizados con éxito. Cerrando…' : 'Cliente registrado con éxito. Cerrando…'}
                                    </p>
                                </div>
                            )}
                            {newClientError && !newClientSuccess && (
                                <p className="text-[14px] font-bold text-rose-500 bg-rose-50 px-4 py-3 rounded-2xl border border-rose-100">
                                    {newClientError}
                                </p>
                            )}
                            {/* Actions */}
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    onClick={closeNewClient}
                                    className="px-6 py-3 text-[13px] font-black text-slate-500 hover:text-slate-700 transition-all uppercase tracking-widest"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={saveNewClient}
                                    disabled={newClientSaving || newClientSuccess}
                                    className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[13px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-800 transition-all disabled:opacity-60"
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

            {/* ── AJUSTE AVANZADO MODAL ──────────────────────────────────── */}
            {ajusteOpen && createPortal(
                <div
                    className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden ${ajusteClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
                    style={{ backdropFilter: 'blur(6px)', fontFamily: "'Manrope', sans-serif" }}
                >
                    <div className={`bg-white/95 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-5xl border border-white/50 flex flex-col max-h-[92vh] relative overflow-hidden ${ajusteClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10" />
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0">
                                    <Settings className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-[18px] font-black text-[#2c3434] tracking-tight">Ajuste Avanzado</h2>
                                    <p className="text-[11px] font-bold text-slate-400 tracking-wide mt-0.5">Configuración de parámetros del sistema</p>
                                </div>
                            </div>
                            <button onClick={closeAjuste} className="w-9 h-9 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        {/* Sub-tabs */}
                        <div className="px-8 pt-4 pb-0 border-b border-[#d3dcdb]/30 bg-white/20 flex gap-1">
                            <button
                                onClick={() => setAjusteTab('materiales')}
                                className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black tracking-widest uppercase rounded-t-xl border-b-2 transition-all ${ajusteTab === 'materiales' ? 'border-[#366480] text-[#366480] bg-white/60' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/30'}`}
                            >
                                <Package className="w-3.5 h-3.5" />
                                Materiales Controlados
                            </button>
                            <button
                                onClick={() => setAjusteTab('usuarios')}
                                className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black tracking-widest uppercase rounded-t-xl border-b-2 transition-all ${ajusteTab === 'usuarios' ? 'border-[#366480] text-[#366480] bg-white/60' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/30'}`}
                            >
                                <Users className="w-3.5 h-3.5" />
                                Usuarios
                            </button>
                        </div>
                        {/* Content */}
                        <div className="flex-1 overflow-y-auto">
                            {ajusteTab === 'materiales' && (<>
                            {/* Toolbar */}
                            <div className="px-8 py-5 flex items-center justify-between">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    {controlLoading ? 'Cargando...' : `${filteredControlProducts.length} producto${filteredControlProducts.length !== 1 ? 's' : ''}`}
                                </p>
                                <button
                                    onClick={openAddProd}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-800 transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    Agregar Producto
                                </button>
                            </div>
                            {/* Filter bar */}
                            <div className="px-8 pb-4 flex gap-3 flex-wrap">
                                <div className="relative flex-1 min-w-[180px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={controlSearch}
                                        onChange={e => { setControlSearch(e.target.value); setControlPage(1); }}
                                        placeholder="Buscar por material o SKU..."
                                        className="w-full pl-9 pr-4 py-2.5 bg-[#f8faf9] border border-[#e8eded] rounded-xl text-[12px] font-bold text-[#2c3434] outline-none placeholder:text-slate-300 focus:border-[#4A90E2]/40"
                                    />
                                </div>
                                <div className="relative">
                                    <select
                                        value={filterCat}
                                        onChange={e => { setFilterCat(e.target.value); setFilterFam(''); setFilterSub(''); setControlPage(1); }}
                                        className="appearance-none pl-3 pr-8 py-2.5 bg-[#f8faf9] border border-[#e8eded] rounded-xl text-[12px] font-bold text-[#2c3434] outline-none cursor-pointer focus:border-[#4A90E2]/40"
                                    >
                                        <option value="">Todas las categorías</option>
                                        {filterCatOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                </div>
                                <div className="relative">
                                    <select
                                        value={filterFam}
                                        onChange={e => { setFilterFam(e.target.value); setFilterSub(''); setControlPage(1); }}
                                        disabled={!filterCat || filterFamOptions.length === 0}
                                        className="appearance-none pl-3 pr-8 py-2.5 bg-[#f8faf9] border border-[#e8eded] rounded-xl text-[12px] font-bold text-[#2c3434] outline-none cursor-pointer focus:border-[#4A90E2]/40 disabled:opacity-40"
                                    >
                                        <option value="">Todas las familias</option>
                                        {filterFamOptions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                </div>
                                <div className="relative">
                                    <select
                                        value={filterSub}
                                        onChange={e => { setFilterSub(e.target.value); setControlPage(1); }}
                                        disabled={!filterFam || filterSubOptions.length === 0}
                                        className="appearance-none pl-3 pr-8 py-2.5 bg-[#f8faf9] border border-[#e8eded] rounded-xl text-[12px] font-bold text-[#2c3434] outline-none cursor-pointer focus:border-[#4A90E2]/40 disabled:opacity-40"
                                    >
                                        <option value="">Todas las subfamilias</option>
                                        {filterSubOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                </div>
                            </div>
                            {/* Table */}
                            <div className="px-8 pb-4">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b border-[#d3dcdb]/40">
                                            {['SKU', 'Material', 'Precio Mínimo', 'Costo de Referencia', ''].map(h => (
                                                <th key={h} className="pb-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest pr-6 last:pr-0">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {controlLoading ? (
                                            <tr><td colSpan={5} className="py-16 text-center text-[11px] font-black text-slate-300 uppercase tracking-widest animate-pulse">Sincronizando...</td></tr>
                                        ) : pagedControlProducts.length === 0 ? (
                                            <tr><td colSpan={5} className="py-16 text-center text-[11px] font-black text-slate-300 uppercase tracking-widest">Sin resultados</td></tr>
                                        ) : pagedControlProducts.map((p: any) => (
                                            <tr key={p.id} className="border-b border-[#d3dcdb]/20 hover:bg-[#f0f5f4]/40 transition-colors group">
                                                <td className="py-4 pr-6">
                                                    <span className="text-[11px] font-black text-[#366480] bg-[#f0f5f4] px-2.5 py-1 rounded-lg tracking-wider">{p.sku}</span>
                                                </td>
                                                <td className="py-4 pr-6">
                                                    <p className="text-[13px] font-bold text-[#2c3434]">{p.base_name}</p>
                                                    {p.presentation && <p className="text-[10px] font-bold text-slate-400 mt-0.5">{p.presentation}</p>}
                                                </td>
                                                <td className="py-4 pr-6">
                                                    <span className="text-[13px] font-black text-[#366480] tabular-nums">
                                                        {p.min_price > 0 ? `S/ ${Number(p.min_price).toFixed(2)}` : <span className="text-slate-300 font-bold">—</span>}
                                                    </span>
                                                </td>
                                                <td className="py-4 pr-6">
                                                    <span className="text-[13px] font-black text-slate-600 tabular-nums">
                                                        {p.reference_cost > 0 ? `S/ ${Number(p.reference_cost).toFixed(2)}` : <span className="text-slate-300 font-bold">—</span>}
                                                    </span>
                                                </td>
                                                <td className="py-4">
                                                    <button
                                                        onClick={() => openEditProd(p)}
                                                        className="opacity-0 group-hover:opacity-100 p-2 rounded-xl bg-white border border-[#d3dcdb]/30 text-[#366480] hover:bg-[#f0f5f4] hover:border-[#366480]/20 transition-all shadow-sm"
                                                        title="Editar producto"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {/* Pagination */}
                            {controlTotalPages > 1 && (
                                <div className="px-8 pb-6 flex items-center justify-between">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Página {controlPage} de {controlTotalPages}
                                    </p>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setControlPage(p => Math.max(1, p - 1))}
                                            disabled={controlPage === 1}
                                            className="p-2 rounded-xl text-slate-400 hover:text-[#366480] hover:bg-[#f0f5f4] disabled:opacity-30 transition-all"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        {Array.from({ length: controlTotalPages }, (_, i) => i + 1).map(page => (
                                            <button
                                                key={page}
                                                onClick={() => setControlPage(page)}
                                                className={`w-8 h-8 rounded-xl text-[11px] font-black transition-all ${controlPage === page ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-[#366480] hover:bg-[#f0f5f4]'}`}
                                            >
                                                {page}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => setControlPage(p => Math.min(controlTotalPages, p + 1))}
                                            disabled={controlPage === controlTotalPages}
                                            className="p-2 rounded-xl text-slate-400 hover:text-[#366480] hover:bg-[#f0f5f4] disabled:opacity-30 transition-all"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                            </>)}

                            {/* ── USUARIOS TAB ─────────────────────────────── */}
                            {ajusteTab === 'usuarios' && (
                                <div>
                                    <div className="px-8 py-5 flex items-center justify-between">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            {sysUsersLoading ? 'Cargando...' : `${sysUsers.length} usuario${sysUsers.length !== 1 ? 's' : ''}`}
                                        </p>
                                        <button
                                            onClick={fetchSysUsers}
                                            disabled={sysUsersLoading}
                                            className="p-2 rounded-xl text-slate-400 hover:text-[#366480] hover:bg-[#f0f5f4] transition-all disabled:opacity-40"
                                            title="Actualizar lista"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${sysUsersLoading ? 'animate-spin' : ''}`} />
                                        </button>
                                    </div>
                                    <div className="px-8 pb-8">
                                        {sysUsersLoading ? (
                                            <div className="py-16 text-center text-[11px] font-black text-slate-300 uppercase tracking-widest animate-pulse">
                                                Sincronizando...
                                            </div>
                                        ) : sysUsers.length === 0 ? (
                                            <div className="py-16 text-center text-[11px] font-black text-slate-300 uppercase tracking-widest">
                                                Sin usuarios
                                            </div>
                                        ) : (
                                            <table className="w-full border-collapse">
                                                <thead>
                                                    <tr className="border-b border-[#d3dcdb]/40">
                                                        {['Usuario', 'Rol', 'Correo', ''].map(h => (
                                                            <th key={h} className="pb-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest pr-6 last:pr-0">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sysUsers.map((u: { id: string; full_name: string; role: string; email: string }) => {
                                                        const nameParts = (u.full_name || '').split(' ').filter(Boolean);
                                                        const initials = nameParts.slice(0, 2).map((n: string) => n[0].toUpperCase()).join('') || '?';
                                                        const roleMap: Record<string, { label: string; color: string; bg: string }> = {
                                                            admin:          { label: 'Admin',          color: '#2c3434', bg: '#e8eded' },
                                                            administrador:  { label: 'Administrador',  color: '#366480', bg: '#e0eef4' },
                                                            ventas:         { label: 'Ventas',         color: '#15803d', bg: '#dcfce7' },
                                                            asistente_admin:{ label: 'Asistente Admin',color: '#6d28d9', bg: '#ede9fe' },
                                                        };
                                                        const roleInfo = roleMap[u.role] || { label: u.role, color: '#2c3434', bg: '#f0f5f4' };
                                                        const link = generatedLinks[u.id];
                                                        const isLoading = generatingLinkUserId === u.id;
                                                        const isCopied = copiedUserId === u.id;
                                                        return (
                                                            <React.Fragment key={u.id}>
                                                            <tr className="border-b border-[#d3dcdb]/20 hover:bg-[#f0f5f4]/40 transition-colors">
                                                                <td className="py-4 pr-6">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                                                                            {initials}
                                                                        </div>
                                                                        <span className="text-[13px] font-bold text-[#2c3434]">{u.full_name || '(Sin nombre)'}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-4 pr-6">
                                                                    <span
                                                                        className="text-[10px] font-black px-2.5 py-1 rounded-lg"
                                                                        style={{ color: roleInfo.color, background: roleInfo.bg }}
                                                                    >
                                                                        {roleInfo.label}
                                                                    </span>
                                                                </td>
                                                                <td className="py-4 pr-6">
                                                                    <span className="text-[12px] font-bold text-slate-500">{u.email}</span>
                                                                </td>
                                                                <td className="py-4">
                                                                    {link === '__error__' ? (
                                                                        <span className="text-[10px] font-black px-3 py-1.5 rounded-xl text-rose-600 bg-rose-50">
                                                                            Error al generar
                                                                        </span>
                                                                    ) : link ? (
                                                                        <button
                                                                            onClick={() => setGeneratedLinks(prev => { const n = { ...prev }; delete n[u.id]; return n; })}
                                                                            className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
                                                                        >
                                                                            Ocultar
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => generateResetLink(u.id, u.email)}
                                                                            disabled={isLoading}
                                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#d3dcdb]/30 text-[#366480] hover:bg-[#f0f5f4] hover:border-[#366480]/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm disabled:opacity-40"
                                                                        >
                                                                            {isLoading ? (
                                                                                <span
                                                                                    className="w-3 h-3 rounded-full border-2 animate-spin"
                                                                                    style={{ borderColor: 'rgba(54,100,128,0.3)', borderTopColor: '#366480' }}
                                                                                />
                                                                            ) : (
                                                                                <span className="material-icons-round text-[13px]">link</span>
                                                                            )}
                                                                            Generar enlace
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                            {link && link !== '__error__' && (
                                                                <tr>
                                                                    <td colSpan={4} className="pb-4 pt-0">
                                                                        <div className="mr-2 px-4 py-3 rounded-xl bg-[#f0f5f4] border border-[#d3dcdb]/30 flex items-center gap-3">
                                                                            <span className="material-icons-round text-[14px] text-[#366480] shrink-0">link</span>
                                                                            <input
                                                                                type="text"
                                                                                value={link}
                                                                                readOnly
                                                                                onClick={e => (e.target as HTMLInputElement).select()}
                                                                                className="flex-1 bg-transparent text-[11px] font-mono text-slate-600 outline-none min-w-0"
                                                                            />
                                                                            <button
                                                                                onClick={async () => {
                                                                                    await navigator.clipboard.writeText(link);
                                                                                    setCopiedUserId(u.id);
                                                                                    setTimeout(() => setCopiedUserId(null), 2000);
                                                                                }}
                                                                                className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isCopied ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-[#366480] border border-[#d3dcdb]/30 hover:bg-[#366480] hover:text-white hover:border-[#366480]'}`}
                                                                            >
                                                                                {isCopied ? '¡Copiado!' : 'Copiar'}
                                                                            </button>
                                                                        </div>
                                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2 px-1">
                                                                            Enlace de un solo uso · expira en 1 hora · comparte por chat o WhatsApp
                                                                        </p>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── ADD PRODUCT SUB-MODAL ──────────────────────────────────── */}
            {addProdOpen && createPortal(
                <div
                    className={`fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-[#2c3434]/30 ${addProdClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
                    style={{ backdropFilter: 'blur(8px)', fontFamily: "'Manrope', sans-serif" }}
                >
                    <div className={`bg-white/97 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.15)] w-full max-w-lg border border-white/60 relative overflow-hidden ${addProdClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/60 z-10" />
                        {/* Header */}
                        <div className="px-8 pt-8 pb-5 border-b border-[#d3dcdb]/20">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-[18px] font-black text-[#2c3434] tracking-tight leading-snug">
                            {addProdMode === 'edit' ? 'Editar Producto' : 'Nuevo Producto en Catálogo'}
                        </h2>
                                    <p className="text-[11px] font-bold text-slate-400 mt-1 tracking-wide">Completa la clasificación y los datos del producto.</p>
                                </div>
                                <button onClick={closeAddProd} className="w-8 h-8 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all flex-shrink-0 ml-4 mt-0.5">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        {/* Form */}
                        <div className="px-8 py-6 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
                            {/* Clasificación */}
                            <div className="bg-[#f8faf9] rounded-2xl border border-[#e8eded] p-5 space-y-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">1. Clasificación</p>
                                <div className="grid grid-cols-3 gap-3">
                                    {/* Categoría */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Categoría *</label>
                                        <div className="relative">
                                            <select value={addProdSelCat} onChange={e => handleCatChange(e.target.value)}
                                                className="appearance-none w-full px-3 py-2.5 bg-white border border-[#e8eded] rounded-xl text-[12px] font-bold text-[#2c3434] outline-none cursor-pointer pr-8 focus:border-[#4A90E2]/40">
                                                {addProdCats.length === 0 ? (
                                                    <option value="">Cargando...</option>
                                                ) : (
                                                    <>
                                                        <option value="" disabled hidden>Seleccionar</option>
                                                        {addProdCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </>
                                                )}
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    {/* Familia */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Familia *</label>
                                        <div className="relative">
                                            <select value={addProdSelFam} onChange={e => handleFamChange(e.target.value)}
                                                disabled={!addProdSelCat || addProdFams.length === 0}
                                                className="appearance-none w-full px-3 py-2.5 bg-white border border-[#e8eded] rounded-xl text-[12px] font-bold text-[#2c3434] outline-none cursor-pointer pr-8 focus:border-[#4A90E2]/40 disabled:opacity-40">
                                                <option value="" disabled hidden>Seleccionar</option>
                                                {addProdFams.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    {/* Subfamilia */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Subfamilia *</label>
                                        <div className="relative">
                                            <select value={addProdSelSub} onChange={e => setAddProdSelSub(e.target.value)}
                                                disabled={!addProdSelFam || addProdSubs.length === 0}
                                                className="appearance-none w-full px-3 py-2.5 bg-white border border-[#e8eded] rounded-xl text-[12px] font-bold text-[#2c3434] outline-none cursor-pointer pr-8 focus:border-[#4A90E2]/40 disabled:opacity-40">
                                                <option value="" disabled hidden>Seleccionar</option>
                                                {addProdSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Datos del producto */}
                            <div className={`bg-[#f8faf9] rounded-2xl border border-[#e8eded] p-5 space-y-4 transition-all duration-300 ${addProdSelSub ? '' : 'opacity-40 pointer-events-none'}`}>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">2. Datos del Producto</p>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Nombre Base *</label>
                                    <input type="text" value={addProdForm.base_name}
                                        onChange={e => setAddProdForm(f => ({ ...f, base_name: e.target.value }))}
                                        placeholder="Ej. Bisagra Cazoleta"
                                        className="w-full px-4 py-3 bg-white border border-[#e8eded] rounded-xl text-[13px] font-bold text-[#2c3434] outline-none placeholder:text-slate-300 focus:border-[#4A90E2]/40" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Presentación *</label>
                                        <input type="text" value={addProdForm.presentation}
                                            onChange={e => setAddProdForm(f => ({ ...f, presentation: e.target.value }))}
                                            placeholder="Ej. 35mm / Bolsa x50"
                                            className="w-full px-4 py-3 bg-white border border-[#e8eded] rounded-xl text-[13px] font-bold text-[#2c3434] outline-none placeholder:text-slate-300 focus:border-[#4A90E2]/40" />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Unidad *</label>
                                        <div className="relative">
                                            <select value={addProdForm.unit} onChange={e => setAddProdForm(f => ({ ...f, unit: e.target.value }))}
                                                className="appearance-none w-full px-4 py-3 bg-white border border-[#e8eded] rounded-xl text-[13px] font-bold text-[#2c3434] outline-none cursor-pointer pr-8 focus:border-[#4A90E2]/40">
                                                <option value="" disabled hidden>Seleccionar</option>
                                                <option value="Unidad">Unidad</option>
                                                <option value="Plancha">Plancha</option>
                                                <option value="Caja / Bolsa / Paquete">Caja / Bolsa / Paquete</option>
                                                <option value="Metro">Metro</option>
                                                <option value="Litro">Litro</option>
                                                <option value="Kilogramo">Kilogramo</option>
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Costo de Referencia (S/)</label>
                                        <input type="number" min="0" step="0.01" value={addProdForm.reference_cost}
                                            onChange={e => setAddProdForm(f => ({ ...f, reference_cost: e.target.value === '' ? '' : Number(e.target.value) }))}
                                            placeholder="0.00"
                                            className="w-full px-4 py-3 bg-white border border-[#e8eded] rounded-xl text-[13px] font-bold text-[#2c3434] outline-none placeholder:text-slate-300 focus:border-[#4A90E2]/40 tabular-nums" />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Precio Mínimo (S/)</label>
                                        <input type="number" min="0" step="0.01" value={addProdForm.min_price}
                                            onChange={e => setAddProdForm(f => ({ ...f, min_price: e.target.value === '' ? '' : Number(e.target.value) }))}
                                            placeholder="0.00"
                                            className="w-full px-4 py-3 bg-white border border-[#e8eded] rounded-xl text-[13px] font-bold text-[#2c3434] outline-none placeholder:text-slate-300 focus:border-[#4A90E2]/40 tabular-nums" />
                                    </div>
                                </div>
                            </div>
                            {/* Error */}
                            {addProdError && (
                                <p className="text-[11px] font-bold text-rose-500 bg-rose-50 px-4 py-3 rounded-2xl border border-rose-100">{addProdError}</p>
                            )}
                            {/* Actions */}
                            <div className="flex items-center justify-end gap-3 pt-1">
                                <button onClick={closeAddProd} className="px-6 py-3 text-[10px] font-black text-slate-500 hover:text-slate-700 transition-all uppercase tracking-widest">
                                    Cancelar
                                </button>
                                <button onClick={saveAddProd} disabled={addProdSaving}
                                    className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-800 transition-all disabled:opacity-60">
                                    <Check className="w-3.5 h-3.5" />
                                    {addProdSaving ? 'Guardando...' : addProdMode === 'edit' ? 'Guardar Cambios' : 'Guardar Producto'}
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
