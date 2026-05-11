import React, { useState, useEffect, useRef, startTransition } from 'react';
import { PieceLabels } from './components/PieceLabels';
import { PrintReport } from './components/PrintReport';
import { useReactToPrint } from 'react-to-print';
import { useParams, useNavigate } from 'react-router-dom';
import { PieceInputPanel, PieceListPanel } from './components/PieceList';
import { api } from '../../services/api';
import { CuttingMap } from './components/CuttingMap';
import { optimizeCuttingMap, safeFallbackPack, prepareEvolution, evolveStep, type Board } from './lib/optimizationAlgorithm';
import { SettingsModal } from './components/SettingsModal';
import { OptimizationHistoryModal } from './components/OptimizationHistoryModal';
import { QuotationModal } from './components/QuotationModal';
import { CommandModeTable } from './components/CommandModeTable';
import type { Piece, OptimizationConfig } from './types';

export const OptimizationLayout = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [pieces, setPieces] = useState<Piece[]>([]);
    const [projectName, setProjectName] = useState("");
    const [loadingFonts, setLoadingFonts] = useState(true);
    const [loadingData, setLoadingData] = useState(true);

    const [boards, setBoards] = useState<Board[]>([]);
    const [aiBrainWeights, setAiBrainWeights] = useState<any>(null); // Inteligencia Global (Meta-aprendizaje)
    const [customBoards, setCustomBoards] = useState<{id: string, w: number, h: number, number?: number, name: string, label: string, veta: boolean}[]>([]);

    const [config, setConfig] = useState<OptimizationConfig>({
        sawKerf: 3,
        trimming: { top: 10, bottom: 10, left: 10, right: 10 },
        strategy: 'SIMPLE_CUTS',
        cutDirection: 'OPTIMAL',
        boardWidth: 2440,
        boardHeight: 1830,
        grainDirection: 'HORIZONTAL',
        preFresado: 0,
        material: 'Melamina 18mm',
        edgeThickness1: 0.4,
        edgeThickness2: 2,
        clientName: '',
        workOrder: 'OPT-XXXXXX',
        labelInfo: '',
        originCorner: 'top-left',
    });

    const [showRecoveryModal, setShowRecoveryModal] = useState(false);
    const [originType, setOriginType] = useState<'VENTA_DIRECTA' | 'PROYECTO'>('VENTA_DIRECTA');
    const [selectedProject, setSelectedProject] = useState<any | null>(null);
    const [optimizationStatus, setOptimizationStatus] = useState<'BORRADOR' | 'PENDIENTE_PAGO' | 'LISTO_CORTE'>('BORRADOR');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [optimizationId, setOptimizationId] = useState<string | null>(null);
    const [optimizationCode, setOptimizationCode] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isQuotationOpen, setIsQuotationOpen] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [hasQuotation, setHasQuotation] = useState(false);
    const [showStatusConfirm, setShowStatusConfirm] = useState(false);
    const [showQuotationWarning, setShowQuotationWarning] = useState(false);
    const [showFrozenPreview, setShowFrozenPreview] = useState(false);
    
    const [isTraining, setIsTraining] = useState(false);
    const [trainingTimeLeft, setTrainingTimeLeft] = useState(0); 
    const [trainingTotalTime, setTrainingTotalTime] = useState(0);
    const [showTrainingMenu, setShowTrainingMenu] = useState(false);
    const trainingIntervalRef = useRef<any>(null);
    const trainingDataRef = useRef<Map<string, { 
        population: number[][], 
        evalFn: any,
        bestScore: number,
        bestBoards: Board[],
        bw: number,
        bh: number,
        bName: string,
        matKey: string
    }>>(new Map());
    
    const [isLoadedFromHistory, setIsLoadedFromHistory] = useState(false);
    const [currentVersion, setCurrentVersion] = useState(1);
    const [initialHash, setInitialHash] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'VISUAL' | 'COMMANDS'>('COMMANDS');

    const hasUnsavedChangesAfterLoad = isLoadedFromHistory && initialHash && JSON.stringify({ pieces, boards, config, projectName }) !== initialHash;
    const hasUnsavedChanges = initialHash !== null && JSON.stringify({ pieces, boards, config, projectName }) !== initialHash;

    useEffect(() => {
        if ('fonts' in document) {
            document.fonts.ready.then(() => setLoadingFonts(false));
        } else {
            setLoadingFonts(false);
        }
        const sessionKey = `erp_optimization_session_${projectId || 'new'}`;
        const savedSession = localStorage.getItem(sessionKey);
        if (savedSession) {
            try {
                const parsed = JSON.parse(savedSession);
                if (parsed.pieces?.length > 0 || parsed.boards?.length > 0) {
                    setShowRecoveryModal(true);
                }
            } catch (e) {
                console.error("Failed to parse saved session");
            }
        }

        const fetchInitialData = async () => {
            try {
                const cb = await api.getCustomBoards();
                setCustomBoards(cb);
                
                // Cargar Inteligencia Global (Meta-aprendizaje) de Supabase
                const brainData = await fetch('http://localhost:8787/api/ai-brain-weights').then(res => res.json());
                if (brainData && brainData.length > 0) {
                    setAiBrainWeights(brainData[0].weights);
                    console.log("[ML] Inteligencia Global activada.");
                }
            } catch (e) { console.warn('Error cargando datos iniciales del ML', e); }

            if (projectId) {
                try {
                    const optimizations = await api.getOptimizations();
                    const byId = optimizations.find((o: any) => o.id === projectId);
                    let found = byId;
                    if (byId?.code) {
                        const baseCode = byId.code.split('-V')[0];
                        const allVersions = optimizations.filter((o: any) =>
                            o.code && o.code.split('-V')[0] === baseCode
                        );
                        if (allVersions.length > 0) {
                            found = allVersions.sort((a: any, b: any) => {
                                const vA = a.data?.version ?? parseInt(a.code?.split('-V')[1] || '1');
                                const vB = b.data?.version ?? parseInt(b.code?.split('-V')[1] || '1');
                                return vB - vA;
                            })[0];
                        }
                    }
                    if (found) {
                        setOptimizationId(found.id);
                        setOptimizationCode(found.code);
                        setOptimizationStatus(found.status);
                        setOriginType(found.origin_type);
                        
                        let loadedConfig = config;
                        if (found.data) {
                            const loadedName = found.data.projectName || '';
                            setProjectName(loadedName);
                            setPieces(found.data.pieces || []);
                            setBoards(found.data.boards || []);
                            setCurrentVersion(found.data.version || 1);
                            
                            if (found.data.config) {
                                loadedConfig = { ...found.data.config, clientName: loadedName || found.data.config.clientName };
                                setConfig(loadedConfig);
                            }

                            // Restaurar los campeones del ML (Élite de la Élite) desde Supabase
                            if (found.best_dna) {
                                const dnaMap = new Map();
                                Object.entries(found.best_dna).forEach(([k, v]) => dnaMap.set(k, v));
                                persistentBestChromosomesRef.current = dnaMap;
                            }

                            setIsLoadedFromHistory(true);
                            setInitialHash(JSON.stringify({ 
                                pieces: found.data.pieces || [], 
                                boards: found.data.boards || [], 
                                config: loadedConfig, 
                                projectName: loadedName 
                            }));
                            
                            lastGeometryRef.current = JSON.stringify((found.data.pieces || []).map((p: any) => ({
                                id: p.id, e: p.enabled, c: p.code, q: p.quantity, w: p.width, h: p.height, m: p.material, eb: p.edgeBanding
                            }))) + JSON.stringify({
                                bw: loadedConfig.boardWidth, bh: loadedConfig.boardHeight, sk: loadedConfig.sawKerf, tr: loadedConfig.trimming, gd: loadedConfig.grainDirection, pf: loadedConfig.preFresado
                            });
                        } else {
                            setInitialHash(JSON.stringify({ pieces: [], boards: [], config, projectName: '' }));
                        }

                        if (found.project_id) {
                            api.getProjects().then(projects => {
                                const proj = projects.find((p: any) => p.id === found.project_id);
                                if (proj) setSelectedProject(proj);
                            });
                        }

                        api.getQuotations().then(quotes => {
                            setHasQuotation(quotes.some(q => q.optimization_id === found.id));
                        }).catch(() => setHasQuotation(false));
                    } else {
                        const nextOT = await api.getNextWorkOrder();
                        const nextConfig = { ...config, workOrder: nextOT.replace('OPT-', 'OT-') };
                        setConfig(nextConfig);
                        setInitialHash(JSON.stringify({ pieces: [], boards: [], config: nextConfig, projectName: '' }));
                    }
                } catch (error) {
                    console.error("Failed to load optimization:", error);
                }
            } else {
                try {
                    const nextOT = await api.getNextWorkOrder();
                    const nextConfig = { ...config, workOrder: nextOT.replace('OPT-', 'OT-') };
                    setConfig(nextConfig);
                    setInitialHash(JSON.stringify({ pieces: [], boards: [], config: nextConfig, projectName: '' }));
                } catch (error) {
                    console.error("Failed to fetch next OT:", error);
                }
            }
            setLoadingData(false);
        };

        fetchInitialData();
    }, [projectId]);

    useEffect(() => {
        if (!showRecoveryModal && initialHash !== null) {
            const timer = setTimeout(() => {
                const currentHash = JSON.stringify({ pieces, boards, config, projectName });
                const sessionKey = `erp_optimization_session_${projectId || 'new'}`;
                if (currentHash !== initialHash) {
                    if (pieces.length > 0 || boards.length > 0 || projectName) {
                        const sessionData = { 
                            pieces, config, boards, projectName, selectedProject, originType,
                            optimizationId, optimizationCode, isLoadedFromHistory, currentVersion, 
                            initialHash, optimizationStatus
                        };
                        localStorage.setItem(sessionKey, JSON.stringify(sessionData));
                    }
                } else {
                    localStorage.removeItem(sessionKey);
                }
            }, 1500); 
            return () => clearTimeout(timer);
        }
    }, [pieces, config, boards, projectName, selectedProject, originType, showRecoveryModal, projectId, initialHash]);

    const isManualAdjustingRef = useRef(false);
    const lastGeometryRef = useRef<string>("");

    useEffect(() => {
        const currentGeometry = JSON.stringify(pieces.map(p => ({
            id: p.id, e: p.enabled, c: p.code, q: p.quantity, w: p.width, h: p.height, m: p.material, eb: p.edgeBanding
        }))) + JSON.stringify({
            bw: config.boardWidth, bh: config.boardHeight, sk: config.sawKerf, tr: config.trimming, gd: config.grainDirection, pf: config.preFresado
        });

        if (lastGeometryRef.current && lastGeometryRef.current !== currentGeometry) {
            if (boards.length > 0 && !isManualAdjustingRef.current) {
                startTransition(() => {
                    setBoards([]);
                });
            }
        }
        lastGeometryRef.current = currentGeometry;
        isManualAdjustingRef.current = false;
    }, [pieces, config.boardWidth, config.boardHeight, config.sawKerf, config.trimming, config.grainDirection, config.preFresado, boards.length]);

    useEffect(() => {
        if (originType === 'VENTA_DIRECTA' && projectName !== config.clientName) {
            setConfig(prev => ({ ...prev, clientName: projectName }));
        }
    }, [projectName, originType]);

    const handleRecovery = (accept: boolean) => {
        const sessionKey = `erp_optimization_session_${projectId || 'new'}`;
        if (accept) {
            const savedSession = localStorage.getItem(sessionKey);
            if (savedSession) {
                try {
                    const parsed = JSON.parse(savedSession);
                    if (parsed.pieces) setPieces(parsed.pieces);
                    if (parsed.config) setConfig(parsed.config);
                    if (parsed.boards) setBoards(parsed.boards);
                    if (parsed.projectName) setProjectName(parsed.projectName);
                    if (parsed.selectedProject) setSelectedProject(parsed.selectedProject);
                    if (parsed.originType) setOriginType(parsed.originType);
                    if (parsed.optimizationId) setOptimizationId(parsed.optimizationId);
                    if (parsed.optimizationCode) setOptimizationCode(parsed.optimizationCode);
                    if (parsed.isLoadedFromHistory !== undefined) setIsLoadedFromHistory(parsed.isLoadedFromHistory);
                    if (parsed.currentVersion) setCurrentVersion(parsed.currentVersion);
                    if (parsed.initialHash) setInitialHash(parsed.initialHash);
                    if (parsed.optimizationStatus) setOptimizationStatus(parsed.optimizationStatus);

                    const nextPieces = parsed.pieces || [];
                    const nextConfig = parsed.config || config;
                    lastGeometryRef.current = JSON.stringify(nextPieces.map((p: any) => ({
                        id: p.id, e: p.enabled, c: p.code, q: p.quantity, w: p.width, h: p.height, m: p.material, eb: p.edgeBanding
                    }))) + JSON.stringify({
                        bw: nextConfig.boardWidth, bh: nextConfig.boardHeight, sk: nextConfig.sawKerf, tr: nextConfig.trimming, gd: nextConfig.grainDirection, pf: nextConfig.preFresado
                    });
                } catch (e) { console.error("Error applying recovery", e); }
            }
        } else {
            localStorage.removeItem(sessionKey);
        }
        setShowRecoveryModal(false);
    };

    const handleOptimize = async () => {
        setIsOptimizing(true);
        setBoards([]);
        let freshCustomBoards = customBoards;
        try {
            freshCustomBoards = await api.getCustomBoards();
            setCustomBoards(freshCustomBoards);
        } catch (e) { console.warn('No se pudo refrescar custom boards.', e); }

        setTimeout(() => {
            const activePieces = pieces.filter(p => p.enabled !== false);
            const materialGroups = new Map<string, typeof activePieces>();
            activePieces.forEach(p => {
                const matKey = p.material?.trim() || '0';
                if (!materialGroups.has(matKey)) materialGroups.set(matKey, []);
                materialGroups.get(matKey)!.push(p);
            });

            const allBoards: Board[] = [];
            const fallbackMaterials: string[] = [];
            let hardError: string | null = null;

            materialGroups.forEach((groupPieces, matKey) => {
                const matchedBoard = freshCustomBoards.find(b => b.number?.toString() === matKey);
                const bw = matchedBoard?.w ?? config.boardWidth;
                const bh = matchedBoard?.h ?? config.boardHeight;
                const bName = matchedBoard?.name ?? (matKey !== '0' ? `MAT.${matKey}` : 'Sin material');
                const piecesForOpt = matchedBoard?.veta ? groupPieces.map(p => ({ ...p, matchGrain: true })) : groupPieces;

                let resultBoards: Board[] = [];
                try {
                    resultBoards = optimizeCuttingMap(piecesForOpt, bw, bh, config, aiBrainWeights);
                } catch (err: any) {
                    const errMsg = err?.message || String(err);
                    if (errMsg.includes('área útil') || errMsg.includes('inválid')) {
                        hardError = errMsg; resultBoards = [];
                    } else {
                        try { resultBoards = safeFallbackPack(piecesForOpt, bw, bh, config); fallbackMaterials.push(bName); }
                        catch (fErr) { hardError = errMsg; resultBoards = []; }
                    }
                }
                resultBoards.forEach(b => { (b as any).materialNumber = matKey; (b as any).materialLabel = bName; });
                allBoards.push(...resultBoards);
            });

            isManualAdjustingRef.current = true;
            setBoards(allBoards);
            setIsOptimizing(false);
            if (hardError) showToast(`Error: ${hardError}`, 'error');
            else if (fallbackMaterials.length > 0) showToast(`Plan B en: ${fallbackMaterials.join(', ')}`, 'info');
        }, 0);
    };

    const stopTraining = () => {
        if (trainingIntervalRef.current) { clearInterval(trainingIntervalRef.current); trainingIntervalRef.current = null; }
        setIsTraining(false); setTrainingTimeLeft(0); showToast("Entrenamiento finalizado.", 'success');
    };    const persistentBestChromosomesRef = React.useRef<Map<string, number[]>>(new Map());

    const startContinuousTraining = async (minutes: number) => {
        if (isTraining) { stopTraining(); return; }
        const seconds = minutes * 60;
        
        // Estado inmediato para feedback visual
        setTrainingTimeLeft(seconds); 
        setTrainingTotalTime(seconds); 
        setIsTraining(true); 
        setShowTrainingMenu(false);

        const activePieces = pieces.filter(p => p.enabled !== false);
        const materialGroups = new Map<string, Piece[]>();
        activePieces.forEach(p => {
            const matKey = p.material?.trim() || '0';
            if (!materialGroups.has(matKey)) materialGroups.set(matKey, []);
            materialGroups.get(matKey)!.push(p);
        });

        const freshCustomBoards = await api.getCustomBoards();
        const trainingMap = new Map();

        materialGroups.forEach((groupPieces, matKey) => {
            const matchedBoard = freshCustomBoards.find(b => b.number?.toString() === matKey);
            const bw = matchedBoard?.w ?? config.boardWidth;
            const bh = matchedBoard?.h ?? config.boardHeight;
            const bName = matchedBoard?.name ?? (matKey !== '0' ? `MAT.${matKey}` : 'Sin material');
            const piecesForOpt = matchedBoard?.veta ? groupPieces.map(p => ({ ...p, matchGrain: true })) : groupPieces;
            
            // Recuperamos la "élite de la élite" guardada para este material
            const initialSeed = persistentBestChromosomesRef.current.get(matKey);
            const { population, evaluateSequence } = prepareEvolution(piecesForOpt, bw, bh, config, true, initialSeed);
            
            trainingMap.set(matKey, { population, evalFn: evaluateSequence, bestScore: -Infinity, bestBoards: [], bw, bh, bName, matKey });
        });

        trainingDataRef.current = trainingMap;
        const endTime = Date.now() + (seconds * 1000);

        let generationCount = 0;
        trainingIntervalRef.current = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            setTrainingTimeLeft(remaining);
            
            if (remaining <= 0) { 
                stopTraining(); 
                return; 
            }

            const updatedBoards: Board[] = [];
            generationCount += 10;

            trainingDataRef.current.forEach((data) => {
                for (let i = 0; i < 10; i++) {
                    const { nextPopulation, bestInStep } = evolveStep(data.population, data.bw, data.bh, config, data.evalFn, aiBrainWeights);
                    data.population = nextPopulation;
                    if (bestInStep.score > data.bestScore) {
                        data.bestScore = bestInStep.score;
                        data.bestBoards = JSON.parse(JSON.stringify(bestInStep.boards));
                        // GUARDAMOS LA ÉLITE DE LA ÉLITE
                        persistentBestChromosomesRef.current.set(data.matKey, [...(bestInStep as any).chromosome]);
                    }
                }

                data.bestBoards.forEach(b => { (b as any).materialNumber = data.matKey; (b as any).materialLabel = data.bName; });
                updatedBoards.push(...data.bestBoards);
            });
            
            if (generationCount % 100 === 0) {
                console.log(`[ML Training] Gen: ${generationCount} | Sigue buscando mejoría...`);
            }
            
            isManualAdjustingRef.current = true;
            setBoards(updatedBoards);
            setTimeout(() => { isManualAdjustingRef.current = false; }, 50);
        }, 500); 
    };

    const stats = React.useMemo(() => {
        if (boards.length === 0) return { wastePercent: '0.0', remaining: 0, totalPlaced: 0, boards: 0 };
        let totalUsedArea = 0, placedCount = 0;
        boards.forEach(b => { totalUsedArea += b.usedArea; placedCount += b.placedPieces.length; });
        const activePieces = pieces.filter(p => p.enabled !== false);
        const totalPieces = activePieces.reduce((sum, p) => sum + p.quantity, 0);
        const totalBoardArea = boards.length * config.boardWidth * config.boardHeight;
        const wastePercent = totalBoardArea > 0 ? (((totalBoardArea - totalUsedArea) / totalBoardArea) * 100).toFixed(1) : '0.0';
        return { wastePercent, remaining: totalPieces - placedCount, totalPlaced: placedCount, boards: boards.length };
    }, [boards, pieces]);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 5000);
    };

    const handleSave = async (forceStatus?: 'BORRADOR' | 'LISTO_CORTE') => {
        if (isSaving) return; setIsSaving(true);
        try {
            const finalStatus = optimizationStatus === 'LISTO_CORTE' ? 'LISTO_CORTE' : (forceStatus || 'BORRADOR');
            let finalId = optimizationId, finalCode = optimizationCode, finalVersion = currentVersion;
            if (isLoadedFromHistory && hasUnsavedChangesAfterLoad) {
                const nextVer = currentVersion + 1; finalVersion = nextVer; setCurrentVersion(nextVer);
                if (optimizationCode) finalCode = `${optimizationCode.split('-V')[0]}-V${nextVer}`;
                else if (selectedProject?.project_number) finalCode = `OPT-${selectedProject.project_number.split('-').slice(1).join('-')}-V${nextVer}`;
                else { const newOtp = await api.getNextWorkOrder(); finalCode = `${newOtp.split('-V')[0]}-V${nextVer}`; }
                finalId = null;
            }
            // Convertimos el Map de cromosomas a un objeto para JSONB
            const bestDnaObj = Object.fromEntries(persistentBestChromosomesRef.current);

            const payload = { 
                id: finalId || undefined, 
                code: finalCode, 
                origin_type: originType, 
                project_id: selectedProject?.id || null, 
                status: finalStatus, 
                project_name: projectName || 'Optimización Sin Nombre', 
                work_order: finalCode ? finalCode.replace('OPT-', 'OT-') : config.workOrder, 
                client_name: config.clientName, 
                boards_count: stats.boards, 
                waste_percent: parseFloat(stats.wastePercent), 
                total_pieces: pieces.reduce((sum, p) => sum + p.quantity, 0), 
                saw_kerf: config.sawKerf, 
                grain_direction: config.grainDirection, 
                best_dna: bestDnaObj, // GUARDAMOS LA ÉLITE EN LA NUBE
                data: { 
                    projectName: projectName || 'Optimización Sin Nombre', 
                    pieces, 
                    boards, 
                    stats, 
                    config: { ...config, workOrder: finalCode ? finalCode.replace('OPT-', 'OT-') : config.workOrder }, 
                    version: finalVersion 
                } 
            };
            const res = await fetch('http://localhost:8787/api/optimizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error(await res.text());
            const savedData = await res.json();
            setOptimizationId(savedData.id); setOptimizationCode(savedData.code); setOptimizationStatus(savedData.status);
            if (savedData.code) { const vMatch = savedData.code.match(/-V(\d+)$/); if (vMatch) setCurrentVersion(parseInt(vMatch[1], 10)); }
            if (savedData.code) setConfig(c => ({ ...c, workOrder: savedData.code.replace('OPT-', 'OT-') }));
            const sessionKey = `erp_optimization_session_${projectId || 'new'}`; localStorage.removeItem(sessionKey);
            setInitialHash(JSON.stringify({ pieces, boards, config, projectName: projectName || 'Optimización Sin Nombre' }));
            if (finalStatus === 'LISTO_CORTE') await api.syncQuotationToTreasury(savedData.id);

            // META-APRENDIZAJE: Actualizar el "Cerebro Global" con los pesos actuales si el resultado fue bueno
            if (stats.wastePercent < 15) { // Solo aprendemos de optimizaciones con menos de 15% de desperdicio
                try {
                    await fetch('http://localhost:8787/api/ai-brain-weights', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            material_type: 'DEFAULT', 
                            weights: aiBrainWeights || {
                                fragmentation_penalty: 2000000000000000,
                                family_grouping_bonus: 8000000000000000000,
                                guillotine_consistency: 18000000000000000000,
                                master_cut_reward: 6000000000000000000,
                                l_cut_penalty: 25000000000000000000,
                                rotation_bonus: 2000000000000
                            }
                        })
                    });
                    console.log("[ML] Cerebro Global actualizado con éxito.");
                } catch (e) { console.warn("[ML] No se pudo actualizar el cerebro global."); }
            }

            showToast(`${finalId === null && isLoadedFromHistory ? 'Nueva versión' : 'Optimización'} guardada.`, 'success');
        } catch (e) { console.error(e); showToast("Error al guardar.", 'error'); }
        finally { setIsSaving(false); }
    };

    const handleConfirmListoCorte = async () => { setShowStatusConfirm(false); setOptimizationStatus('LISTO_CORTE'); await handleSave('LISTO_CORTE'); };

    const printRef = useRef<HTMLDivElement>(null);
    const labelRef = useRef<HTMLDivElement>(null);
    const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: `Reporte - ${projectName || 'Sin Nombre'}` });
    const handlePrintLabels = useReactToPrint({ contentRef: labelRef, documentTitle: `Etiquetas - ${projectName || 'Sin Nombre'}` });

    const { expandedPieces, annotatedBoards, totalEdge1, totalEdge2 } = React.useMemo(() => {
        if (pieces.length === 0 && boards.length === 0) return { expandedPieces: [], annotatedBoards: [], totalEdge1: 0, totalEdge2: 0 };
        const expanded: any[] = []; let currentIndex = 1;
        const pieceCodeTracker = new Map<string, { codes: string[], indices: number[], currentConsumption: number }>();
        pieces.forEach(p => {
            const codes = []; const indices = [];
            for (let i = 0; i < p.quantity; i++) {
                let pCode = ''; const hasVal = p.code && p.code !== '000';
                if (hasVal) { const parts = p.code!.split('-'); pCode = `${parts[0]}-${String(currentIndex).padStart(3, '0')}`; }
                else { pCode = `PIE-${String(currentIndex).padStart(3, '0')}`; }
                expanded.push({ ...p, printIndex: currentIndex, printCode: pCode }); codes.push(pCode); indices.push(currentIndex); currentIndex++;
            }
            pieceCodeTracker.set(p.id, { codes, indices, currentConsumption: 0 });
        });
        if (boards.length === 0) return { expandedPieces: expanded, annotatedBoards: [], totalEdge1: 0, totalEdge2: 0 };
        let e1 = 0, e2 = 0;
        const annBs = boards.map(b => ({
            ...b, placedPieces: b.placedPieces.map(pp => {
                const tr = pieceCodeTracker.get(pp.pieceTemplateId); const orig = pieces.find(p => p.id === pp.pieceTemplateId);
                let pc = pp.code, pi = (pp as any).printIndex || 0;
                if (tr && tr.currentConsumption < tr.codes.length) { pc = tr.codes[tr.currentConsumption]; pi = tr.indices[tr.currentConsumption]; tr.currentConsumption++; }
                const ed = orig ? orig.edgeBanding : pp.edgeBanding;
                if (ed) { const w = orig ? orig.width : pp.width, h = orig ? orig.height : pp.height; if (ed.top === 1) e1 += w; if (ed.top === 2) e2 += w; if (ed.bottom === 1) e1 += w; if (ed.bottom === 2) e2 += w; if (ed.left === 1) e1 += h; if (ed.left === 2) e2 += h; if (ed.right === 1) e1 += h; if (ed.right === 2) e2 += h; }
                return { ...pp, printCode: pc, printIndex: pi, originalPiece: orig };
            })
        }));
        return { expandedPieces: expanded, annotatedBoards: annBs, totalEdge1: e1 / 1000, totalEdge2: e2 / 1000 };
    }, [pieces, boards]);

    const optimizationData = React.useMemo(() => ({ boardBreakdown: [], edge1: totalEdge1, edge2: totalEdge2, clientName: projectName || config.clientName, optimizationId, optimizationCode, isLoadedFromHistory, currentVersion }), [totalEdge1, totalEdge2, projectName, config.clientName, optimizationId, optimizationCode, isLoadedFromHistory, currentVersion]);

    return (
        <div className="flex flex-col h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-800 dark:text-slate-200">
            {(loadingFonts || loadingData) ? <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-t-indigo-600"></div></div> : (
                <><div key="content" className="print:hidden flex flex-col h-full overflow-hidden">
                <header className="flex-none flex flex-col border-b bg-white shadow-sm relative z-10" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                    <style>{`@import url('https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;700&display=swap');`}</style>
                    <div className="flex items-center justify-between px-6 py-1.5 bg-[#F7FAF9] border-b">
                        <button onClick={() => navigate('/optimizacion')} className="flex items-center gap-1 text-slate-500 hover:text-indigo-600 text-xs font-medium transition-colors"><span className="material-icons-round text-[14px]">arrow_back</span> Volver</button>
                        <div className="flex gap-1 p-0.5 bg-[#E0E4E8]/50 rounded-lg w-max">
                            <button onClick={() => setOriginType('VENTA_DIRECTA')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${originType === 'VENTA_DIRECTA' ? 'bg-white text-[#2D3748] shadow-sm' : 'text-slate-500'}`}>Venta Directa</button>
                            <button onClick={() => setOriginType('PROYECTO')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${originType === 'PROYECTO' ? 'bg-white text-[#2D3748] shadow-sm' : 'text-slate-500'}`}>Proyecto</button>
                        </div>
                    </div>
                    <div className="flex flex-row items-center justify-between px-6 py-4 gap-4 bg-white w-full">
                        <div className="flex items-center gap-4"><span className="material-icons-round text-[#4A90E2] text-[32px]">{originType === 'PROYECTO' ? 'architecture' : 'storefront'}</span>
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-3">
                                    {originType === 'PROYECTO' ? (
                                        <select disabled={!!optimizationId} value={selectedProject?.id || ""} onFocus={async (e: any) => { if (e.target.options.length <= 1) { const pr = await api.getProjects(); const act = pr.filter((p: any) => ['BORRADOR', 'ENVIADO', 'APROBADO', 'INICIO', 'EN_EJECUCION', 'POR APROBAR'].includes(p.status) && !p.retail_board); while (e.target.options.length > 1) e.target.remove(1); act.forEach((p: any) => e.target.add(new Option(`[${p.project_number}] ${p.name}`, p.id))); } }} onChange={(e) => { api.getProjects().then(pr => { const proj = pr.find((p: any) => p.id === e.target.value); setSelectedProject(proj); if (proj) setProjectName(proj.name); }); }} className="text-2xl font-[800] text-[#2c3434] bg-transparent border-none outline-none appearance-none pr-8 cursor-pointer">{!selectedProject && <option value="">Seleccione...</option>}{selectedProject && <option value={selectedProject.id}>{`[${selectedProject.project_number}] ${selectedProject.name}`}</option>}</select>
                                    ) : (
                                        <input type="text" value={projectName || config.clientName} onChange={(e) => { setProjectName(e.target.value); setConfig(p => ({ ...p, clientName: e.target.value })); }} placeholder="Nombre..." className="text-2xl font-[800] text-[#2c3434] bg-transparent border-none outline-none p-0 min-w-[240px]" />
                                    )}
                                    {optimizationStatus === 'LISTO_CORTE' ? <span className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-[800] bg-[#dcfce7] text-[#2c3434] rounded-full uppercase border border-[#dcfce7]"><span className="material-icons-round text-[14px]">verified</span> LISTO</span> : <button onClick={() => { if (!hasQuotation) { setShowQuotationWarning(true); return; } setShowStatusConfirm(true); }} disabled={!optimizationId} className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-[800] bg-[#f0f5f4] text-[#366480] rounded-full uppercase hover:bg-indigo-50 border shadow-sm"><div className="w-2 h-2 rounded-full bg-[#4A90E2] animate-pulse"></div> BORRADOR</button>}
                                </div>
                                <div className="flex items-center gap-5 text-[12px] font-bold text-[#366480]/60">ID: {optimizationCode || 'PENDIENTE'} | V.{currentVersion}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 flex-nowrap shrink-0">
                            <div className="relative flex items-center gap-1">
                                <button onClick={handleOptimize} disabled={isOptimizing || isTraining} className="flex items-center gap-2 px-6 py-3.5 bg-[#4A90E2] text-white font-[800] rounded-l-[12px] hover:bg-[#357ABD] transition-all shadow-lg text-[14px] disabled:opacity-50"><span className={`material-icons-round text-[20px] ${isOptimizing ? 'animate-spin' : ''}`}>{isOptimizing ? 'sync' : 'bolt'}</span>{isOptimizing ? 'Optimizando...' : 'Optimizar Ahora'}</button>
                                <div className="relative">
                                    <button onClick={() => isTraining ? stopTraining() : setShowTrainingMenu(!showTrainingMenu)} className={`flex items-center justify-center w-[54px] py-3.5 ${isTraining ? 'bg-orange-500 hover:bg-orange-600 animate-pulse' : 'bg-[#366480]'} text-white font-[800] rounded-r-[12px] transition-all shadow-lg active:scale-95 text-[14px]`} title="Entrenamiento"><span className="material-icons-round text-[20px]">{isTraining ? 'stop' : 'model_training'}</span></button>
                                    {showTrainingMenu && !isTraining && (
                                        <div className="absolute right-0 top-full mt-2 w-48 bg-white border rounded-xl shadow-2xl z-50 py-2 animate-premium-fade">
                                            <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b mb-1">Entrenamiento</div>
                                            <button onClick={() => startContinuousTraining(5)} className="w-full text-left px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">5 Minutos</button>
                                            <button onClick={() => startContinuousTraining(10)} className="w-full text-left px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">10 Minutos</button>
                                            <button onClick={() => { const m = prompt("Minutos:", "15"); if (m && !isNaN(parseInt(m))) startContinuousTraining(parseInt(m)); }} className="w-full text-left px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">Personalizado</button>
                                        </div>
                                    )}
                                    {isTraining && (
                                        <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 text-white rounded-xl shadow-2xl z-50 p-4 border border-slate-700">
                                            <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-black uppercase tracking-widest text-orange-400">Entrenando...</span><span className="text-xs font-mono">{Math.floor(trainingTimeLeft / 60)}:{(trainingTimeLeft % 60).toString().padStart(2, '0')}</span></div>
                                            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-orange-500 transition-all duration-1000" style={{ width: `${((trainingTotalTime - trainingTimeLeft) / trainingTotalTime) * 100}%` }}></div></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {optimizationStatus !== 'LISTO_CORTE' && <button onClick={() => handleSave('BORRADOR')} disabled={isSaving || boards.length === 0 || isOptimizing || !hasUnsavedChanges} className={`flex items-center gap-2 px-6 py-3.5 font-[800] rounded-[12px] transition-all border-2 ${(isSaving || boards.length === 0 || isOptimizing || !hasUnsavedChanges) ? 'bg-[#f0f5f4] text-[#366480]/30 cursor-not-allowed border-transparent' : 'bg-white border-[#4A90E2]/20 text-[#4A90E2] hover:bg-slate-50 shadow-sm'}`}><span className={`material-icons-round text-[20px] ${isSaving ? 'animate-spin' : ''}`}>cloud_upload</span>Guardar</button>}
                            <button onClick={() => setIsQuotationOpen(true)} disabled={boards.length === 0 || isOptimizing} className={`flex items-center gap-2 px-6 py-3.5 font-[800] rounded-[12px] transition-all ${(boards.length === 0 || isOptimizing) ? 'bg-[#f0f5f4] text-[#366480]/30 cursor-not-allowed' : 'bg-[#dcfce7] text-[#2c3434]'}`}><span className="material-icons-round text-[20px]">payments</span> Cotización</button>
                            <div className="flex items-center bg-[#f0f5f4] p-1 rounded-[14px] gap-1 ml-2 border">
                                <button onClick={() => setIsHistoryOpen(true)} className="p-2.5 text-[#366480] hover:bg-white rounded-[10px] transition-all"><span className="material-icons-round text-[20px]">history</span></button>
                                <button onClick={handlePrint} className="p-2.5 text-[#366480] hover:bg-white rounded-[10px] transition-all"><span className="material-icons-round text-[20px]">print</span></button>
                                <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 text-[#366480] hover:bg-white rounded-[10px] transition-all"><span className="material-icons-round text-[20px]">settings_suggest</span></button>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between px-10 py-4 bg-[#f7faf9]/50 border-t">
                        <div className="flex items-center gap-12">
                            <div className="flex flex-col"><span className="text-[10px] font-black text-[#366480]/50 uppercase">Desperdicio</span><span className="text-[20px] font-[800] text-[#2c3434]">{stats?.wastePercent || '0.0'}%</span></div>
                            <div className="w-px h-10 bg-[#d3dcdb]/40"></div>
                            <div className="flex flex-col"><span className="text-[10px] font-black text-[#366480]/50 uppercase">Piezas</span><span className="text-[20px] font-[800] text-[#2c3434]">{stats?.totalPlaced}/{pieces.reduce((sum, p) => sum + p.quantity, 0)}</span></div>
                            <div className="w-px h-10 bg-[#d3dcdb]/40"></div>
                            <div className="flex flex-col"><span className="text-[10px] font-black text-[#366480]/50 uppercase">Tableros</span><span className="text-[20px] font-[800] text-[#2c3434]">{stats?.boards || 0} Unidades</span></div>
                        </div>
                        <div className="flex items-center gap-3 bg-[#f0f5f4] px-4 py-2 rounded-xl border"><span className="w-2 h-2 rounded-full bg-[#4A90E2] animate-pulse"></span><span className="text-[12px] font-[800] text-[#366480] uppercase">Cálculo en Tiempo Real</span></div>
                    </div>
                </header>
                <main className={`flex-1 overflow-auto flex flex-col gap-8 ${viewMode === 'COMMANDS' ? 'px-6 pb-6' : 'p-6'}`}>
                    <div className={`flex flex-row gap-0 shrink-0 min-h-[500px] h-auto border rounded-[24px] overflow-hidden shadow-premium bg-white relative`}>
                        {optimizationStatus === 'LISTO_CORTE' && !showFrozenPreview && (
                            <div className="absolute inset-0 z-20 bg-slate-100/70 backdrop-blur-[3px] flex items-center justify-center"><div className="flex flex-col items-center gap-4 px-8 py-6 bg-white border rounded-2xl shadow-xl text-center"><span className="material-icons-round text-emerald-600 text-4xl">lock</span><p className="text-lg font-[800]">Bloqueado</p><button onClick={() => setShowFrozenPreview(true)} className="px-5 py-2 rounded-xl bg-slate-100 font-bold text-sm">Ver piezas</button></div></div>
                        )}
                        <div className={`w-full h-full flex flex-row ${optimizationStatus === 'LISTO_CORTE' && showFrozenPreview ? 'grayscale opacity-70' : 'contents'}`}>
                        {viewMode === 'VISUAL' ? (
                            <><div className="w-1/2 flex flex-col border-r"><PieceInputPanel pieces={pieces} setPieces={setPieces} onPiecesChanged={() => setBoards([])} /></div>
                            <div className="w-1/2 flex flex-col"><PieceListPanel pieces={pieces} setPieces={setPieces} onPiecesChanged={() => setBoards([])} /></div></>
                        ) : (
                            <div className="w-full h-full flex flex-col"><CommandModeTable pieces={pieces} setPieces={setPieces} isLocked={optimizationStatus === 'LISTO_CORTE'} /></div>
                        )}
                        </div>
                    </div>
                    <div className="w-auto flex-none min-h-[600px] flex flex-col bg-white border rounded-[24px] overflow-hidden shadow-premium"><CuttingMap boards={annotatedBoards} boardWidth={config.boardWidth} boardHeight={config.boardHeight} sawKerf={config.sawKerf} trimming={config.trimming} pieces={pieces} onPiecesAdjust={(delta) => { isManualAdjustingRef.current = true; setPieces(prev => prev.map(p => { if (!Object.prototype.hasOwnProperty.call(delta, p.id)) return p; return { ...p, quantity: Math.max(0, (p.quantity || 0) + delta[p.id]) }; })); }} /></div>
                </main>
            </div>
            <div style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none', zIndex: -1 }}><PrintReport ref={printRef} projectName={projectName} config={config} optimizationCode={optimizationCode} boards={annotatedBoards} pieces={pieces} stats={stats} totalEdge1={totalEdge1} totalEdge2={totalEdge2} currentVersion={currentVersion} expandedPieces={expandedPieces} /></div>
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} config={config} setConfig={setConfig} viewMode={viewMode} setViewMode={setViewMode} onPrintLabels={handlePrintLabels} initialCustomBoards={customBoards} />
            <OptimizationHistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} onLoadOptimization={(opt) => {
                    setOptimizationId(opt.id); setOptimizationCode(opt.code); setOptimizationStatus(opt.status); setOriginType(opt.origin_type); setIsLoadedFromHistory(true);
                    if (opt.data) {
                        const ln = opt.data.projectName || ''; setProjectName(ln); setPieces(opt.data.pieces || []); setBoards(opt.data.boards || []); setCurrentVersion(opt.data.version || 1);
                        if (opt.data.config) { const lc = { ...opt.data.config, clientName: ln || opt.data.config.clientName }; setConfig(lc); setInitialHash(JSON.stringify({ pieces: opt.data.pieces || [], boards: opt.data.boards || [], config: lc, projectName: ln })); }
                    }
                    if (opt.project_id) { setSelectedProject({ id: opt.project_id }); api.getProjects().then(pr => { const f = pr.find((p: any) => p.id === opt.project_id); if (f) setSelectedProject(f); }); }
                    else setSelectedProject(null);
                }} filterCode={optimizationCode || undefined} />
            {toast && <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[3000] animate-in fade-in slide-in-from-bottom-4"><div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 ${toast?.type === 'success' ? 'bg-emerald-500 text-white' : toast?.type === 'error' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}><span className="material-icons-round">{toast?.type === 'success' ? 'check_circle' : toast?.type === 'error' ? 'error' : 'info'}</span><p className="text-sm font-black">{toast?.message}</p></div></div>}
            {showQuotationWarning && <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[4px]"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center"><span className="material-icons-round text-blue-500 text-4xl mb-4">payments</span><h3 className="text-lg font-black mb-2">Cotización Requerida</h3><p className="text-sm text-slate-500 mb-6">Genera la cotización antes de cambiar a Listo para Corte.</p><div className="flex gap-3 w-full"><button onClick={() => setShowQuotationWarning(false)} className="flex-1 px-4 py-2.5 rounded-xl border font-bold text-sm">Cancelar</button><button onClick={() => { setShowQuotationWarning(false); setIsQuotationOpen(true); }} className="flex-1 px-4 py-2.5 rounded-xl bg-[#4A90E2] text-white font-black text-sm">Cotizar</button></div></div></div>}
            {showStatusConfirm && <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[4px]"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center"><span className="material-icons-round text-amber-500 text-4xl mb-4">warning</span><h3 className="text-lg font-black mb-2">¿Confirmar Listo para Corte?</h3><p className="text-sm text-slate-500 mb-6">Esta acción bloqueará la optimización y no se puede deshacer.</p><div className="flex gap-3 w-full"><button onClick={() => setShowStatusConfirm(false)} className="flex-1 px-4 py-2.5 rounded-xl border font-bold text-sm">Cancelar</button><button onClick={handleConfirmListoCorte} className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-sm">Confirmar</button></div></div></div>}
            {showRecoveryModal && <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/10 backdrop-blur-[4px]"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center"><span className="material-icons-round text-blue-500 text-4xl mb-4">restore</span><h3 className="text-xl font-black mb-2">Sesión Recuperada</h3><p className="text-sm text-slate-500 mb-6">¿Deseas recuperar la sesión anterior?</p><div className="flex gap-3 w-full"><button onClick={() => handleRecovery(false)} className="flex-1 py-3 text-sm font-bold bg-slate-100 rounded-xl">Descartar</button><button onClick={() => handleRecovery(true)} className="flex-1 py-3 text-sm font-black text-white bg-blue-600 rounded-xl">Recuperar</button></div></div></div>}
            <QuotationModal isOpen={isQuotationOpen} onClose={() => setIsQuotationOpen(false)} optimizationData={optimizationData} onSaveSuccess={(nv, nc) => { setCurrentVersion(nv); setOptimizationCode(nc); setIsLoadedFromHistory(false); setHasQuotation(true); handleSave(); }} />
            <div style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none', zIndex: -1 }}><PieceLabels ref={labelRef} projectName={projectName || (selectedProject?.name ? `Tableros | ${selectedProject.name}` : '')} clientName={config.clientName || ''} material={config.material || ''} pieces={pieces} /></div>
                </>
            )}
        </div>
    );
};
export default OptimizationLayout;
