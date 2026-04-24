import { useEffect, useState } from 'react';
import { api } from '../../services/api';

export default function InventoryDashboard() {
    const [stats, setStats] = useState({ totalItems: 0, totalValue: 0, todayMoves: 0 });
    const [loading, setLoading] = useState(true);
    const [fontsLoaded, setFontsLoaded] = useState(false);

    useEffect(() => {
        if ('fonts' in document) {
            document.fonts.ready.then(() => setFontsLoaded(true));
        } else {
            setFontsLoaded(true);
        }
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const data = await api.getInventoryStats();
            setStats(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`space-y-6 transition-all duration-700 ${(loading || !fontsLoaded) ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'}`}>
            <header>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Panel de Control</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Visión general del almacén y logística</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* KPI 1 */}
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

                {/* KPI 2: Pending Approvals */}
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

                {/* KPI 3 */}
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

            {/* Recent Activity area */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-wider">Actividad Reciente</h4>
                <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 text-xs italic">
                    Gráfico de actividad en desarrollo...
                </div>
            </div>
        </div>
    );
}
