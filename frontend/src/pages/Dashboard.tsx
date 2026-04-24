
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { Project } from '../services/types';
import { CreateProjectModal } from '../components/CreateProjectModal';

export function Dashboard() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            const data = await api.getProjects();
            // Filter out 'POR APROBAR' and 'BORRADOR' as requested for Control Operativo view
            setProjects(data.filter(p => p.status !== 'POR APROBAR' && p.status !== 'BORRADOR'));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const statusColors: Record<string, string> = {
        'INICIO': 'bg-slate-100 text-slate-700',
        'EN_EJECUCION': 'bg-amber-100/80 text-amber-700 border-amber-200',
        'FINALIZADO': 'bg-emerald-100/80 text-emerald-700 border-emerald-200',
        'PENDIENTE_COBRO': 'bg-rose-100/80 text-rose-700 border-rose-200',
        'CERRADO': 'bg-slate-200/80 text-slate-500 border-slate-300'
    };

    return (
        <div className="space-y-8 pt-8 animate-in fade-in duration-500">

            {/* HEADER SECTION */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight italic uppercase">Control Operativo</h2>
                    <p className="text-slate-400 font-bold text-xs mt-1 tracking-widest uppercase">GÉSTION DE ÓRDENES Y PROYECTOS</p>
                </div>
                <button
                    className="flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-xs font-black shadow-lg shadow-indigo-100 dark:shadow-indigo-900/40 transition-all active:scale-95"
                    onClick={() => setIsModalOpen(true)}
                >
                    <span className="material-symbols-outlined text-sm">add_circle</span>
                    Nueva Orden de Producción
                </button>
            </div>

            {/* QUICK STATS (Consolidated) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-black/40">
                    <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1">Órdenes Totales</p>
                    <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{projects.length}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-black/40">
                    <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1">En Ejecución</p>
                    <p className="text-3xl font-black text-amber-500">{projects.filter(p => p.status === 'EN_EJECUCION').length}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-black/40">
                    <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1">Finalizados</p>
                    <p className="text-3xl font-black text-emerald-500">{projects.filter(p => p.status === 'FINALIZADO').length}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-black/40">
                    <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1">Balance Global</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-2">S/ {projects.reduce((acc, p) => acc + (p.budget_total || 0), 0).toLocaleString()}</p>
                </div>
            </div>

            {/* PROJECTS TABLE (Consolidated) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] overflow-hidden shadow-xl shadow-slate-200/40 dark:shadow-black/40">
                <div className="p-8 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight italic uppercase">Órdenes Activas</h3>
                    <span className="px-4 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-full border border-indigo-100 dark:border-indigo-800">{projects.length} REGISTROS</span>
                </div>

                <div className="overflow-x-auto px-4 pb-4">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em]">
                                <th className="px-6 py-6 font-black">ID Proyecto</th>
                                <th className="px-6 py-6 font-black">Cliente / Detalle</th>
                                <th className="px-6 py-6 font-black">Estado</th>
                                <th className="px-6 py-6 font-black text-right">Presupuesto (S/)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {loading ? (
                                <tr><td colSpan={4} className="text-center py-20 text-slate-300 font-bold">Cargando datos...</td></tr>
                            ) : projects.map((proj) => (
                                <tr
                                    key={proj.id}
                                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-all cursor-pointer group"
                                    onClick={() => navigate(`/projects/${proj.id}`)}
                                >
                                    <td className="px-6 py-6">
                                        <span className="text-sm font-black text-slate-900 dark:text-white leading-none">#{proj.project_number}</span>
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{proj.client_name}</span>
                                            <span className="text-[10px] font-bold text-slate-400 tracking-wider mt-0.5">{proj.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <span className={`px-4 py-1.5 text-[9px] font-black uppercase rounded-full border shadow-sm ${statusColors[proj.status] || 'bg-gray-100 border-gray-200'}`}>
                                            {proj.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-6 text-sm font-black text-right tabular-nums text-slate-900 dark:text-white">
                                        S/ {proj.budget_total?.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                            {!loading && projects.length === 0 && (
                                <tr><td colSpan={4} className="text-center py-20 text-slate-400 font-bold">No hay proyectos activos. ¡Empieza creando uno!</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <CreateProjectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={loadProjects}
            />
        </div>
    );
}
