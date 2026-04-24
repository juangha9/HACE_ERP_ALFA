import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { Project, ProjectItem } from '../services/types';
import { CreateItemModal } from '../components/CreateItemModal';
import { EditProjectModal } from '../components/EditProjectModal';
import { FinancialModal } from '../components/FinancialModal';
import { BreakdownItemsModal } from '../components/BreakdownItemsModal';

export function ProjectDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [project, setProject] = useState<Project | null>(null);
    const [items, setItems] = useState<ProjectItem[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [loadingFonts, setLoadingFonts] = useState(true);
    // const [historicalUtility, setHistoricalUtility] = useState(14.2);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
    const [isFinancialOpen, setIsFinancialOpen] = useState(false);
    const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
    const [selectedBreakdown, setSelectedBreakdown] = useState<{ label: string, items: { principal: ProjectItem[], interno: ProjectItem[] } } | null>(null);
    const [editMode, setEditMode] = useState<'dates' | 'status' | 'observations'>('dates');
    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [tempBudget, setTempBudget] = useState<number>(0);

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    const loadData = async () => {
        try {
            const [projects, projectItems] = await Promise.all([
                api.getProjects(),
                api.getItems(id!)
            ]);
            const currentProject = projects.find(p => p.id === id);
            if (currentProject) {
                setProject(currentProject);
                setTempBudget(currentProject.budget_total);
                setItems(projectItems);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingData(false);
        }
    };

    const handleUpdateBudget = async () => {
        if (!project) return;
        try {
            const updated = await api.updateProject(project.id, { budget_total: tempBudget });
            setProject(updated);
            setIsEditingBudget(false);
        } catch (err) {
            alert('Error updating budget: ' + (err as Error).message);
        }
    };

    const stats = useMemo(() => {
        const breakdown = {
            material: { plan: 0, real: 0, items: { principal: [] as ProjectItem[], interno: [] as ProjectItem[] } },
            labor: { plan: 0, real: 0, items: { principal: [] as ProjectItem[], interno: [] as ProjectItem[] } },
            mobility: { plan: 0, real: 0, items: { principal: [] as ProjectItem[], interno: [] as ProjectItem[] } },
            externo: { plan: 0, real: 0, items: [] as ProjectItem[] }
        };

        items.forEach(it => {
            const isLaborOrMobility = it.category.includes('MANO_OBRA') || it.category.includes('MOVILIDAD');
            const isExterno = it.category.startsWith('ADICIONAL_');

            const planQty = (it.planned_qty === 0 && isLaborOrMobility) ? 1 : (it.planned_qty || 0);
            const realQty = (it.real_qty === 0 && isLaborOrMobility) ? 1 : (it.real_qty || 0);

            const plan = planQty * (it.planned_unit_price || 0);
            const real = realQty * (it.real_unit_price || 0);

            if (isExterno) {
                breakdown.externo.plan += plan;
                breakdown.externo.real += real;
                breakdown.externo.items.push(it);
            } else if (it.category.includes('MATERIAL')) {
                breakdown.material.plan += plan;
                breakdown.material.real += real;
                if (it.planned_qty > 0) breakdown.material.items.principal.push(it);
                else breakdown.material.items.interno.push(it);
            } else if (it.category.includes('MANO_OBRA')) {
                breakdown.labor.plan += plan;
                breakdown.labor.real += real;
                if (it.planned_qty > 0) breakdown.labor.items.principal.push(it);
                else breakdown.labor.items.interno.push(it);
            } else if (it.category.includes('MOVILIDAD')) {
                breakdown.mobility.plan += plan;
                breakdown.mobility.real += real;
                if (it.planned_qty > 0) breakdown.mobility.items.principal.push(it);
                else breakdown.mobility.items.interno.push(it);
            }
        });

        const realTotal = breakdown.material.real + breakdown.labor.real + breakdown.mobility.real + breakdown.externo.real;
        const planTotal = breakdown.material.plan + breakdown.labor.plan + breakdown.mobility.plan + breakdown.externo.plan;

        const utilityPlan = (project?.budget_total || 0) - planTotal;
        const utilityPlanPerc = project?.budget_total ? (utilityPlan / project.budget_total) * 100 : 0;

        const utility = (project?.budget_total || 0) - realTotal;
        const utilityPerc = project?.budget_total ? (utility / project.budget_total) * 100 : 0;

        const progress = planTotal > 0 ? (realTotal / planTotal) * 100 : 0;

        // Calculate Delay (GMT-5 logic)
        // ... (rest of delay logic remains same)
        const now = new Date();
        const peruDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Lima" }));
        peruDate.setHours(0, 0, 0, 0);

        let delayDays = 0;
        if (project?.end_date_planned) {
            const plannedEnd = new Date(project.end_date_planned);
            plannedEnd.setHours(0, 0, 0, 0);

            if (peruDate > plannedEnd) {
                const diffTime = Math.abs(peruDate.getTime() - plannedEnd.getTime());
                delayDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        }

        return { breakdown, planTotal, realTotal, utilityPlan, utilityPlanPerc, utility, utilityPerc, progress, delayDays };
    }, [items, project]);

    useEffect(() => {
        if ('fonts' in document) {
            document.fonts.ready.then(() => setLoadingFonts(false));
        } else {
            setLoadingFonts(false);
        }
        // api.getHistoricalUtility().then(setHistoricalUtility);
    }, []);

    /* const utilityTier = useMemo(() => {
        const isFinished = ['FINALIZADO', 'PENDIENTE_COBRO', 'CERRADO'].includes(project?.status || '');
        const p = isFinished ? stats.utilityPerc : stats.utilityPlanPerc;
        const total = isFinished ? stats.realTotal : stats.planTotal;
        const labelText = isFinished ? 'RENDIMIENTO' : 'RENDIMIENTO PROYECTADO';

        let tier = { label: 'ESTABLE', color: '#10b981', textClass: 'text-emerald-500', value: p, heading: labelText, isEmpty: total === 0 };

        if (p < 0) tier = { ...tier, label: 'CRÍTICO', color: '#f43f5e', textClass: 'text-rose-500' };
        else if (p <= 12) tier = { ...tier, label: 'RIESGO', color: '#f59e0b', textClass: 'text-amber-500' };
        else if (p <= 30) tier = { ...tier, label: 'ESTABLE', color: '#10b981', textClass: 'text-emerald-500' };
        else if (p <= 45) tier = { ...tier, label: 'ÓPTIMO', color: '#fbbf24', textClass: 'text-yellow-500' };
        else tier = { ...tier, label: 'SOBRESALIENTE', color: '#4f46e5', textClass: 'text-indigo-600' };

        return tier;
    }, [stats.utilityPerc, stats.utilityPlanPerc, stats.realTotal, stats.planTotal, project?.status]); */

    // Logic moved to Backend View (projects_view)
    // const displayStartDateReal = useMemo(...)

    return (
        <div className="max-w-consolidated w-full space-y-6">
            {(loadingData || loadingFonts) ? (
                <div className="flex items-center justify-center h-[60vh] animate-premium-fade">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-indigo-600"></div>
                </div>
            ) : !project ? (
                <div className="p-8 animate-premium-fade">Proyecto no encontrado.</div>
            ) : (
                <>
                    <div key="content" className="animate-premium-fade">
                        {/* HEADER SECTION (Sticky Header) - Now strictly top-0 with no top gap */}
                    <div className="sticky top-0 z-50 -mx-8 px-8 py-6 bg-[#f8fafc]/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 flex items-center justify-between transition-all">
                        <div className="flex items-center gap-6">
                            <button onClick={() => navigate('/')} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:translate-x-[-2px] transition-all">
                                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-xl">arrow_back</span>
                            </button>
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                                    #{project.project_number} - {project.name}
                                </h2>
                                <p className="text-slate-400 dark:text-slate-500 font-bold text-[11px] tracking-widest uppercase">{project.client_name}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                <span className="text-[9px] font-black uppercase tracking-widest">Sistema Online</span>
                            </div>
                        </div>
                    </div>

                    {/* TOP METRIC CARDS (Compact Grid: 2 columns min, 4 on desktop) */}
                    <div className="grid grid-cols-2 lg-grid-cols-4 gap-4">

                        {/* ECONÓMICO */}
                        <div className="card-consolidated">
                            <div className="flex items-center gap-2 mb-4 text-indigo-600">
                                <span className="material-icons-round text-lg">payments</span>
                                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Económico</span>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Presupuesto Total</p>
                                    {isEditingBudget ? (
                                        <input
                                            type="number"
                                            className="text-xl font-black w-full border-b-2 border-indigo-200 dark:border-indigo-800 bg-transparent dark:text-white focus:outline-none focus:border-indigo-600 transition-colors"
                                            value={tempBudget}
                                            autoFocus
                                            onChange={e => setTempBudget(Number(e.target.value))}
                                            onBlur={handleUpdateBudget}
                                            onKeyDown={e => e.key === 'Enter' && handleUpdateBudget()}
                                        />
                                    ) : (
                                        <p
                                            className="text-xl font-black text-slate-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors group flex items-center gap-2"
                                            onClick={() => setIsEditingBudget(true)}
                                        >
                                            S/ {project.budget_total?.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                            <span className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 text-slate-300 dark:text-slate-600">edit</span>
                                        </p>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 border-t border-slate-50 dark:border-slate-800 pt-3">
                                    {/* COSTOS ROW */}
                                    <div className="mb-4">
                                        <p className="text-slate-400 dark:text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1">Costo Planificado</p>
                                        <p className="text-sm font-black text-slate-600 dark:text-slate-300 leading-none">S/ {stats.planTotal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className="mb-4 border-l border-slate-100 dark:border-slate-800 pl-4">
                                        <p className="text-slate-400 dark:text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1 text-rose-300 dark:text-rose-400/70">Costo Real</p>
                                        <p className="text-sm font-black text-rose-500 dark:text-rose-400 leading-none">S/ {stats.realTotal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
                                    </div>

                                    {/* UTILIDADES ROW */}
                                    <div>
                                        <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest mb-1">Utilidad Planificada</p>
                                        <p className={`text-sm font-black leading-none ${stats.planTotal > 0 ? 'text-indigo-400' : 'text-slate-300'}`}>
                                            {stats.planTotal > 0 ? (
                                                <>
                                                    S/ {stats.utilityPlan.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                                    <span className="text-[8px] ml-1 opacity-70">({stats.utilityPlanPerc.toFixed(1)}%)</span>
                                                </>
                                            ) : '--'}
                                        </p>
                                    </div>
                                    <div className="border-l border-slate-100 pl-4">
                                        <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest mb-1 text-emerald-300">Utilidad Real</p>
                                        <p className={`text-sm font-black leading-none ${stats.realTotal > 0 ? 'text-emerald-500' : 'text-slate-300'}`}>
                                            {stats.realTotal > 0 ? (
                                                <>
                                                    S/ {stats.utility.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                                    <span className="text-[8px] ml-1 opacity-70">({stats.utilityPerc.toFixed(1)}%)</span>
                                                </>
                                            ) : '--'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* FINANCIERO */}
                        {(() => {
                            const pendingBalance = (project.budget_total || 0) - (project.amount_collected || 0);
                            return (
                                <div
                                    className="card-consolidated cursor-pointer hover:border-indigo-200 transition-all hover:shadow-lg hover:shadow-indigo-50 group"
                                    onClick={() => setIsFinancialOpen(true)}
                                >
                                    <div className="flex items-center justify-between mb-4 text-indigo-600">
                                        <div className="flex items-center gap-2">
                                            <span className="material-icons-round text-lg">account_balance</span>
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">Financiero</span>
                                        </div>
                                        <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                            <span className="material-symbols-outlined text-sm">payments</span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Cobrado</p>
                                            <p className="text-lg font-black text-slate-900 dark:text-white">S/ {(project.amount_collected || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                        <div>
                                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${pendingBalance < 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                {pendingBalance < 0 ? 'Sobrante' : 'Por Cobrar'}
                                            </p>
                                            <p className={`text-lg font-black ${pendingBalance < 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                S/ {pendingBalance < 0 ? '+' : ''}{Math.abs(pendingBalance).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1 text-indigo-500 dark:text-indigo-400">Liquidez</p>
                                            <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">S/ {((project.amount_collected || 0) - stats.realTotal).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* PROGRESO */}
                        <div className="card-consolidated">
                            <div className="flex items-center gap-2 mb-4 text-indigo-600">
                                <span className="material-icons-round text-lg">speed</span>
                                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Progreso</span>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <div className="flex items-baseline justify-between mb-2">
                                        <p className="text-slate-400 dark:text-slate-500 text-[9px] font-bold uppercase tracking-widest">Gasto Real vs Plan</p>
                                        <p className="text-xl font-black text-slate-900 dark:text-white">{stats.progress.toFixed(1)}%</p>
                                    </div>
                                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-50 dark:border-slate-800">
                                        <div
                                            className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-1000"
                                            style={{ width: `${Math.min(stats.progress, 100)}% ` }}
                                        ></div>
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <p className="text-slate-400 dark:text-slate-500 text-[9px] font-bold uppercase tracking-widest mb-2">Estado Actual</p>
                                    {(() => {
                                        const styles: Record<string, string> = {
                                            INICIO: 'bg-slate-50 text-slate-600 border-slate-100',
                                            EN_EJECUCION: 'bg-indigo-50 text-indigo-600 border-indigo-100',
                                            FINALIZADO: 'bg-emerald-50 text-emerald-600 border-emerald-100',
                                            PENDIENTE_COBRO: 'bg-rose-50 text-rose-600 border-rose-100 shadow-rose-100',
                                            CERRADO: 'bg-slate-900 text-white border-transparent',
                                            BORRADOR: 'bg-slate-100 text-slate-400 border-slate-200',
                                            ENVIADO: 'bg-blue-50 text-blue-600 border-blue-100',
                                            'POR APROBAR': 'bg-amber-50 text-amber-600 border-amber-100',
                                            APROBADO: 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                        };
                                        const style = styles[project.status] || styles.INICIO;

                                        return (
                                            <button
                                                onClick={() => { setEditMode('status'); setIsEditProjectOpen(true); }}
                                                className={`inline-flex px-4 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm hover:scale-[1.02] transition-all group gap-2 items-center ${style}`}
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                                                {project.status === 'EN_EJECUCION' && 'En Producción / Ejecución'}
                                                {project.status === 'INICIO' && 'Inicio Proyecto'}
                                                {project.status === 'FINALIZADO' && 'Proyecto Finalizado'}
                                                {project.status === 'PENDIENTE_COBRO' && 'MONTO X COBRAR / PROYECTO FINALIZADO'}
                                                {project.status === 'CERRADO' && 'Cerrado'}
                                                {project.status === 'POR APROBAR' && 'Por Aprobar'}
                                                {project.status === 'BORRADOR' && 'Borrador'}
                                                {!['EN_EJECUCION', 'INICIO', 'FINALIZADO', 'PENDIENTE_COBRO', 'CERRADO', 'POR APROBAR', 'BORRADOR', 'APROBADO', 'ENVIADO'].includes(project.status) && project.status}
                                                <span className="material-symbols-outlined text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ml-1">edit</span>
                                            </button>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* TIEMPOS */}
                        <div className="card-consolidated">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2 text-indigo-600">
                                    <span className="material-icons-round text-lg">history_toggle_off</span>
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">Tiempos</span>
                                </div>
                                <button
                                    onClick={() => { setEditMode('dates'); setIsEditProjectOpen(true); }}
                                    className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-300 hover:text-indigo-600 transition-all border border-transparent hover:border-slate-100"
                                >
                                    <span className="material-symbols-outlined text-sm">edit</span>
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-y-4 gap-x-3">
                                <div>
                                    <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest mb-1">Inicio Plan.</p>
                                    <p className="text-xs font-black text-slate-800">
                                        {project.start_date_planned ? new Date(project.start_date_planned + 'T00:00:00').toLocaleDateString() : '-- / --'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest mb-1">Entrega Plan.</p>
                                    <p className="text-xs font-black text-slate-800">
                                        {project.end_date_planned ? new Date(project.end_date_planned + 'T00:00:00').toLocaleDateString() : '-- / --'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest mb-1 text-slate-300">Inicio Real</p>
                                    <p className="text-[10px] font-black text-slate-400">{project.start_date_real ? new Date(project.start_date_real + 'T00:00:00').toLocaleDateString() : '-- / --'}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest mb-1 text-slate-300">Entrega Real</p>
                                    <p className="text-[10px] font-black text-slate-400">{project.end_date_real ? new Date(project.end_date_real + 'T00:00:00').toLocaleDateString() : '-- / --'}</p>
                                </div>
                                <div className="col-span-2 pt-2 flex items-center justify-between border-t border-slate-50 mt-1">
                                    <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">Retraso</p>
                                    <div className="text-right">
                                        <span className={`text-xl font-black leading-none ${stats.delayDays > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                            {stats.delayDays > 0 ? `+${stats.delayDays}` : '0'}
                                        </span>
                                        <span className={`text-[9px] font-black italic ml-1 ${stats.delayDays > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                            Días
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg-grid-cols-12 gap-4">

                        {/* DESGLOSE OPERATIVO CHART (Using robust col-span classes) */}
                        <div className="lg-col-span-8 bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-slate-900/40">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight italic uppercase">Desglose Operativo</h3>
                                    <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold tracking-widest mt-1 uppercase">Comparativa Planificado vs Ejecutado Real</p>
                                </div>
                                <div className="flex flex-col items-end gap-3">
                                    <button
                                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black shadow-lg shadow-indigo-100 transition-all active:scale-95 group"
                                        onClick={() => setIsModalOpen(true)}
                                    >
                                        <span className="material-icons-round text-sm group-hover:rotate-12 transition-transform">edit_note</span>
                                        GESTIÓN MASIVA
                                    </button>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-300 rounded"></div><span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Plan</span></div>
                                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-600 rounded"></div><span className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Real</span></div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-4">
                                    {[
                                        { id: 'material', label: 'Materiales', data: stats.breakdown.material, items: stats.breakdown.material.items },
                                        { id: 'labor', label: 'Mano de Obra', data: stats.breakdown.labor, items: stats.breakdown.labor.items },
                                        { id: 'mobility', label: 'Movilidad', data: stats.breakdown.mobility, items: stats.breakdown.mobility.items },
                                        { id: 'externo', label: 'Adicionales Externos', data: stats.breakdown.externo, items: { principal: stats.breakdown.externo.items, interno: [] } }
                                    ].map((cat) => {
                                        const maxVal = Math.max(cat.data.plan, cat.data.real, 100);
                                        const planPerc = (cat.data.plan / maxVal) * 100;
                                        const realPerc = (cat.data.real / maxVal) * 100;
                                        const isExceeded = cat.data.real > cat.data.plan && cat.data.plan > 0;

                                        return (
                                            <div
                                                key={cat.id}
                                                className="bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl p-5 border border-slate-50 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900 hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer group"
                                                onClick={() => {
                                                    setSelectedBreakdown({ label: cat.label, items: cat.items });
                                                    setIsBreakdownOpen(true);
                                                }}
                                            >
                                                <div className="flex justify-between items-center mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-700 border border-slate-100 dark:border-slate-600 flex items-center justify-center text-slate-400 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:border-indigo-100 dark:group-hover:border-indigo-900 transition-all shadow-sm">
                                                            <span className="material-symbols-outlined text-sm">visibility</span>
                                                        </div>
                                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{cat.label}</p>
                                                    </div>
                                                    <p className={`text-[10px] font-black ${isExceeded ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                                        S/ {cat.data.plan.toLocaleString('es-PE', { minimumFractionDigits: 1 })} vs S/ {cat.data.real.toLocaleString('es-PE', { minimumFractionDigits: 1 })}
                                                        {isExceeded && <span className="ml-2 text-rose-400 font-bold">(Excedido)</span>}
                                                    </p>
                                                </div>

                                                <div className="space-y-2.5">
                                                    <div className="relative h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                        <div className="absolute top-0 left-0 h-full bg-slate-200 dark:bg-slate-500 transition-all duration-700" style={{ width: `${planPerc}%` }}></div>
                                                    </div>
                                                    <div className="relative h-2.5 bg-white dark:bg-slate-900 rounded-full overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm">
                                                        <div
                                                            className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ${isExceeded ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]' : 'bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.3)]'}`}
                                                            style={{ width: `${realPerc}%` }}
                                                        ></div>
                                                    </div>
                                                </div>

                                                <div className="mt-3 flex justify-end">
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors">Hacer clic para ver detalle →</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* MARGEN DE UTILIDAD */}
                        <div className="lg:col-span-4 space-y-4">
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-slate-900/40">
                                <div className="flex items-center justify-between mb-8">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight italic uppercase">Margen de Utilidad</h3>
                                        <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold tracking-widest mt-1 uppercase">Rentabilidad del Proyecto</p>
                                    </div>
                                    <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                        <span className="material-icons-round">payments</span>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Utilidad Planificada</p>
                                            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">S/ {stats.utilityPlan.toLocaleString('es-PE')}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-black text-slate-400 dark:text-slate-500 italic">{stats.utilityPlanPerc.toFixed(1)}%</span>
                                        </div>
                                    </div>

                                    <div className="h-px bg-slate-50 dark:bg-slate-800"></div>

                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Utilidad Real Actual</p>
                                            <p className={`text-2xl font-black mt-1 ${stats.utility >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                                                S/ {stats.utility.toLocaleString('es-PE')}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-sm font-black italic ${stats.utility >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                                                {stats.utilityPerc.toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-10 pt-8 border-t border-slate-50 flex justify-center">
                                    <div className="relative w-48 h-24 overflow-hidden">
                                        <div className="absolute top-0 left-0 w-48 h-48 rounded-full border-[16px] border-slate-100"></div>
                                        <div
                                            className={`absolute top-0 left-0 w-48 h-48 rounded-full border-[16px] transition-all duration-1000 ${stats.utilityPerc > 0 ? 'border-indigo-600' : 'border-rose-500'}`}
                                            style={{
                                                clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
                                                transform: `rotate(${(stats.utilityPerc / 100) * 180 - 180}deg)`
                                            }}
                                        ></div>
                                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center pb-2">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Margen</p>
                                            <p className={`text-xl font-black ${stats.utilityPerc > 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{stats.utilityPerc.toFixed(0)}%</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* OBSERVATIONS CARD */}
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-slate-900/40 overflow-hidden relative group">
                                <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-full blur-3xl group-hover:bg-indigo-100/20 dark:group-hover:bg-indigo-900/20 transition-all duration-700"></div>
                                <div className="relative">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400">
                                            <span className="material-icons-round">notes</span>
                                            <h3 className="text-sm font-black tracking-widest uppercase italic">Observaciones</h3>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setEditMode('observations');
                                                setIsEditProjectOpen(true);
                                            }}
                                            className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                                        >
                                            Editar
                                        </button>
                                    </div>
                                    <div className="bg-slate-50/50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-50 dark:border-slate-800">
                                        <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 leading-relaxed italic">
                                            {project?.observations || "Sin observaciones adicionales registrados para este proyecto."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                    </div>
                </div>

                <CreateItemModal
                    isOpen={isModalOpen}
                    projectId={id!}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={loadData}
                />

                    {project && (
                        <EditProjectModal
                            isOpen={isEditProjectOpen}
                            project={project}
                            mode={editMode}
                            onClose={() => setIsEditProjectOpen(false)}
                            onSuccess={loadData}
                        />
                    )}
                    {project && (
                        <FinancialModal
                            isOpen={isFinancialOpen}
                            project={project}
                            onClose={() => setIsFinancialOpen(false)}
                            onSuccess={loadData}
                        />
                    )}
                </div>

                {/* Breakdown Modals */}
                {isBreakdownOpen && selectedBreakdown && (
                    <BreakdownItemsModal
                        isOpen={isBreakdownOpen}
                        onClose={() => setIsBreakdownOpen(false)}
                        categoryLabel={selectedBreakdown.label}
                        items={selectedBreakdown.items}
                    />
                )}
                </>
            )}
        </div>
    );
}
