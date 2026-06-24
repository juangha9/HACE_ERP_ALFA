import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { formatDistanceToNow, format, isToday, isThisMonth, subDays, isAfter, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { RangeDatePicker } from '../../components/RangeDatePicker';

const PAGE_SIZE = 10;

type Prioridad = 'NORMAL' | 'ALTO' | 'MUY ALTO';
type FiltroEstado = 'TODOS' | 'PENDIENTE' | 'REVISADO';
type FiltroFecha = 'TODOS' | 'HOY' | 'ULTIMOS_7' | 'MES_ACTUAL' | 'PERSONALIZADO';

interface RequerimientoItem {
    id: string;
    cotizacion_id: string;
    codigo_cotizacion: string;
    cliente_nombre: string;
    descripcion: string;
    cantidad: number;
    unidad: string;
    estado: 'pendiente' | 'revisado';
    observacion: string | null;
    cotizacion_descripcion: string | null;
    prioridad: Prioridad;
    created_at: string;
}

interface RequerimientoGrupo {
    cotizacion_id: string;
    codigo_cotizacion: string;
    cliente_nombre: string;
    cotizacion_descripcion: string | null;
    prioridad: Prioridad;
    created_at: string;
    items: RequerimientoItem[];
    todoRevisado: boolean;
}

const PRIORIDAD_CONFIG: Record<Prioridad, { label: string; classes: string }> = {
    NORMAL:   { label: 'Normal',   classes: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' },
    ALTO:     { label: 'Alto',     classes: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
    'MUY ALTO': { label: 'Muy alto', classes: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' },
};

function RequerimientoCard({
    grupo,
    observacion,
    onObservacionChange,
    onMarcar,
    guardando,
}: {
    grupo: RequerimientoGrupo;
    observacion: string;
    onObservacionChange: (val: string) => void;
    onMarcar: () => void;
    guardando: boolean;
}) {
    const isPendiente = !grupo.todoRevisado;
    const prio = PRIORIDAD_CONFIG[grupo.prioridad ?? 'NORMAL'];
    const createdDate = new Date(grupo.created_at);

    return (
        <div className={`rounded-2xl border p-4 transition-all ${
            isPendiente
                ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-900/10'
                : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 opacity-60'
        }`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={`material-symbols-outlined text-[18px] shrink-0 ${isPendiente ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {isPendiente ? 'pending' : 'task_alt'}
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                            {grupo.cliente_nombre}
                        </p>
                        <p className="text-xs text-slate-400 font-mono font-bold tracking-wide">{grupo.codigo_cotizacion}</p>
                    </div>
                </div>

                {/* Badges: estado + prioridad + hora */}
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {grupo.prioridad !== 'NORMAL' && (
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${prio.classes}`}>
                            {prio.label}
                        </span>
                    )}
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        isPendiente
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    }`}>
                        {isPendiente ? 'Pendiente' : 'Revisado'}
                    </span>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap tabular-nums">
                        {format(createdDate, 'HH:mm')} · {formatDistanceToNow(createdDate, { addSuffix: true, locale: es })}
                    </span>
                </div>
            </div>

            {/* Descripción/Observaciones de la cotización */}
            {grupo.cotizacion_descripcion && (
                <div className="mb-3 px-3 py-2 rounded-xl bg-slate-100/70 dark:bg-slate-800/40">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Descripción de cotización</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{grupo.cotizacion_descripcion}</p>
                </div>
            )}

            {/* Lista de materiales */}
            <div className="mb-3 space-y-1">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest mb-1.5">
                    Materiales requeridos
                </p>
                {grupo.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-xs">
                        <span className="material-symbols-outlined text-[13px] text-slate-300 dark:text-slate-600 shrink-0">fiber_manual_record</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">
                            {item.cantidad} {item.unidad}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 truncate">{item.descripcion}</span>
                    </div>
                ))}
            </div>

            {/* Observación + botón revisado */}
            {isPendiente && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-amber-100 dark:border-amber-800/30">
                    <input
                        type="text"
                        value={observacion}
                        onChange={e => onObservacionChange(e.target.value)}
                        placeholder="Observación del almacenero (opcional)..."
                        className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-indigo-400 dark:focus:border-indigo-600 transition-colors"
                    />
                    <button
                        onClick={onMarcar}
                        disabled={guardando}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-black uppercase tracking-wide transition-colors shrink-0"
                    >
                        {guardando ? (
                            <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                            <span className="material-symbols-outlined text-[15px]">check</span>
                        )}
                        Revisado
                    </button>
                </div>
            )}

            {/* Observación guardada */}
            {!isPendiente && observacion && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 italic">"{observacion}"</p>
                </div>
            )}
        </div>
    );
}

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 mt-2">
            <button
                onClick={() => onPage(page - 1)}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors"
            >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                Anterior
            </button>
            <span className="text-[11px] text-slate-400 font-medium">
                Página {page} de {total}
            </span>
            <button
                onClick={() => onPage(page + 1)}
                disabled={page === total}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors"
            >
                Siguiente
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
        </div>
    );
}

export default function InventoryDashboard() {
    const [stats, setStats] = useState({ totalItems: 0, totalValue: 0, todayMoves: 0 });
    const [loading, setLoading] = useState(true);
    const [fontsLoaded, setFontsLoaded] = useState(false);
    const [requerimientos, setRequerimientos] = useState<RequerimientoGrupo[]>([]);
    const [observaciones, setObservaciones] = useState<Record<string, string>>({});
    const [guardando, setGuardando] = useState<Record<string, boolean>>({});

    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS');
    const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>('TODOS');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const datePickerRef = useRef<HTMLDivElement>(null);

    // Paginación
    const [page, setPage] = useState(1);

    const loadRequerimientos = useCallback(async () => {
        const { data, error } = await supabase
            .from('requerimientos_logistica')
            .select('*')
            .order('created_at', { ascending: false });

        if (error || !data) return;

        const grupos = new Map<string, RequerimientoGrupo>();
        for (const row of data as RequerimientoItem[]) {
            if (!grupos.has(row.cotizacion_id)) {
                grupos.set(row.cotizacion_id, {
                    cotizacion_id: row.cotizacion_id,
                    codigo_cotizacion: row.codigo_cotizacion,
                    cliente_nombre: row.cliente_nombre,
                    cotizacion_descripcion: row.cotizacion_descripcion ?? null,
                    prioridad: row.prioridad ?? 'NORMAL',
                    created_at: row.created_at,
                    items: [],
                    todoRevisado: false,
                });
            }
            grupos.get(row.cotizacion_id)!.items.push(row);
        }

        const gruposArray = Array.from(grupos.values()).map(g => ({
            ...g,
            todoRevisado: g.items.every(i => i.estado === 'revisado'),
        }));

        // Pendientes primero, luego por fecha desc
        gruposArray.sort((a, b) => {
            if (a.todoRevisado !== b.todoRevisado) return a.todoRevisado ? 1 : -1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        setRequerimientos(gruposArray);
        setObservaciones(prev => {
            const next = { ...prev };
            for (const g of gruposArray) {
                if (!(g.cotizacion_id in next)) {
                    const withObs = g.items.find(i => i.observacion);
                    next[g.cotizacion_id] = withObs?.observacion ?? '';
                }
            }
            return next;
        });
    }, []);

    const loadRequerimientosRef = useRef(loadRequerimientos);
    useEffect(() => { loadRequerimientosRef.current = loadRequerimientos; }, [loadRequerimientos]);

    useEffect(() => {
        if ('fonts' in document) {
            document.fonts.ready.then(() => setFontsLoaded(true));
        } else {
            setFontsLoaded(true);
        }
        api.getInventoryStats()
            .then(data => setStats(data))
            .catch(console.error)
            .finally(() => setLoading(false));
        loadRequerimientos();
    }, [loadRequerimientos]);

    // Click outside date picker
    useEffect(() => {
        const fn = (e: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node))
                setShowDatePicker(false);
        };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, []);

    // Realtime
    useEffect(() => {
        const reloadDebounce: { t: ReturnType<typeof setTimeout> | null } = { t: null };
        const triggerReload = () => {
            if (reloadDebounce.t) clearTimeout(reloadDebounce.t);
            reloadDebounce.t = setTimeout(() => loadRequerimientosRef.current(), 800);
        };
        const channel = supabase
            .channel('inventory-requerimientos-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'requerimientos_logistica' }, triggerReload)
            .subscribe();
        return () => {
            if (reloadDebounce.t) clearTimeout(reloadDebounce.t);
            supabase.removeChannel(channel);
        };
    }, []);

    // Resetear página al cambiar filtros
    useEffect(() => { setPage(1); }, [searchTerm, filtroEstado, filtroFecha, startDate, endDate]);

    // Filtrado
    const filtrados = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        return requerimientos.filter(g => {
            if (term && !g.cliente_nombre.toLowerCase().includes(term) && !g.codigo_cotizacion.toLowerCase().includes(term))
                return false;
            if (filtroEstado === 'PENDIENTE' && g.todoRevisado) return false;
            if (filtroEstado === 'REVISADO' && !g.todoRevisado) return false;
            if (filtroFecha !== 'TODOS') {
                const d = new Date(g.created_at);
                if (filtroFecha === 'HOY' && !isToday(d)) return false;
                if (filtroFecha === 'ULTIMOS_7' && !isAfter(d, subDays(new Date(), 7))) return false;
                if (filtroFecha === 'MES_ACTUAL' && !isThisMonth(d)) return false;
                if (filtroFecha === 'PERSONALIZADO') {
                    if (startDate && isBefore(d, new Date(startDate + 'T00:00:00'))) return false;
                    if (endDate && isAfter(d, new Date(endDate + 'T23:59:59'))) return false;
                }
            }
            return true;
        });
    }, [requerimientos, searchTerm, filtroEstado, filtroFecha, startDate, endDate]);

    const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
    const paginados = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const pendientesTotal = requerimientos.filter(g => !g.todoRevisado).length;

    const marcarRevisado = async (cotizacion_id: string) => {
        setGuardando(prev => ({ ...prev, [cotizacion_id]: true }));
        try {
            const { data: { user } } = await supabase.auth.getUser();
            await supabase
                .from('requerimientos_logistica')
                .update({
                    estado: 'revisado',
                    observacion: observaciones[cotizacion_id] || null,
                    revisado_por: user?.id ?? null,
                    revisado_en: new Date().toISOString(),
                })
                .eq('cotizacion_id', cotizacion_id);
            await loadRequerimientos();
        } finally {
            setGuardando(prev => ({ ...prev, [cotizacion_id]: false }));
        }
    };

    if (!fontsLoaded) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-slate-900 w-full">
                <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-800 border-t-indigo-600 dark:border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Iniciando Dashboard...</p>
            </div>
        );
    }

    return (
        <div className={`space-y-6 transition-all duration-700 ${(loading || !fontsLoaded) ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'}`}>
            <header>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Panel de Control</h2>
            </header>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors">
                    <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <span className="material-symbols-outlined text-9xl text-indigo-600">inventory_2</span>
                    </div>
                    <div className="relative">
                        <div className="size-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 transition-colors">
                            <span className="material-symbols-outlined">dataset</span>
                        </div>
                        <p className="text-slate-400 dark:text-slate-500 text-xs font-black uppercase tracking-widest">Total Artículos</p>
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1">{stats.totalItems}</h3>
                        <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-2 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">check_circle</span> SKU's registrados
                        </p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors">
                    <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <span className="material-symbols-outlined text-9xl text-rose-600">notification_important</span>
                    </div>
                    <div className="relative">
                        <div className="size-12 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4 transition-colors">
                            <span className="material-symbols-outlined">approval_delegation</span>
                        </div>
                        <p className="text-slate-400 dark:text-slate-500 text-xs font-black uppercase tracking-widest">Aprobaciones Pendientes</p>
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1">{(stats as any).pendingApprovals || 0}</h3>
                        <p className={`text-[10px] font-bold mt-2 flex items-center gap-1 ${((stats as any).pendingApprovals || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            <span className="material-symbols-outlined text-sm">
                                {((stats as any).pendingApprovals || 0) > 0 ? 'priority_high' : 'task_alt'}
                            </span>
                            {((stats as any).pendingApprovals || 0) > 0 ? 'Requiere atención' : 'Todo procesado'}
                        </p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors">
                    <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <span className="material-symbols-outlined text-9xl text-amber-600">swap_horiz</span>
                    </div>
                    <div className="relative">
                        <div className="size-12 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 transition-colors">
                            <span className="material-symbols-outlined">history</span>
                        </div>
                        <p className="text-slate-400 dark:text-slate-500 text-xs font-black uppercase tracking-widest">Movimientos Hoy</p>
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1">{stats.todayMoves}</h3>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-2 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">schedule</span> Últimas 24 horas
                        </p>
                    </div>
                </div>
            </div>

            {/* Requerimientos de Venta */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                {/* Header del panel */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[18px] text-indigo-600 dark:text-indigo-400">package_2</span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Requerimientos de Venta</h4>
                    </div>
                    {pendientesTotal > 0 && (
                        <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest shrink-0">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            {pendientesTotal} pendiente{pendientesTotal !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {/* Barra de filtros */}
                <div className="flex flex-wrap items-center gap-2 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
                    {/* Búsqueda */}
                    <div className="relative flex-1 min-w-[200px]">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400 pointer-events-none">search</span>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Buscar por cliente o código..."
                            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-indigo-400 dark:focus:border-indigo-600 transition-colors"
                        />
                    </div>

                    {/* Estado */}
                    <div className="relative">
                        <select
                            value={filtroEstado}
                            onChange={e => setFiltroEstado(e.target.value as FiltroEstado)}
                            className="appearance-none pl-4 pr-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-bold outline-none cursor-pointer focus:border-indigo-400 dark:focus:border-indigo-600 transition-colors"
                        >
                            <option value="TODOS">Todos</option>
                            <option value="PENDIENTE">Pendientes</option>
                            <option value="REVISADO">Revisados</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 pointer-events-none">expand_more</span>
                    </div>

                    {/* Fecha */}
                    <div className="relative">
                        <select
                            value={filtroFecha}
                            onChange={e => {
                                const v = e.target.value as FiltroFecha;
                                if (v === 'PERSONALIZADO') { setFiltroFecha('PERSONALIZADO'); setShowDatePicker(true); }
                                else setFiltroFecha(v);
                            }}
                            className="appearance-none pl-4 pr-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-bold outline-none cursor-pointer focus:border-indigo-400 dark:focus:border-indigo-600 transition-colors"
                        >
                            <option value="TODOS">Todas las fechas</option>
                            <option value="HOY">Hoy</option>
                            <option value="ULTIMOS_7">Últimos 7 días</option>
                            <option value="MES_ACTUAL">Este mes</option>
                            <option value="PERSONALIZADO">Personalizado</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 pointer-events-none">expand_more</span>
                    </div>

                    {/* Selector de rango personalizado */}
                    {filtroFecha === 'PERSONALIZADO' && (
                        <div className="relative" ref={datePickerRef}>
                            <button
                                onClick={() => setShowDatePicker(v => !v)}
                                className="flex items-center gap-2 pl-3 pr-2.5 py-2 text-xs rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-bold transition-colors whitespace-nowrap"
                            >
                                <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                                {startDate
                                    ? `${format(new Date(startDate + 'T12:00:00'), 'dd MMM', { locale: es })} – ${format(new Date(endDate + 'T12:00:00'), 'dd MMM', { locale: es })}`
                                    : 'Seleccionar rango'}
                                <span className={`material-symbols-outlined text-[14px] transition-transform ${showDatePicker ? 'rotate-180' : ''}`}>expand_more</span>
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
                                align="right"
                            />
                        </div>
                    )}

                    {/* Contador resultados */}
                    <span className="text-[10px] text-slate-400 font-medium ml-auto">
                        {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Lista */}
                {filtrados.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-36 gap-2">
                        <span className="material-symbols-outlined text-4xl text-slate-200 dark:text-slate-700">inventory_2</span>
                        <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                            {requerimientos.length === 0 ? 'Sin requerimientos pendientes' : 'No hay resultados para los filtros aplicados'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-3">
                            {paginados.map(g => (
                                <RequerimientoCard
                                    key={g.cotizacion_id}
                                    grupo={g}
                                    observacion={observaciones[g.cotizacion_id] ?? ''}
                                    onObservacionChange={val =>
                                        setObservaciones(prev => ({ ...prev, [g.cotizacion_id]: val }))
                                    }
                                    onMarcar={() => marcarRevisado(g.cotizacion_id)}
                                    guardando={!!guardando[g.cotizacion_id]}
                                />
                            ))}
                        </div>
                        <Pagination page={page} total={totalPages} onPage={setPage} />
                    </>
                )}
            </div>
        </div>
    );
}
