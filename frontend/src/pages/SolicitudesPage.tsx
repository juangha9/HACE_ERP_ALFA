
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { OrdenPago, Proveedor, Project } from '../services/types';
import { PaymentOrderModal } from '../components/solicitudes/PaymentOrderModal';
import { 
    Search, 
    Plus,
    Pencil,
    RefreshCw,
    Eye,
    ChevronDown,
    Calendar
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { RangeDatePicker } from '../components/RangeDatePicker';

const SearchInput = React.memo(({ value, onSearch, placeholder, className }: {
    value: string;
    onSearch: (v: string) => void;
    placeholder: string;
    className: string;
}) => {
    const [local, setLocal] = React.useState(value);
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
                return <span className={`${baseClass} bg-[#dcfce7] text-[#166534] border-[#bbf7d0]`}>Pagado</span>;
            case 'enviado':
                return <span className={`${baseClass} bg-[#fef3c7] text-[#92400e] border-[#fde68a]`}>Enviado</span>;
            case 'anulado':
            case 'rechazado':
                return <span className={`${baseClass} bg-[#ffe4e6] text-[#be123c] border-[#fecdd3]`}>{status}</span>;
            default:
                return <span className={`${baseClass} bg-[#f0f5f4] text-[#8b9ba5] border-[#d3dcdb]`}>{status}</span>;
        }
    };

    return (
        <React.Fragment>
            <div className="flex flex-col h-full bg-[#f7faf9] text-[#2c3434] overflow-hidden relative" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                <style>{`
                    @import url('https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800;900&display=swap');
                `}</style>
                <div 
                    key={(loading || !fontsLoaded) ? 'loading' : 'content'}
                    className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-16"
                >
                {(loading || !fontsLoaded) ? (
                    <div className="flex items-center justify-center h-[60vh]">
                        <RefreshCw className="w-12 h-12 animate-spin text-[#4A90E2]" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Header Section */}
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <h2 className="text-3xl font-[900] text-[#1c3547] tracking-tighter leading-none mb-1">Gestión de Requerimientos y<br/>Pagos</h2>
                            </div>
                            <div className="flex items-center gap-4 mt-2">
                                <button
                                    onClick={() => handleOpenModal()}
                                    className="flex items-center gap-2 px-5 py-3 bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0] rounded-xl text-[13px] font-bold transition-all"
                                >
                                    <Plus className="w-4 h-4 text-[#166534]" /> <span className="leading-tight">Nueva<br/>Solicitud</span>
                                </button>
                            </div>
                        </div>

                        {/* KPI Cards */}
                        <div className="grid grid-cols-3 gap-6 mb-8">
                            <div className="relative bg-white rounded-3xl p-6 shadow-sm cursor-default overflow-hidden h-[150px] flex flex-col justify-center border border-[#e8eded]">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#f8faf9] rounded-full translate-x-12 -translate-y-12 opacity-100 pointer-events-none"></div>
                                <div className="relative z-10 flex flex-col items-start mt-2">
                                    <span className="text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest mb-3">Requerimientos Pendientes</span>
                                    <span className="text-[34px] font-[900] text-[#244c66] tracking-tighter tabular-nums mb-4">
                                        {stats.pending}
                                    </span>
                                    <div className="w-[85%] h-1 bg-[#f4f7f6] rounded-full overflow-hidden flex">
                                        <div className="h-full bg-[#356d90] w-[40%] rounded-full"></div>
                                    </div>
                                </div>
                            </div>

                            <div className="relative bg-white rounded-3xl p-6 shadow-sm cursor-default overflow-hidden h-[150px] flex flex-col justify-center border border-[#e8eded]">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#f8faf9] rounded-full translate-x-12 -translate-y-12 opacity-100 pointer-events-none"></div>
                                <div className="relative z-10 flex flex-col items-start mt-2">
                                    <span className="text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest mb-3">Monto Total del Mes</span>
                                    <span className="text-[34px] font-[900] text-[#3e6853] tracking-tighter tabular-nums mb-4">
                                        S/ {stats.totalMonth.toLocaleString('es-PE', { minimumFractionDigits: 0 })}
                                    </span>
                                    <div className="w-[85%] h-1 bg-[#f4f7f6] rounded-full overflow-hidden flex">
                                        <div className="h-full bg-[#3e6853] w-[60%] rounded-full"></div>
                                    </div>
                                </div>
                            </div>

                            <div className="relative bg-white rounded-3xl p-6 shadow-sm cursor-default overflow-hidden h-[150px] flex flex-col justify-center border border-[#e8eded]">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#f8faf9] rounded-full translate-x-12 -translate-y-12 opacity-100 pointer-events-none"></div>
                                <div className="relative z-10 flex flex-col items-start mt-2">
                                    <span className="text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest mb-3">Proveedores Activos</span>
                                    <span className="text-[34px] font-[900] text-[#2c4e66] tracking-tighter tabular-nums mb-4">
                                        {stats.activeProviders}
                                    </span>
                                    <div className="w-[85%] h-1 bg-[#f4f7f6] rounded-full overflow-hidden flex">
                                        <div className="h-full bg-[#2c4e66] w-[80%] rounded-full"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-[32px] flex flex-col mb-10 shadow-sm border border-[#e8eded] flex-1 relative z-40">
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

                        <div className="bg-white rounded-[32px] flex flex-col mb-10 shadow-sm border border-[#e8eded] flex-1 relative z-20 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-[#f0f5f4]">
                                            <th className="px-8 py-5 text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest bg-transparent">Código</th>
                                            <th className="px-8 py-5 text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest bg-transparent">Fecha Emisión</th>
                                            <th className="px-8 py-5 text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest bg-transparent">Proveedor</th>
                                            <th className="px-8 py-5 text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest bg-transparent">Obra</th>
                                            <th className="px-8 py-5 text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest text-right bg-transparent">Monto</th>
                                            <th className="px-8 py-5 text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest bg-transparent">Estado</th>
                                            <th className="px-8 py-5 text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest text-center bg-transparent">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#f0f5f4]">
                                        {loading ? (
                                            <tr><td colSpan={7} className="px-10 py-20 text-center font-bold animate-pulse text-[#8b9ba5] uppercase text-[10px]">Actualizando solicitudes...</td></tr>
                                        ) : filteredOrdenes.length === 0 ? (
                                            <tr><td colSpan={7} className="px-10 py-20 text-center font-bold text-[#8b9ba5] uppercase text-[10px]">No se encontraron registros</td></tr>
                                        ) : (
                                            filteredOrdenes.map((orden) => (
                                                <tr key={orden.id} className="hover:bg-[#f8faf9] transition-all group">
                                                    <td className="px-8 py-5"><span className="font-[900] text-[12px] text-[#244c66] uppercase tracking-tight">#{orden.codigo_orden}</span></td>
                                                    <td className="px-8 py-5"><span className="text-[11px] font-bold text-[#8b9ba5] uppercase">{format(new Date(orden.fecha_emision), "dd/MM/yyyy")}</span></td>
                                                    <td className="px-8 py-5">
                                                        <div className="flex flex-col">
                                                            <span className="font-[900] text-[11px] text-[#2c3434] uppercase">{orden.proveedor?.razon_social}</span>
                                                            <span className="text-[9px] font-bold text-[#8b9ba5] tracking-widest uppercase mt-0.5">{orden.proveedor?.tax_id}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5"><span className="text-[11px] font-[900] text-[#366480] uppercase tracking-tight">{orden.obra_nombre}</span></td>
                                                    <td className="px-8 py-5 text-right"><span className="font-[900] text-[13px] text-[#2c3434] tabular-nums tracking-tighter">{orden.moneda === 'PEN' ? 'S/' : '$'} {Number(orden.monto_total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span></td>
                                                    <td className="px-8 py-5">{getStatusBadge(orden.estado)}</td>
                                                    <td className="px-8 py-5 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button onClick={() => handleOpenModal(orden, 'VIEW')} className="w-8 h-8 rounded-full bg-[#f8faf9] text-[#8b9ba5] group-hover:text-[#366480] hover:bg-[#e8eded] flex items-center justify-center transition-all" title="Ver Detalles"><Eye className="w-4 h-4" /></button>
                                                            {orden.estado === 'enviado' && (
                                                                <button onClick={() => handleOpenModal(orden, 'EDIT')} className="w-8 h-8 rounded-full bg-[#f8faf9] text-[#8b9ba5] group-hover:text-[#366480] hover:bg-[#e8eded] flex items-center justify-center transition-all" title="Editar Requerimiento"><Pencil className="w-4 h-4" /></button>
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
