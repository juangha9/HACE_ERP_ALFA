import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { API_URL } from '../../services/apiConfig';
import type { OptimizationFlow, Project } from '../../services/types';
import { 
  RefreshCw, 
  ChevronDown, 
  Search
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { RangeDatePicker } from '../../components/RangeDatePicker';
import { Calendar } from 'lucide-react';

import { createPortal } from 'react-dom';
import { SettingsModal } from './components/SettingsModal';
import type { OptimizationConfig } from './types';

export const ProjectsList = () => {
    const [projects, setProjects] = useState<OptimizationFlow[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isBoardsOpen, setIsBoardsOpen] = useState(false);
    const [boardsCustom, setBoardsCustom] = useState<{id: string, label: string, w: number, h: number, number?: number, name: string, veta: boolean}[]>([]);
    // Config "stub" para que el modal pueda funcionar fuera del flujo de
    // optimización. El usuario solo edita tableros desde aquí; los demás
    // campos del config no se muestran (boardsOnly=true).
    const [boardsStubConfig, setBoardsStubConfig] = useState<OptimizationConfig>({
        sawKerf: 3,
        trimming: { top: 10, bottom: 10, left: 10, right: 10 },
        strategy: 'SIMPLE_CUTS',
        cutDirection: 'OPTIMAL',
        boardWidth: 2440,
        boardHeight: 1830,
        grainDirection: 'HORIZONTAL',
        preFresado: 0,
        material: '',
        edgeThickness1: 0.4,
        edgeThickness2: 2,
        clientName: '',
        workOrder: '',
        labelInfo: ''
    });
    const navigate = useNavigate();
    const [showDatePicker, setShowDatePicker] = useState(false);
    const datePickerRef = useRef<HTMLDivElement>(null);

    // Refrescar el catálogo cada vez que se abre el modal de Tableros para que
    // muestre cualquier cambio hecho desde otra parte del ERP.
    useEffect(() => {
        if (!isBoardsOpen) return;
        api.getCustomBoards().then(setBoardsCustom).catch(() => {});
    }, [isBoardsOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
                setShowDatePicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState<'TODOS' | 'BORRADOR' | 'LISTO_CORTE'>('TODOS');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [tempStartDate, setTempStartDate] = useState<string>('');
    const [tempEndDate, setTempEndDate] = useState<string>('');
    const [mainQuickFilter, setMainQuickFilter] = useState<'ESTA_SEMANA' | 'ULTIMOS_7' | 'HOY' | 'MES_ACTUAL' | 'PERSONALIZADO'>('ULTIMOS_7');

    // Initialize default date range (Last 7 days)
    useEffect(() => {
        const now = new Date();
        const start = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
        const end = format(now, 'yyyy-MM-dd');
        setStartDate(start);
        setEndDate(end);
        setTempStartDate(start);
        setTempEndDate(end);
    }, []);

    useEffect(() => {
        const scrollContainer = document.querySelector('.main-scroll-container') as HTMLElement;
        if (isModalOpen) {
            if (scrollContainer) scrollContainer.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
        } else {
            if (scrollContainer) scrollContainer.style.overflow = 'auto';
            document.body.style.overflow = 'auto';
        }
        return () => {
            if (scrollContainer) scrollContainer.style.overflow = 'auto';
            document.body.style.overflow = 'auto';
        };
    }, [isModalOpen]);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const data = await api.getOptimizations();
            
            // Filter to only show the latest version of each unique sale code
            const uniqueMap = new Map<string, OptimizationFlow>();
            
            data.forEach((item) => {
                // Get the base SKU without the version suffix (e.g. VTA-XXXX-V1 -> VTA-XXXX)
                const baseCode = (item.code || '').split('-V')[0];
                const version = item.data?.version || 1;
                
                if (!uniqueMap.has(baseCode) || (uniqueMap.get(baseCode)?.data?.version || 0) < version) {
                    uniqueMap.set(baseCode, item);
                }
            });
            
            setProjects(Array.from(uniqueMap.values()).sort((a, b) => 
                new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
            ));
        } catch (error) {
            console.error("Error fetching optimizations", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, []);

    const filteredProjects = React.useMemo(() => {
        return projects.filter(p => {
            // Search term filter
            const term = searchTerm.toLowerCase();
            const matchesSearch = !term || 
                (p.data?.projectName || '').toLowerCase().includes(term) ||
                (p.data?.config?.clientName || '').toLowerCase().includes(term) ||
                (p.code || '').toLowerCase().includes(term);
            
            if (!matchesSearch) return false;

            // Status filter
            if (filterEstado !== 'TODOS') {
                if (p.status !== filterEstado) return false;
            }

            // Date filter
            if (startDate && endDate && p.created_at) {
                const projectDate = format(new Date(p.created_at), 'yyyy-MM-dd');
                if (projectDate < startDate || projectDate > endDate) return false;
            }
            
            return true;
        });
    }, [projects, searchTerm, filterEstado, startDate, endDate]);

    const handleCreateProject = async (projectData: any) => {
        if (isCreating) return;
        setIsCreating(true);
        try {
            const payload = {
                code: projectData.code,
                origin_type: projectData.isProject ? 'PROYECTO' : 'VENTA_DIRECTA',
                project_id: projectData.isProject ? projectData.projectId : null,
                status: 'BORRADOR',
                data: {
                    projectName: projectData.name,
                    version: 1,
                    config: {
                        clientName: projectData.client,
                        observations: projectData.observations,
                        workOrder: projectData.code.replace('VTA-', 'OT-') + '-V1',
                        sawKerf: 4,
                        trimming: { top: 10, bottom: 10, left: 10, right: 10 },
                        strategy: 'MAX_SAVINGS',
                        cutDirection: 'OPTIMAL',
                        boardWidth: 2800,
                        boardHeight: 2140,
                        grainDirection: 'HORIZONTAL',
                        preFresado: 0,
                        material: 'MDF 18mm',
                        edgeThickness1: 1,
                        edgeThickness2: 2,
                        labelInfo: 'Info estándar'
                    },
                    pieces: [],
                    boards: []
                }
            };

            const res = await fetch(`${API_URL}/optimizations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error(await res.text());
            const newProject = await res.json();
            
            setIsModalOpen(false);
            // Navigate to Optimizer for this project
            navigate(`/optimizacion/editor/${newProject.id}`);
        } catch (error) {
            console.error("Error creating optimization", error);
            // Re-enable creation on error
            setIsCreating(false);
            alert("Ocurrió un error al intentar crear el proyecto. Por favor, intente de nuevo.");
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-10 animate-premium-fade">
            <header className="flex justify-between items-center bg-white/70 backdrop-blur-md p-8 rounded-[24px] shadow-premium border border-white/40">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="material-icons-round text-[#4A90E2] text-[32px]">layers</span>
                        <h1 className="text-3xl font-[800] text-[#2c3434] tracking-tight uppercase">Optimizaciones</h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsBoardsOpen(true)}
                        className="flex items-center gap-2 px-6 py-4 bg-white hover:bg-[#f0f5f4] text-[#366480] font-bold rounded-[12px] transition-all shadow-sm border border-[#d3dcdb]/40 active:scale-95"
                    >
                        <span className="material-icons-round">dashboard</span>
                        Tableros
                    </button>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 px-8 py-4 bg-[#4A90E2] hover:bg-[#357ABD] text-white font-bold rounded-[12px] transition-all shadow-lg shadow-blue-500/20 active:scale-95 group"
                    >
                        <span className="material-icons-round group-hover:rotate-90 transition-transform">add</span>
                        Nueva Venta
                    </button>
                </div>
            </header>

            {isBoardsOpen && (
                <SettingsModal
                    isOpen={isBoardsOpen}
                    onClose={() => setIsBoardsOpen(false)}
                    config={boardsStubConfig}
                    setConfig={setBoardsStubConfig}
                    viewMode={'COMMANDS'}
                    setViewMode={() => {}}
                    initialCustomBoards={boardsCustom}
                    boardsOnly
                />
            )}

            {/* RELOCATED FILTER BAR: From SalesTreasury Interface */}
            <div className="relative z-[60] bg-white/70 backdrop-blur-md rounded-[24px] border border-white/40 shadow-premium">
                <div className="p-6 pb-6 flex flex-wrap items-center gap-4 shrink-0 bg-transparent">
                    <div className="relative flex-1 min-w-[300px]">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b9ba5]" />
                        <input
                            placeholder="Buscar registro..."
                            className="w-full pl-12 pr-6 py-3 bg-[#f8faf9] border-none rounded-full text-[12px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#8b9ba5]"
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <select
                                className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
                                value={filterEstado}
                                onChange={(e) => setFilterEstado(e.target.value as any)}
                            >
                                <option value="TODOS">Todos</option>
                                <option value="BORRADOR">Borrador</option>
                                <option value="LISTO_CORTE">Listo Corte</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                        </div>
                        <div className="relative group">
                            <select
                                className="bg-[#f8faf9] border-none px-6 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-10 transition-all"
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
                                            end = format(now, 'yyyy-MM-dd');
                                        } else if (val === 'ULTIMOS_7') {
                                            start = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
                                            end = format(now, 'yyyy-MM-dd');
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
                            onClick={() => fetchProjects()}
                            className="p-3 bg-[#f8faf9] text-[#366480] rounded-xl hover:bg-[#e8eded] transition-all"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {loading ? (
                    Array(8).fill(0).map((_, i) => (
                        <div key={i} className="h-48 bg-white/50 animate-pulse rounded-[24px] border border-[#d3dcdb]/20"></div>
                    ))
                ) : filteredProjects.length === 0 ? (
                    <div className="col-span-full py-24 text-center bg-white/50 backdrop-blur-sm rounded-[32px] border-2 border-dashed border-[#d3dcdb]/40">
                        <div className="w-20 h-20 bg-[#f0f5f4] rounded-3xl flex items-center justify-center mx-auto mb-6 text-[#4A90E2]">
                            <span className="material-icons-round text-4xl">inventory_2</span>
                        </div>
                        <h3 className="text-2xl font-[800] text-[#2c3434]">No se encontraron proyectos</h3>
                        <p className="text-[#366480] text-sm mt-2 font-medium">Ajusta los filtros o crea una nueva venta.</p>
                    </div>
                ) : (
                    filteredProjects.map((project) => (
                        <ProjectCard 
                            key={project.id} 
                            project={project} 
                            onClick={() => navigate(`/optimizacion/editor/${project.id}`)}
                        />
                    ))
                )}
            </div>

            {isModalOpen && (
                <NewProjectModal 
                    isOpen={isModalOpen} 
                    onClose={() => setIsModalOpen(false)} 
                    onSubmit={handleCreateProject}
                    isCreating={isCreating}
                />
            )}
        </div>
    );
};

const ProjectCard = ({ project, onClick }: { project: OptimizationFlow, onClick: () => void }) => {
    return (
        <div 
            onClick={onClick}
            className="group relative bg-white border border-[#d3dcdb]/20 p-5 rounded-[20px] hover:border-[#4A90E2] transition-all cursor-pointer shadow-premium hover:shadow-[0_20px_50px_rgba(44,52,52,0.1)] hover:-translate-y-1"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col gap-1">
                    <span className="px-2 py-1 bg-[#f0f5f4] text-[#366480] text-[9px] font-[800] rounded-[6px] uppercase tracking-wider w-fit border border-[#d3dcdb]/30">
                        {project.code?.split('-V')[0] || 'N/A'}
                    </span>
                    {project.data?.version && (
                        <div className="flex items-center gap-1.5 pl-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#dcfce7]"></div>
                            <span className="text-[8px] font-black text-[#366480]/60 uppercase tracking-widest">V{project.data.version}</span>
                        </div>
                    )}
                </div>
                <span className={`px-2 py-1 text-[8px] font-black rounded-[6px] border shadow-sm ${
                    project.status === 'BORRADOR' ? 'bg-[#f7faf9] text-[#366480] border-[#d3dcdb]/40' :
                    ['INICIO', 'EN_EJECUCION'].includes(project.status) ? 'bg-[#dcfce7] text-[#2c3434] border-[#dcfce7]' :
                    'bg-[#f7faf9] text-[#366480] border-[#d3dcdb]/40'
                }`}>
                    {project.status === 'BORRADOR' ? 'DRAFT' : 'LISTO CORTE'}
                </span>
            </div>
            
            <h3 className="text-base font-[800] text-[#2c3434] mb-1.5 group-hover:text-[#4A90E2] transition-colors truncate tracking-tight">
                {project.data?.projectName || 'Sin Nombre'}
            </h3>
            <p className="text-[12px] font-medium text-[#366480] mb-4 flex items-center gap-2 opacity-80 truncate">
                <span className="material-icons-round text-[16px] text-[#4A90E2]">account_circle</span>
                {project.data?.config?.clientName || 'Cliente No Especificado'}
            </p>

            <div className="pt-4 border-t border-[#d3dcdb]/10 flex justify-between items-center">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#366480] opacity-60">
                    <span className="material-icons-round text-[14px]">event</span>
                    {new Date(project.created_at || '').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                </div>
                <div className="w-8 h-8 rounded-full bg-[#f0f5f4] group-hover:bg-[#4A90E2] flex items-center justify-center transition-all">
                    <span className="material-icons-round text-[#4A90E2] group-hover:text-white transition-colors text-[16px]">arrow_forward</span>
                </div>
            </div>
        </div>
    );
};

const NewProjectModal = ({ isOpen, onClose, onSubmit, isCreating }: { isOpen: boolean, onClose: () => void, onSubmit: (data: any) => void, isCreating: boolean }) => {
    const [isProject, setIsProject] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState("");
    const [availableProjects, setAvailableProjects] = useState<Project[]>([]);

    const [name, setName] = useState("");
    const [client, setClient] = useState("");
    const [observations, setObservations] = useState("");
    const [code, setCode] = useState("VTA-XXXXXX-XXX");
    const [loadingCode, setLoadingCode] = useState(true);

    useEffect(() => {
        if (isOpen) {
            const initData = async () => {
                setLoadingCode(true);
                try {
                    const [nextCode, projectsData] = await Promise.all([
                        api.generateVentaCode(),
                        api.getProjects()
                    ]);
                    setCode(nextCode);
                    const validStatuses = ['INICIO', 'EN_EJECUCION'];
                    setAvailableProjects(projectsData.filter(p => validStatuses.includes(p.status)));
                } catch (e) {
                    console.error(e);
                } finally {
                    setLoadingCode(false);
                }
            };
            initData();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        let finalName = name;
        let finalClient = client;

        if (isProject) {
            if (!selectedProjectId) return;
            const proj = availableProjects.find(p => p.id === selectedProjectId);
            if (proj) {
                finalName = proj.name;
                finalClient = proj.client_name;
            }
        } else {
            if (!name || !client) return;
        }

        onSubmit({ name: finalName, client: finalClient, observations, code, isProject, projectId: selectedProjectId });
    };

    const isFormValid = isProject ? !!selectedProjectId : (!!name && !!client);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-white/40 backdrop-blur-[16px] animate-premium-fade" style={{ width: '100vw', height: '100vh' }}>
            <div className="bg-[#f8faf9]/95 backdrop-blur-[12px] rounded-[48px] shadow-[0_40px_120px_rgba(0,0,0,0.15)] w-full max-w-xl overflow-hidden transform transition-all border border-white/90 relative p-12">
                {/* Header Section */}
                <div className="flex justify-between items-start mb-10">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-[28px] font-[900] text-[#2c3434] tracking-tight leading-none">
                            Nueva Venta / Proyecto
                        </h3>
                        <p className="text-[10px] font-black text-[#366480]/40 uppercase tracking-[0.2em]">Configure los detalles iniciales</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-[#2c3434] transition-all"
                    >
                        <span className="material-icons-round text-[24px]">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Operation Code */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-[#366480]/50 uppercase tracking-[0.15em] ml-1">Código de Operación</label>
                        <div className="px-6 py-4 bg-[#edf2f1]/80 text-[#3b647d] font-mono font-black text-[15px] rounded-[18px] border-none flex items-center gap-3">
                            <span className="material-icons-round text-[#3b647d]/60 text-[18px]">vpn_key</span>
                            {loadingCode ? <span className="animate-pulse opacity-30 tracking-widest">GENERANDO...</span> : code}
                        </div>
                    </div>

                    {/* Toggle Selector */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-[#366480]/50 uppercase tracking-[0.15em] ml-1">Tipo de Cliente</label>
                        <div className="flex bg-[#edf2f1]/80 p-1 rounded-[18px] w-full">
                            <button 
                                type="button" 
                                onClick={() => setIsProject(false)}
                                className={`flex-1 py-3 text-[11px] font-[900] uppercase tracking-wider rounded-[14px] transition-all ${!isProject ? 'bg-white text-[#3b647d] shadow-sm' : 'text-[#366480]/40 hover:text-[#366480]'}`}
                            >
                                Cliente Particular
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setIsProject(true)}
                                className={`flex-1 py-3 text-[11px] font-[900] uppercase tracking-wider rounded-[14px] transition-all ${isProject ? 'bg-white text-[#3b647d] shadow-sm' : 'text-[#366480]/40 hover:text-[#366480]'}`}
                            >
                                Proyecto / Obra
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {isProject ? (
                            <div className="space-y-3">
                                <label className="block text-[10px] font-black text-[#366480]/50 uppercase tracking-[0.15em] ml-1">Proyecto en Ejecución</label>
                                <div className="relative">
                                    <select 
                                        required
                                        value={selectedProjectId}
                                        onChange={(e) => setSelectedProjectId(e.target.value)}
                                        className="w-full px-6 py-4 bg-white border-none rounded-[18px] text-[13px] font-bold text-[#2c3434] outline-none transition-all appearance-none cursor-pointer shadow-sm shadow-[#366480]/5"
                                    >
                                        <option value="" disabled>Seleccione un proyecto...</option>
                                        {availableProjects.map(p => (
                                            <option key={p.id} value={p.id}>{p.project_number} — {p.name}</option>
                                        ))}
                                    </select>
                                    <span className="material-icons-round absolute right-5 top-1/2 -translate-y-1/2 text-[#366480]/30 pointer-events-none">expand_more</span>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className="block text-[10px] font-black text-[#366480]/50 uppercase tracking-[0.15em] ml-1">Nombre de Venta</label>
                                    <input 
                                        autoFocus
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ej: Cocina Sr. Lopez"
                                        className="w-full px-6 py-4 bg-white border-none rounded-[18px] text-[13px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#366480]/20 shadow-sm shadow-[#366480]/5"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-[10px] font-black text-[#366480]/50 uppercase tracking-[0.15em] ml-1">Cliente</label>
                                    <div className="relative">
                                        <input 
                                            required
                                            value={client}
                                            onChange={(e) => setClient(e.target.value)}
                                            placeholder="Nombre completo"
                                            className="w-full px-6 py-5 bg-white border-none rounded-[18px] text-[13px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#366480]/20 shadow-sm shadow-[#366480]/5"
                                        />
                                        <span className="material-icons-round absolute right-6 top-1/2 -translate-y-1/2 text-[#366480]/20">search</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            <label className="block text-[10px] font-black text-[#366480]/50 uppercase tracking-[0.15em] ml-1">Observaciones</label>
                            <textarea 
                                value={observations}
                                onChange={(e) => setObservations(e.target.value)}
                                rows={3}
                                placeholder="Notas adicionales..."
                                className="w-full px-6 py-5 bg-white border-none rounded-[18px] text-[13px] font-bold text-[#2c3434] outline-none transition-all placeholder:text-[#366480]/20 shadow-sm shadow-[#366480]/5 resize-none"
                            />
                        </div>
                    </div>

                    <div className="pt-6 flex items-center justify-between">
                        <button 
                            type="button"
                            onClick={onClose}
                            className="px-10 py-4 text-[#366480]/60 font-black text-[13px] uppercase tracking-[0.15em] hover:text-[#2c3434] transition-all"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            disabled={!isFormValid || loadingCode || isCreating}
                            className="flex items-center gap-3 px-10 py-5 bg-[#3b647d] text-white font-black rounded-[18px] hover:bg-[#2c4e66] hover:shadow-[0_20px_40px_rgba(59,100,125,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95 text-[12px] uppercase tracking-wider"
                        >
                            <span className={`material-icons-round text-[20px] ${isCreating ? 'animate-spin' : ''}`}>
                                {isCreating ? 'sync' : 'rocket_launch'}
                            </span>
                            {isCreating ? 'CREANDO...' : 'Iniciar Optimización'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};
