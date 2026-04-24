
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { OrdenPago, Proveedor, Project } from '../services/types';
import { PaymentOrderModal } from '../components/solicitudes/PaymentOrderModal';
import { 
    Search, 
    Filter, 
    Plus,
    Clock,
    Building2,
    Pencil,
    RefreshCw,
    TrendingDown,
    Eye,
    ChevronDown,
    FileText,
    FileSpreadsheet,
    Calendar
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { RangeDatePicker } from '../components/RangeDatePicker';

const SearchInput = React.memo(({ value, onSearch, placeholder, className }: {
    value: string;
    onSearch: (v: string) => void;
    placeholder: string;
    className: string;
}) => {
    const [local, setLocal] = React.useState(value);
    const timer = React.useRef<ReturnType<typeof setTimeout>>();

    React.useEffect(() => { setLocal(value); }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setLocal(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onSearch(v), 250);
    };

    return <input type="text" placeholder={placeholder} value={local} onChange={handleChange} className={className} />;
});

export const SolicitudesPage: React.FC = () => {
    const [ordenes, setOrdenes] = useState<OrdenPago[]>([]);
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [fontsLoaded, setFontsLoaded] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [selectedOrden, setSelectedOrden] = useState<OrdenPago | undefined>(undefined);
    const [modalMode, setModalMode] = useState<'VIEW' | 'EDIT' | 'CREATE'>('CREATE');

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState<'TODOS' | 'ENVIADO' | 'PAGADO' | 'ANULADO'>('TODOS');
    
    const defaultStart = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const defaultEnd = format(new Date(), 'yyyy-MM-dd');

    const [startDate, setStartDate] = useState<string>(defaultStart);
    const [endDate, setEndDate] = useState<string>(defaultEnd);
    const [tempStartDate, setTempStartDate] = useState<string>(defaultStart);
    const [tempEndDate, setTempEndDate] = useState<string>(defaultEnd);
    const [mainQuickFilter, setMainQuickFilter] = useState<'PERSONALIZADO'|'HOY'|'ULTIMOS_7'|'ESTA_SEMANA'|'MES_ACTUAL'>('ULTIMOS_7');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const datePickerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
                setShowDatePicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [o, p, proj] = await Promise.all([
                api.getOrdenesPago(),
                api.getProveedores(),
                api.getProjects()
            ]);
            setOrdenes(o);
            setProveedores(p);
            setProjects(proj);
        } catch (error) {
            console.error("Error al cargar datos de solicitudes:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if ('fonts' in document) {
            document.fonts.ready.then(() => setFontsLoaded(true));
        } else {
            setFontsLoaded(true);
        }
        fetchData();
    }, []);

    const handleOpenModal = (orden?: OrdenPago, mode: 'VIEW' | 'EDIT' | 'CREATE' = 'CREATE') => {
        setSelectedOrden(orden);
        setModalMode(mode);
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setSelectedOrden(undefined);
        fetchData();
    };

    const filteredOrdenes = useMemo(() => {
        const term = searchTerm.toLowerCase();
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;

        const filtered = ordenes.filter(o => {
            const matchesSearch = o.codigo_orden.toLowerCase().includes(term) || 
                                 (o.proveedor?.razon_social || '').toLowerCase().includes(term) ||
                                 (o.obra_nombre || '').toLowerCase().includes(term);
            if (!matchesSearch) return false;

            const matchesEstado = filterEstado === 'TODOS' || o.estado.toUpperCase() === filterEstado;
            if (!matchesEstado) return false;

            // 'enviado' status bypasses date filter to remain always visible
            if (o.estado === 'enviado') return true;

            const fecha = new Date(o.fecha_emision);
            return (!start || fecha >= start) && (!end || fecha <= end);
        });

        // Sorting: 'enviado' items at the top, then by date descending
        return filtered.sort((a, b) => {
            if (a.estado === 'enviado' && b.estado !== 'enviado') return -1;
            if (a.estado !== 'enviado' && b.estado === 'enviado') return 1;
            return new Date(b.fecha_emision).getTime() - new Date(a.fecha_emision).getTime();
        });
    }, [ordenes, searchTerm, filterEstado, startDate, endDate]);

    const stats = useMemo(() => ({
        pending: ordenes.filter(o => o.estado === 'enviado').length,
        totalMonth: ordenes.filter(o => {
            const date = new Date(o.fecha_emision);
            const now = new Date();
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }).reduce((acc, o) => acc + (o.moneda === 'PEN' ? Number(o.monto_total) : 0), 0),
        activeProviders: new Set(ordenes.map(o => o.proveedor_id)).size
    }), [ordenes]);

    const getStatusBadge = (status: string) => {
        const baseClass = "px-4 py-1.5 text-[8px] font-black rounded-full uppercase tracking-widest border shadow-sm";
        switch (status) {
            case 'pagado':
                return <span className={`${baseClass} bg-emerald-50 text-emerald-700 border-emerald-100`}>Pagado</span>;
            case 'enviado':
                return <span className={`${baseClass} bg-amber-50 text-amber-700 border-amber-100`}>Enviado</span>;
            case 'anulado':
            case 'rechazado':
                return <span className={`${baseClass} bg-rose-50 text-rose-700 border-rose-100`}>{status}</span>;
            default:
                return <span className={`${baseClass} bg-slate-50 text-slate-700 border-slate-100`}>{status}</span>;
        }
    };

    return (
        <React.Fragment>
            <div 
                key={(loading || !fontsLoaded) ? 'loading' : 'content'}
                className="p-10 max-w-[1600px] mx-auto space-y-10 animate-premium-fade"
            >
                {(loading || !fontsLoaded) ? (
                    <div className="flex items-center justify-center h-[60vh]">
                        <RefreshCw className="w-12 h-12 animate-spin text-indigo-600" />
                    </div>
                ) : (
                    <div className="space-y-10">
                        {/* Header */}
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter italic uppercase">SOLICITUDES</h1>
                                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Gestión de requerimientos y pagos</p>
                            </div>
                            <button
                                onClick={() => handleOpenModal()}
                                className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-[1.5rem] font-black text-[10px] uppercase shadow-xl shadow-indigo-100 dark:shadow-indigo-900/40 transition-all border-b-4 border-indigo-800 active:translate-y-px hover:scale-105"
                            >
                                <Plus className="w-4 h-4" />
                                Nueva Solicitud
                            </button>
                        </div>

                        {/* Stats & Search/Filters Area */}
                        <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-stretch">
                            <div className="grid grid-cols-3 gap-4 flex-[1.5] w-full">
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Clock className="w-12 h-12 text-indigo-600" /></div>
                                    <p className="text-slate-400 text-[8px] font-black uppercase tracking-[0.2em] mb-1">Pendientes</p>
                                    <p className="text-3xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">{stats.pending}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><TrendingDown className="w-12 h-12 text-emerald-600" /></div>
                                    <p className="text-slate-400 text-[8px] font-black uppercase tracking-[0.2em] mb-1">Monto Mes</p>
                                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tighter">S/ {stats.totalMonth.toLocaleString('es-PE', { minimumFractionDigits: 0 })}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Building2 className="w-12 h-12 text-amber-600" /></div>
                                    <p className="text-slate-400 text-[8px] font-black uppercase tracking-[0.2em] mb-1">Proveedores</p>
                                    <p className="text-3xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">{stats.activeProviders}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-[32px] flex flex-col mb-10 shadow-sm border border-[#e8eded] flex-1 relative z-20">
                            {/* Filter Bar */}
                            <div className="p-8 pb-4 flex flex-wrap items-center gap-4 shrink-0 bg-transparent border-b border-[#f0f5f4]">
                                <div className="relative flex-1 min-w-[300px]">
                                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b9ba5]" />
                                    <SearchInput
                                        value={searchTerm}
                                        onSearch={setSearchTerm}
                                        placeholder="Buscar por proveedor, obra o código..."
                                        className="w-full pl-12 pr-6 py-3 bg-[#f8faf9] border-none rounded-full text-[12px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#8b9ba5]"
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="relative group">
                                        <select
                                            value={filterEstado}
                                            onChange={(e) => setFilterEstado(e.target.value as any)}
                                            className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
                                        >
                                            <option value="TODOS">Todos</option>
                                            <option value="ENVIADO">Enviado</option>
                                            <option value="PAGADO">Pagado</option>
                                            <option value="ANULADO">Anulado</option>
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                                    </div>

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
                                                    if (val === 'ESTA_SEMANA' || val === 'ULTIMOS_30') {
                                                        start = format(subDays(new Date(), 30), 'yyyy-MM-dd');
                                                        end = format(new Date(), 'yyyy-MM-dd');
                                                    } else if (val === 'ULTIMOS_7') {
                                                        start = format(subDays(new Date(), 7), 'yyyy-MM-dd');
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
                                            <option value="ULTIMOS_30">Últimos 30 días</option>
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
                                                startDate={tempStartDate}
                                                endDate={tempEndDate}
                                                onApply={(start, end) => {
                                                    setStartDate(start);
                                                    setEndDate(end);
                                                    setTempStartDate(start);
                                                    setTempEndDate(end);
                                                    setShowDatePicker(false);
                                                }}
                                                onCancel={() => setShowDatePicker(false)}
                                            />
                                        </div>
                                    )}

                                    <button 
                                        onClick={() => fetchData()}
                                        className="p-3 bg-[#f8faf9] text-[#366480] rounded-xl hover:bg-[#e8eded] transition-all"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Código</th>
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Fecha Emisión</th>
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Proveedor</th>
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Obra</th>
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Monto</th>
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Estado</th>
                                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                        {loading ? (
                                            <tr><td colSpan={7} className="px-10 py-20 text-center font-black animate-pulse text-slate-300 uppercase text-[10px]">Actualizando solicitudes...</td></tr>
                                        ) : filteredOrdenes.length === 0 ? (
                                            <tr><td colSpan={7} className="px-10 py-20 text-center font-black text-slate-300 uppercase text-[10px]">No se encontraron registros</td></tr>
                                        ) : (
                                            filteredOrdenes.map((orden) => (
                                                <tr key={orden.id} className="hover:bg-amber-50/20 transition-all border-b border-slate-50 dark:border-slate-800">
                                                    <td className="px-10 py-7"><span className="font-black text-[11px] text-indigo-600 uppercase tracking-tighter">#{orden.codigo_orden}</span></td>
                                                    <td className="px-10 py-7"><span className="text-[10px] font-bold text-slate-400 uppercase">{format(new Date(orden.fecha_emision), "dd/MM/yyyy")}</span></td>
                                                    <td className="px-10 py-7">
                                                        <div className="flex flex-col">
                                                            <span className="font-black text-[10px] text-slate-700 dark:text-slate-300 uppercase">{orden.proveedor?.razon_social}</span>
                                                            <span className="text-[8px] font-bold text-slate-400 tracking-widest uppercase">{orden.proveedor?.tax_id}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-10 py-7"><span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">{orden.obra_nombre}</span></td>
                                                    <td className="px-10 py-7 text-right"><span className="font-black text-sm text-slate-900 dark:text-white tabular-nums tracking-tighter">{orden.moneda === 'PEN' ? 'S/' : '$'} {Number(orden.monto_total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span></td>
                                                    <td className="px-10 py-7 text-center">{getStatusBadge(orden.estado)}</td>
                                                    <td className="px-10 py-7 text-right">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <button onClick={() => handleOpenModal(orden, 'VIEW')} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-2xl transition-all shadow-sm active:scale-90" title="Ver Detalles"><Eye className="w-4 h-4" /></button>
                                                            {orden.estado === 'enviado' && (
                                                                <button onClick={() => handleOpenModal(orden, 'EDIT')} className="p-3 bg-amber-50 dark:bg-slate-800 text-amber-500 hover:text-amber-600 rounded-2xl transition-all shadow-sm active:scale-90 border border-amber-100" title="Editar Requerimiento"><Pencil className="w-4 h-4" /></button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <PaymentOrderModal
                    isOpen={showModal}
                    onClose={handleCloseModal}
                    orden={selectedOrden}
                    mode={modalMode}
                    proveedores={proveedores}
                    projects={projects}
                />
            )}
        </React.Fragment>
    );
};
