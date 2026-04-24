import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList, Legend } from 'recharts';
import { api } from '../../services/api';
import type { Project } from '../../services/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Modal from '../../components/Modal';

const Skeleton = ({ className }: { className?: string }) => (
    <div className={`animate-pulse bg-slate-200 dark:bg-slate-700/50 rounded-xl ${className || ''}`} />
);

const SkeletonKPI = () => (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm animate-pulse">
        <div className="size-10 rounded-2xl bg-slate-100 dark:bg-slate-800 mb-4" />
        <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded mb-2" />
        <div className="h-8 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
    </div>
);

const SkeletonRow = () => (
    <tr className="animate-pulse">
        <td className="px-6 py-4"><div className="h-4 w-12 bg-slate-100 dark:bg-slate-800 rounded" /></td>
        <td className="px-6 py-4">
            <div className="flex flex-col gap-2">
                <div className="h-4 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="h-3 w-48 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
        </td>
        <td className="px-6 py-4"><div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded" /></td>
        <td className="px-6 py-4"><div className="h-5 w-16 bg-slate-100 dark:bg-slate-800 rounded-full" /></td>
        <td className="px-6 py-4"><div className="h-4 w-24 ml-auto bg-slate-100 dark:bg-slate-800 rounded" /></td>
        <td className="px-6 py-4"><div className="h-8 w-16 ml-auto bg-slate-100 dark:bg-slate-800 rounded-lg" /></td>
    </tr>
);

const PresupuestadorDashboard = () => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [fontsLoaded, setFontsLoaded] = useState(false);
    const [filter, setFilter] = useState<'ALL' | 'POR_APROBAR' | 'SEGUIMIENTO'>('ALL');
    const [mounted, setMounted] = useState(false);
    
    // Custom Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        action: () => Promise<void>;
        type: 'warning' | 'info' | 'danger';
    }>({
        isOpen: false,
        title: '',
        message: '',
        action: async () => {},
        type: 'info'
    });

    useEffect(() => {
        if ('fonts' in document) {
            document.fonts.ready.then(() => setFontsLoaded(true));
        } else {
            setFontsLoaded(true);
        }
        setProjects([]); 
        loadProjects();
        setMounted(true);
    }, []);

    const loadProjects = async () => {
        try {
            const data = await api.getProjects();
            // Sort by created_at desc
            const sorted = data.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
            setProjects(sorted);
        } catch (error) {
            console.error('Error loading projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmModal({
            isOpen: true,
            title: 'Eliminar Presupuesto',
            message: '¿Estás completamente seguro de esta acción? Se eliminará el registro de dicho presupuesto de forma permanente.',
            type: 'danger',
            action: async () => {
                try {
                    await api.deleteProject(id);
                    loadProjects();
                } catch (error) {
                    console.error('Error deleting project:', error);
                    alert('Hubo un error al eliminar el proyecto');
                }
            }
        });
    };

    const handleApprove = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmModal({
            isOpen: true,
            title: 'Aprobar Presupuesto',
            message: '¿Estás seguro de aprobar este presupuesto? Pasará a estado INICIO y será visible en el Control Operativo.',
            type: 'info',
            action: async () => {
                try {
                    await api.updateProject(id, { status: 'INICIO' });
                    loadProjects();
                } catch (error) {
                    console.error('Error approving project:', error);
                    alert('Hubo un error al aprobar el proyecto');
                }
            }
        });
    };

    // Calculate KPIs
    const totalBudget = projects.reduce((sum, p) => sum + (Number(p.budget_total) || 0), 0);
    const activeProjects = projects.filter(p => p.status === 'EN_EJECUCION' || p.status === 'INICIO').length;

    // Funnel Data
    const statusCounts = {
        borrador: projects.filter(p => p.status === 'BORRADOR').length,
        enviado: projects.filter(p => p.status === 'ENVIADO' || p.status === 'POR APROBAR').length,
        aprobado: projects.filter(p => p.status === 'APROBADO' || p.status === 'INICIO' || p.status === 'EN_EJECUCION').length
    };

    const funnelData = [
        { value: statusCounts.borrador || 0, name: 'Borradores', fill: '#94a3b8' },
        { value: statusCounts.enviado || 0, name: 'Por Aprobar', fill: '#3b82f6' },
        { value: statusCounts.aprobado || 0, name: 'Aprobados', fill: '#10b981' },
    ].filter(d => d.value > 0);

    // Cost Breakdown Logic
    const costBreakdown = projects.reduce((acc, project) => {
        try {
            // Prioritize metadata (new format), fallback to observations (legacy)
            let ops = project.metadata?.operations;

            if (!ops && project.observations) {
                try {
                    const obs = JSON.parse(project.observations);
                    ops = obs.operations;
                } catch (e) {
                    // Observations might be plain text now, so JSON.parse will fail safely
                }
            }

            ops = ops || {};

            // Accumulate costs
            acc[0].value += ops.laborCost || 0; // Labor
            acc[1].value += ops.machineryCost || 0; // Machinery
            acc[2].value += (ops.siteLogisticsCost || 0) + (ops.supplierLogisticsCost || 0) + (ops.freightCost || 0); // Logistics
            acc[3].value += ops.servicesCost || 0; // Services
        } catch (e) { /* ignore */ }
        return acc;
    }, [
        { name: 'Mano de Obra', value: 0, color: '#3b82f6' },
        { name: 'Maquinaria', value: 0, color: '#6366f1' },
        { name: 'Logística', value: 0, color: '#10b981' },
        { name: 'Servicios', value: 0, color: '#8b5cf6' },
    ]);

    // Filtering Logic
    const filteredProjects = projects.filter(p => {
        if (filter === 'ALL') return true;
        if (filter === 'POR_APROBAR') return p.status === 'POR APROBAR' || p.status === 'ENVIADO';
        if (filter === 'SEGUIMIENTO') return p.status === 'EN_EJECUCION' || p.status === 'INICIO';
        return true;
    });

    return (
        <div className="flex flex-col gap-6">
            {/* Header section */}
            <header className="flex items-center justify-between">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
                        <span>ERP</span>
                        <span className="material-symbols-outlined text-[10px]">chevron_right</span>
                        <span className="text-[#463acb] dark:text-[#6366f1]">Resumen</span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Resumen General</h2>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative w-80">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
                        <input 
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#463acb]/20 dark:text-white placeholder:text-slate-500 transition-all" 
                            placeholder="Buscar presupuestos..." 
                            type="text" 
                            disabled={loading}
                        />
                    </div>
                    <button className="relative size-10 flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        {loading ? (
                            <div className="size-4 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-full" />
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">notifications</span>
                                <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-800"></span>
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => navigate('nuevo')}
                        disabled={loading}
                        className={`flex items-center gap-2 px-4 py-2 bg-[#463acb] text-white rounded-xl text-sm font-semibold hover:bg-[#372da0] transition-all shadow-lg shadow-indigo-500/20 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {loading ? (
                             <div className="w-4 h-4 bg-white/20 animate-pulse rounded-full" />
                        ) : (
                            <span className="material-symbols-outlined text-[20px]">add</span>
                        )}
                        <span>Nuevo Registro</span>
                    </button>
                </div>
            </header>
            
            <div className={`flex flex-col gap-6 transition-all duration-700 ${(loading || !fontsLoaded) ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'}`}>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:grid-cols-2 md:grid-cols-4">
                {loading ? (
                    <>
                        <SkeletonKPI />
                        <SkeletonKPI />
                        <SkeletonKPI />
                        <SkeletonKPI />
                    </>
                ) : (
                    <>
                        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm col-span-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="size-10 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                    <span className="material-symbols-outlined">payments</span>
                                </div>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Presupuestado Total</p>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">S/ {totalBudget.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
                            <p className="text-[10px] text-slate-400 mt-2 font-medium italic">En {projects.length} proyectos</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex justify-between items-start mb-4">
                                <div className="size-10 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                    <span className="material-symbols-outlined">precision_manufacturing</span>
                                </div>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Proyectos Activos</p>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{activeProjects}</h3>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm opacity-50">
                            <div className="flex justify-between items-start mb-4">
                                <div className="size-10 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                    <span className="material-symbols-outlined">inventory</span>
                                </div>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Stock de Inventario</p>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">--</h3>
                            <p className="text-[10px] text-slate-400 mt-2 font-medium">No conectado a ERP</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm opacity-50">
                            <div className="flex justify-between items-start mb-4">
                                <div className="size-10 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                    <span className="material-symbols-outlined">savings</span>
                                </div>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Flujo de Caja</p>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">--</h3>
                            <p className="text-[10px] text-slate-400 mt-2 font-medium">No conectado a ERP</p>
                        </div>
                    </>
                )}
            </div>

            {/* Main Data Display Area */}
            <div className="grid grid-cols-1 gap-6">
                {/* High Density Activity List */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col min-h-[500px]">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <div className="flex gap-6">
                            <button
                                onClick={() => setFilter('ALL')}
                                className={`text-sm font-bold pb-1 transition-colors ${filter === 'ALL' ? 'text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                Recientes
                            </button>
                            <button
                                onClick={() => setFilter('SEGUIMIENTO')}
                                className={`text-sm font-bold pb-1 transition-colors ${filter === 'SEGUIMIENTO' ? 'text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                Seguimiento
                            </button>
                            <button
                                onClick={() => setFilter('POR_APROBAR')}
                                className={`text-sm font-bold pb-1 transition-colors ${filter === 'POR_APROBAR' ? 'text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                Por Aprobar
                            </button>
                        </div>
                        <button className="text-[#463acb] dark:text-[#6366f1] text-xs font-bold hover:underline">Ver Historial Completo</button>
                    </div>

                    <div className="overflow-x-auto custom-scrollbar flex-1">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 font-bold uppercase text-[10px] tracking-wider sticky top-0">
                                <tr>
                                    <th className="px-6 py-4">Presupuesto</th>
                                    <th className="px-6 py-4">Cliente / Proyecto</th>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Estado</th>
                                    <th className="px-6 py-4 text-right">Monto</th>
                                    <th className="px-6 py-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {loading ? (
                                    <>
                                        <SkeletonRow />
                                        <SkeletonRow />
                                        <SkeletonRow />
                                        <SkeletonRow />
                                        <SkeletonRow />
                                    </>
                                ) : filteredProjects.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No hay proyectos registrados en esta categoría.</td></tr>
                                ) : (
                                    filteredProjects.map(project => (
                                        <tr key={project.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer" onClick={() => navigate(`/presupuestador/editar/${project.id}`)}>
                                            <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200">#{project.project_number}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900 dark:text-white">{project.client_name}</span>
                                                    <span className="text-xs text-slate-500 dark:text-slate-400">{project.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                                                {project.created_at ? format(new Date(project.created_at), 'dd MMM, HH:mm', { locale: es }) : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold border 
                                                    ${project.status === 'BORRADOR' ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700' :
                                                        project.status === 'ENVIADO' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30' :
                                                            project.status === 'POR APROBAR' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30' :
                                                                project.status === 'APROBADO' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30' :
                                                                    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                                                    {project.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">
                                                S/ {Number(project.budget_total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2 text-slate-400">
                                                     <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
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

        </div>

            {/* Modal de Confirmación Moderno */}
            <Modal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}>
                <div className="p-6 flex flex-col items-center text-center">
                    <div className={`size-16 rounded-full flex items-center justify-center mb-4 ${
                        confirmModal.type === 'danger' ? 'bg-rose-50 text-rose-600' : 
                        confirmModal.type === 'warning' ? 'bg-amber-50 text-amber-600' : 
                        'bg-blue-50 text-blue-600'
                    }`}>
                        <span className="material-symbols-outlined text-4xl">
                            {confirmModal.type === 'danger' ? 'delete_forever' : 
                             confirmModal.type === 'warning' ? 'warning' : 'info'}
                        </span>
                    </div>
                    
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{confirmModal.title}</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed">
                        {confirmModal.message}
                    </p>

                    <div className="flex items-center gap-3 w-full">
                        <button 
                            onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                            className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={async () => {
                                await confirmModal.action();
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                            }}
                            className={`flex-1 px-4 py-3 text-white rounded-2xl text-sm font-bold transition-all shadow-lg ${
                                confirmModal.type === 'danger' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' : 
                                'bg-[#463acb] hover:bg-[#372da0] shadow-indigo-500/20'
                            }`}
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default PresupuestadorDashboard;
