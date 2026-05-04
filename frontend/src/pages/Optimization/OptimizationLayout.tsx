import React, { useState, useEffect, useRef, startTransition } from 'react';
import { PieceLabels } from './components/PieceLabels';
import { PrintReport } from './components/PrintReport';
import { useReactToPrint } from 'react-to-print';
import { useParams, useNavigate } from 'react-router-dom';
import { PieceInputPanel, PieceListPanel } from './components/PieceList';
import { api } from '../../services/api';
import { CuttingMap } from './components/CuttingMap';
import { optimizeCuttingMap, safeFallbackPack, type Board } from './lib/optimizationAlgorithm';
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
    // Custom boards from DB — needed to resolve material names and dimensions per MAT. group
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

    // Hoisted State for Auto-save dependencies
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
    
    // Versioning states
    const [isLoadedFromHistory, setIsLoadedFromHistory] = useState(false);
    const [currentVersion, setCurrentVersion] = useState(1);
    const [initialHash, setInitialHash] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'VISUAL' | 'COMMANDS'>('COMMANDS');

    // Derived state for versioning
    const hasUnsavedChangesAfterLoad = isLoadedFromHistory && initialHash && JSON.stringify({ pieces, boards, config, projectName }) !== initialHash;
    const hasUnsavedChanges = initialHash !== null && JSON.stringify({ pieces, boards, config, projectName }) !== initialHash;

    useEffect(() => {
        if ('fonts' in document) {
            document.fonts.ready.then(() => setLoadingFonts(false));
        } else {
            setLoadingFonts(false);
        }
        // Recovery logic...
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
            // Always fetch custom boards so handleOptimize can resolve material names/sizes
            try {
                const cb = await api.getCustomBoards();
                setCustomBoards(cb);
            } catch (e) { console.warn('Could not load custom boards', e); }

            if (projectId) {
                try {
                    const optimizations = await api.getOptimizations();
                    const byId = optimizations.find((o: any) => o.id === projectId);
                    // Always load the latest version of the same base code
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
                        
                        // Load data
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

                            setIsLoadedFromHistory(true);
                            setInitialHash(JSON.stringify({ 
                                pieces: found.data.pieces || [], 
                                boards: found.data.boards || [], 
                                config: loadedConfig, 
                                projectName: loadedName 
                            }));
                            
                            // Prevent wipe on load
                            lastGeometryRef.current = JSON.stringify((found.data.pieces || []).map((p: any) => ({
                                id: p.id, e: p.enabled, c: p.code, q: p.quantity, w: p.width, h: p.height, m: p.material, eb: p.edgeBanding
                            }))) + JSON.stringify({
                                bw: loadedConfig.boardWidth, bh: loadedConfig.boardHeight, sk: loadedConfig.sawKerf, tr: loadedConfig.trimming, gd: loadedConfig.grainDirection, pf: loadedConfig.preFresado
                            });
                        } else {
                            setInitialHash(JSON.stringify({ pieces: [], boards: [], config, projectName: '' }));
                        }

                        // Maintain selected project reference if it has one
                        if (found.project_id) {
                            api.getProjects().then(projects => {
                                const proj = projects.find((p: any) => p.id === found.project_id);
                                if (proj) setSelectedProject(proj);
                            });
                        }

                        // Check if quotation exists
                        api.getQuotations().then(quotes => {
                            setHasQuotation(quotes.some(q => q.optimization_id === found.id));
                        }).catch(() => setHasQuotation(false));
                    } else {
                        // Not found as optimization, fallback to new
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

    // Auto-save logic — debounced to avoid blocking main thread on every keystroke
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
            }, 1500); // 1.5s debounce — saves after user pauses
            return () => clearTimeout(timer);
        }
    }, [pieces, config, boards, projectName, selectedProject, originType, showRecoveryModal, projectId, initialHash]);

    const isManualAdjustingRef = useRef(false);

    // Track piece geometry changes to invalidate optimized boards
    const lastGeometryRef = useRef<string>("");
    useEffect(() => {
        // Include all fields that affect optimization or that the user specifically mentioned (like CÓD.)
        const currentGeometry = JSON.stringify(pieces.map(p => ({
            id: p.id,
            e: p.enabled,
            c: p.code,
            q: p.quantity,
            w: p.width,
            h: p.height,
            m: p.material,
            eb: p.edgeBanding
        }))) + JSON.stringify({
            bw: config.boardWidth,
            bh: config.boardHeight,
            sk: config.sawKerf,
            tr: config.trimming,
            gd: config.grainDirection,
            pf: config.preFresado
        });

        if (lastGeometryRef.current && lastGeometryRef.current !== currentGeometry) {
            if (boards.length > 0 && !isManualAdjustingRef.current) {
                // Non-urgent: defer board invalidation so typing stays responsive
                startTransition(() => {
                    setBoards([]);
                });
            }
        }
        lastGeometryRef.current = currentGeometry;
        isManualAdjustingRef.current = false;
    }, [pieces, config.boardWidth, config.boardHeight, config.sawKerf, config.trimming, config.grainDirection, config.preFresado, boards.length]);

    // Keep projectName and config.clientName in sync
    useEffect(() => {
        if (originType === 'VENTA_DIRECTA' && projectName !== config.clientName) {
            setConfig(prev => ({ ...prev, clientName: projectName }));
        }
    }, [projectName, originType]);

    // Track changes for versioning (ensure we only mark as changed if actual data differs from baseline)
    // (This is now derived inline to avoid infinite render loops)

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

                    // Prevent wipe on recovery
                    const nextPieces = parsed.pieces || [];
                    const nextConfig = parsed.config || config;
                    lastGeometryRef.current = JSON.stringify(nextPieces.map((p: any) => ({
                        id: p.id, e: p.enabled, c: p.code, q: p.quantity, w: p.width, h: p.height, m: p.material, eb: p.edgeBanding
                    }))) + JSON.stringify({
                        bw: nextConfig.boardWidth, bh: nextConfig.boardHeight, sk: nextConfig.sawKerf, tr: nextConfig.trimming, gd: nextConfig.grainDirection, pf: nextConfig.preFresado
                    });
                } catch (e) {
                    console.error("Error applying recovery", e);
                }
            }
        } else {
            localStorage.removeItem(sessionKey);
        }
        setShowRecoveryModal(false);
    };

    const handleOptimize = async () => {
        setIsOptimizing(true);
        // Clear previous boards immediately so the CuttingMap always transitions
        // empty → new result, regardless of whether board count changes between strategies.
        setBoards([]);

        // Refrescar custom_boards desde la BD justo antes de optimizar. El
        // SettingsModal mantiene su PROPIA copia de customBoards y nunca
        // notifica al padre cuando el usuario edita la veta de un tablero.
        // Sin este fetch, handleOptimize lee veta obsoleta y, p. ej., al
        // marcar veta=TRUE en un material seguía rotando piezas. Recargar
        // aquí garantiza que el plan refleja siempre el estado actual.
        let freshCustomBoards = customBoards;
        try {
            freshCustomBoards = await api.getCustomBoards();
            setCustomBoards(freshCustomBoards);
        } catch (e) {
            console.warn('No se pudo refrescar custom boards antes de optimizar; usando caché.', e);
        }

        // Defer computation to next tick so isOptimizing=true renders first (button grays out).
        // Avoids startTransition which can be interrupted by concurrent-mode urgent updates,
        // causing boards to appear briefly then disappear on the first run.
        setTimeout(() => {
            const activePieces = pieces.filter(p => p.enabled !== false);

            // Group pieces by their material number (MAT. column)
            const materialGroups = new Map<string, typeof activePieces>();
            activePieces.forEach(p => {
                const matKey = p.material?.trim() || '0';
                if (!materialGroups.has(matKey)) materialGroups.set(matKey, []);
                materialGroups.get(matKey)!.push(p);
            });

            const allBoards: import('./lib/optimizationAlgorithm').Board[] = [];
            // Si CUALQUIER grupo (un material) falla la optimización principal o
            // su auditoría, caemos en el plan B determinista para ese grupo y
            // notificamos al usuario. El ERP nunca se queda sin plan.
            const fallbackMaterials: string[] = [];
            let hardError: string | null = null;

            materialGroups.forEach((groupPieces, matKey) => {
                const matchedBoard = freshCustomBoards.find(b => b.number?.toString() === matKey);
                const bw = matchedBoard?.w ?? config.boardWidth;
                const bh = matchedBoard?.h ?? config.boardHeight;
                const bName = matchedBoard?.name
                    ?? (matKey !== '0' ? `MAT.${matKey}` : 'Sin material asignado');

                // Si el custom_board tiene veta=TRUE, forzar matchGrain en todas
                // las piezas del grupo para que el optimizador no las rote. Si
                // es FALSE, respetar el matchGrain individual de cada pieza
                // (el usuario puede haberlo bloqueado manualmente).
                const piecesForOpt = matchedBoard?.veta
                    ? groupPieces.map(p => ({ ...p, matchGrain: true }))
                    : groupPieces;

                let resultBoards: import('./lib/optimizationAlgorithm').Board[];
                try {
                    resultBoards = optimizeCuttingMap(piecesForOpt, bw, bh, config);
                } catch (err: any) {
                    const errMsg = err?.message || String(err);
                    console.warn(`[Optimización ${bName}] falló: ${errMsg}`);
                    
                    // Si el error es por datos de entrada inválidos (pieza gigante, config errónea),
                    // reportarlo directamente al usuario en lugar de aplicar el plan B ineficiente.
                    if (errMsg.includes('área útil') || errMsg.includes('inválid') || errMsg.includes('corruptos')) {
                        hardError = errMsg;
                        resultBoards = [];
                    } else {
                        console.warn(`Aplicando plan B determinista para ${bName}.`);
                        try {
                            resultBoards = safeFallbackPack(piecesForOpt, bw, bh, config);
                            fallbackMaterials.push(bName);
                        } catch (fallbackErr: any) {
                            console.error(`[Optimización ${bName}] plan B también falló:`, fallbackErr);
                            hardError = errMsg;
                            resultBoards = [];
                        }
                    }
                }
                resultBoards.forEach(b => {
                    (b as any).materialNumber = matKey;
                    (b as any).materialLabel = bName;
                });
                allBoards.push(...resultBoards);
            });

            // Signal that this is a controlled board update so the geometry-tracking
            // effect does not immediately clear the boards it just received.
            isManualAdjustingRef.current = true;
            setBoards(allBoards);
            setIsOptimizing(false);

            if (hardError) {
                showToast(`Optimización rechazada: ${hardError}`, 'error');
            } else if (fallbackMaterials.length > 0) {
                showToast(
                    `Plan B aplicado en: ${fallbackMaterials.join(', ')}. Revise el resultado.`,
                    'info'
                );
            }
        }, 0);
    };

    const stats = React.useMemo(() => {
        if (boards.length === 0) return { wastePercent: '0.0', remaining: 0, totalPlaced: 0, boards: 0 };

        let totalUsedArea = 0;
        let placedCount = 0;

        boards.forEach(b => {
            totalUsedArea += b.usedArea;
            placedCount += b.placedPieces.length;
        });

        const activePieces = pieces.filter(p => p.enabled !== false);
        const totalPieces = activePieces.reduce((sum, p) => sum + p.quantity, 0);
        const totalBoardArea = boards.length * config.boardWidth * config.boardHeight;
        const wastePercent = totalBoardArea > 0 ? (((totalBoardArea - totalUsedArea) / totalBoardArea) * 100).toFixed(1) : '0.0';

        return {
            wastePercent,
            remaining: totalPieces - placedCount,
            totalPlaced: placedCount,
            boards: boards.length
        }
    }, [boards, pieces]);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 5000);
    };

    const handleSave = async (forceStatus?: 'BORRADOR' | 'LISTO_CORTE') => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            // Always save as BORRADOR unless explicitly set to LISTO_CORTE
            // But if already LISTO_CORTE, preserve that status
            const finalStatus = optimizationStatus === 'LISTO_CORTE' ? 'LISTO_CORTE' : (forceStatus || 'BORRADOR');
            
            let finalId = optimizationId;
            let finalCode = optimizationCode;
            let finalVersion = currentVersion;

            // Versioning Logic: If modified after load from history, create NEW version
            if (isLoadedFromHistory && hasUnsavedChangesAfterLoad) {
                const nextVer = currentVersion + 1;
                finalVersion = nextVer;
                setCurrentVersion(nextVer);
                
                if (optimizationCode) {
                    const codeBase = optimizationCode.split('-V')[0];
                    finalCode = `${codeBase}-V${nextVer}`;
                } else if (selectedProject?.project_number) {
                    const suffix = selectedProject.project_number.split('-').slice(1).join('-');
                    finalCode = `OPT-${suffix}-V${nextVer}`;
                } else {
                    const newOtp = await api.getNextWorkOrder();
                    const base = newOtp.split('-V')[0];
                    finalCode = `${base}-V${nextVer}`;
                }
                finalId = null;
            }

            const payload = {
                id: finalId || undefined,
                code: finalCode,
                origin_type: originType,
                project_id: selectedProject?.id || null,
                status: finalStatus,
                project_name: projectName || 'Optimización Sin Nombre',
                work_order: finalCode ? finalCode.replace('OPT-', 'OT-') : config.workOrder,
                client_name: config.clientName,
                material_type: (() => {
                    const names = [...new Set(
                        pieces
                            .filter(p => p.material?.trim())
                            .map(p => {
                                const cb = customBoards.find(b => b.number?.toString() === p.material!.trim());
                                return cb?.name ?? `MAT.${p.material!.trim()}`;
                            })
                    )];
                    return names.length > 0 ? names.join(', ') : (config.material || 'Sin material');
                })(),
                boards_count: stats.boards,
                waste_percent: parseFloat(stats.wastePercent),
                total_pieces: pieces.reduce((sum, p) => sum + p.quantity, 0),
                saw_kerf: config.sawKerf,
                grain_direction: config.grainDirection,
                data: {
                    projectName: projectName || 'Optimización Sin Nombre',
                    pieces,
                    boards,
                    stats,
                    config: {
                        ...config,
                        workOrder: finalCode ? finalCode.replace('OPT-', 'OT-') : config.workOrder
                    },
                    version: finalVersion
                }
            };

            const res = await fetch('http://localhost:8787/api/optimizations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error(await res.text());
            const savedData = await res.json();

            setOptimizationId(savedData.id);
            setOptimizationCode(savedData.code);
            setOptimizationStatus(savedData.status);
            
            if (savedData.code) {
                const vMatch = savedData.code.match(/-V(\d+)$/);
                if (vMatch) setCurrentVersion(parseInt(vMatch[1], 10));
            }
            
            let updatedConfig = config;
            if (savedData.code) {
                const otCode = savedData.code.replace('OPT-', 'OT-');
                updatedConfig = { ...config, workOrder: otCode };
                setConfig(updatedConfig);
            }

            const sessionKey = `erp_optimization_session_${projectId || 'new'}`;
            localStorage.removeItem(sessionKey);
            setInitialHash(JSON.stringify({ 
                pieces, 
                boards, 
                config: updatedConfig, 
                projectName: projectName || 'Optimización Sin Nombre' 
            }));

            // Only sync to Ventas y Tesorería when transitioning to LISTO_CORTE
            if (finalStatus === 'LISTO_CORTE') {
                await api.syncQuotationToTreasury(savedData.id);
            }

            const isNewVersion = finalId === null && isLoadedFromHistory;
            const statusLabel = finalStatus === 'LISTO_CORTE' ? ' — Listo para Corte 🔒' : '';
            showToast(`${isNewVersion ? 'Nueva versión' : 'Optimización'} ${savedData.code} guardada${statusLabel}.`, 'success');
        } catch (e: any) {
            console.error("Error saving optimization", e);
            showToast("Error al guardar la optimización.", 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Confirm and switch to LISTO_CORTE (freezes editing)
    const handleConfirmListoCorte = async () => {
        setShowStatusConfirm(false);
        setOptimizationStatus('LISTO_CORTE');
        await handleSave('LISTO_CORTE');
    };

    // Determine Dynamic Save Button properties
    const isOptimizationComplete = pieces.length > 0 && boards.length > 0 && config.boardWidth > 0 && config.boardHeight > 0;
    
    let saveBtnText = 'Guardar Borrador';
    let saveBtnColor = 'bg-slate-500 hover:bg-slate-600 text-white border-transparent'; // Gris azulado

    if (isOptimizationComplete) {
        saveBtnText = 'Guardar Optimización';
        saveBtnColor = 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent shadow-emerald-500/20'; // Verde destacado
    } else if (optimizationId) {
        saveBtnText = 'Actualizar';
        saveBtnColor = 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-indigo-500/20'; // Azulado
    }

    // --- Print Hook Setup ---
    const printRef = useRef<HTMLDivElement>(null);
    const labelRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Reporte de Optimizacion - ${projectName || 'Sin Nombre'}`,
    });

    const handlePrintLabels = useReactToPrint({
        contentRef: labelRef,
        documentTitle: `Etiquetas - ${projectName || 'Sin Nombre'}`,
    });

    // --- Print Layout Computations ---
    const { expandedPieces, annotatedBoards, totalEdge1, totalEdge2 } = React.useMemo(() => {
        // If no pieces and no boards, return early
        if (pieces.length === 0 && boards.length === 0) {
            return { expandedPieces: [], annotatedBoards: [], totalEdge1: 0, totalEdge2: 0 };
        }

        const expanded: any[] = [];
        let currentIndex = 1;
        
        const pieceCodeTracker = new Map<string, { codes: string[], indices: number[], currentConsumption: number }>();

        // Helper for auto-code generation
        const generateAutoCode = (desc: string, idx: number) => {
            if (!desc) return `PIE-${String(idx).padStart(3, '0')}`;
            const firstWord = desc.trim().split(/\s+/)[0] || 'PIE';
            const base = firstWord.substring(0, 3).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return `${base}-${String(idx).padStart(3, '0')}`;
        };

        pieces.forEach(p => {
            const codesForThisPiece = [];
            const indicesForThisPiece = [];
            
            for (let i = 0; i < p.quantity; i++) {
                let pCode = '';
                const hasValidCode = p.code && p.code.trim() !== '' && p.code !== '000';
                
                if (hasValidCode) {
                    const lastDashIndex = p.code!.lastIndexOf('-');
                    let prefix = p.code!;
                    if (lastDashIndex !== -1) {
                        const suffix = p.code!.substring(lastDashIndex + 1);
                        if (/^\d+$/.test(suffix)) {
                            prefix = p.code!.substring(0, lastDashIndex);
                        }
                    }
                    pCode = `${prefix}-${String(currentIndex).padStart(3, '0')}`;
                } else {
                    pCode = generateAutoCode(p.description, currentIndex);
                }
                
                expanded.push({
                    ...p,
                    printIndex: currentIndex,
                    printCode: pCode
                });
                codesForThisPiece.push(pCode);
                indicesForThisPiece.push(currentIndex);
                currentIndex++;
            }
            pieceCodeTracker.set(p.id, { codes: codesForThisPiece, indices: indicesForThisPiece, currentConsumption: 0 });
        });

        // Skip board mapping if empty
        if (boards.length === 0) {
            return { expandedPieces: expanded, annotatedBoards: [], totalEdge1: 0, totalEdge2: 0 };
        }

        let edge1Sum = 0;
        let edge2Sum = 0;

        const annBs: any[] = boards.map(b => {
            const annPlacedPieces = b.placedPieces.map(pp => {
                const tracker = pieceCodeTracker.get(pp.pieceTemplateId);
                const originalPiece = pieces.find(p => p.id === pp.pieceTemplateId);
                let pCode = pp.code;
                let pIndex = (pp as any).printIndex || 0;
                
                if (tracker && tracker.currentConsumption < tracker.codes.length) {
                    pCode = tracker.codes[tracker.currentConsumption];
                    pIndex = tracker.indices[tracker.currentConsumption];
                    tracker.currentConsumption++;
                }

                // Compute Edge Banding Linear Meters inline to avoid second pass
                const edges = originalPiece ? originalPiece.edgeBanding : pp.edgeBanding;
                if (edges) {
                    const cutW = originalPiece ? originalPiece.width : pp.width;
                    const cutH = originalPiece ? originalPiece.height : pp.height;

                    if (edges.top === 1) edge1Sum += cutW;
                    if (edges.top === 2) edge2Sum += cutW;
                    if (edges.bottom === 1) edge1Sum += cutW;
                    if (edges.bottom === 2) edge2Sum += cutW;

                    if (edges.left === 1) edge1Sum += cutH;
                    if (edges.left === 2) edge2Sum += cutH;
                    if (edges.right === 1) edge1Sum += cutH;
                    if (edges.right === 2) edge2Sum += cutH;
                }

                return { ...pp, printCode: pCode, printIndex: pIndex, originalPiece };
            });
            return { ...b, placedPieces: annPlacedPieces };
        });

        return { 
            expandedPieces: expanded, 
            annotatedBoards: annBs, 
            totalEdge1: edge1Sum / 1000, 
            totalEdge2: edge2Sum / 1000 
        };
    }, [pieces, boards]);

    const boardBreakdown = React.useMemo(() => {
        const map = new Map<string, { materialLabel: string; count: number }>();
        (boards as any[]).forEach(b => {
            const key = b.materialLabel || config.material || 'Sin material';
            if (!map.has(key)) {
                map.set(key, { materialLabel: key, count: 0 });
            }
            map.get(key)!.count++;
        });
        return Array.from(map.values());
    }, [boards, config.material]);

    const optimizationData = React.useMemo(() => ({
        boardBreakdown,
        edge1: totalEdge1,
        edge2: totalEdge2,
        clientName: projectName || config.clientName,
        optimizationId: optimizationId,
        optimizationCode: optimizationCode,
        isLoadedFromHistory: isLoadedFromHistory,
        currentVersion: currentVersion
    }), [boardBreakdown, totalEdge1, totalEdge2, projectName, config.clientName, optimizationId, optimizationCode, isLoadedFromHistory, currentVersion]);

    return (
        <div className="flex flex-col h-screen print:h-auto print:min-h-screen print:overflow-visible transition-colors duration-700 bg-slate-50 dark:bg-[#0B1120] text-slate-800 dark:text-slate-200">
            {(loadingFonts || loadingData) ? (
                <div className="flex-1 flex items-center justify-center animate-premium-fade">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-indigo-600"></div>
                </div>
            ) : (
                <>
                <div key="content" className="print:hidden flex flex-col h-full overflow-hidden animate-premium-fade">
                {/* Header section (Industrial Pastel Dashboard) */}
                <header className="flex-none flex flex-col border-b border-[#E0E4E8] bg-white shrink-0 shadow-sm relative z-10" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                    <style>{`@import url('https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;700&display=swap');`}</style>
                    
                    {/* Very top mini-bar for Volver and OriginType */}
                    <div className="flex items-center justify-between px-6 py-1.5 bg-[#F7FAF9] border-b border-[#E0E4E8]">
                        <button
                            onClick={() => navigate('/optimizacion')}
                            className="flex items-center gap-1 text-slate-500 hover:text-indigo-600 text-xs font-medium transition-colors"
                        >
                            <span className="material-icons-round text-[14px]">arrow_back</span>
                            Volver a Lista
                        </button>
                        <div className="flex gap-1 p-0.5 bg-[#E0E4E8]/50 rounded-lg w-max">
                            <button
                                onClick={() => setOriginType('VENTA_DIRECTA')}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${originType === 'VENTA_DIRECTA' ? 'bg-white text-[#2D3748] shadow-sm' : 'text-slate-500 hover:text-[#2D3748]'}`}
                            >
                                Venta Directa
                            </button>
                            <button
                                onClick={() => setOriginType('PROYECTO')}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${originType === 'PROYECTO' ? 'bg-white text-[#2D3748] shadow-sm' : 'text-slate-500 hover:text-[#2D3748]'}`}
                            >
                                Proyecto Existente
                            </button>
                        </div>
                    </div>

                    {/* Main Top Row: Title, Info and Buttons */}
                    <div className="flex flex-row items-center justify-between px-6 py-4 gap-4 bg-white w-full">
                        {/* Left: Branding & Origin */}
                        <div className="flex items-center gap-4">
                            {/* Origin Badge */}
                            <div className="flex items-center justify-center shrink-0">
                                <span className="material-icons-round text-[#4A90E2] text-[32px]">{originType === 'PROYECTO' ? 'architecture' : 'storefront'}</span>
                            </div>

                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-3">
                                    {/* Title Input or Project Selector */}
                                    {originType === 'PROYECTO' ? (
                                        <div className="relative">
                                            <select
                                                disabled={!!optimizationId}
                                                value={selectedProject?.id || ""}
                                                onFocus={async (e: any) => {
                                                    if (e.target.options.length <= 1) {
                                                        try {
                                                            const projects = await api.getProjects();
                                                            const activeProj = projects.filter((p: any) =>
                                                                ['BORRADOR', 'ENVIADO', 'APROBADO', 'INICIO', 'EN_EJECUCION', 'POR APROBAR'].includes(p.status) && !p.retail_board
                                                            );
                                                            while (e.target.options.length > 1) { e.target.remove(1); }
                                                            activeProj.forEach((p: any) => {
                                                                const opt = new Option(`[${p.project_number}] ${p.name}`, p.id);
                                                                e.target.add(opt);
                                                            });
                                                        } catch (err) { console.error(err) }
                                                    }
                                                }}
                                                onChange={(e) => {
                                                    const projId = e.target.value;
                                                    api.getProjects().then(projects => {
                                                        const proj = projects.find((p: any) => p.id === projId);
                                                        setSelectedProject(proj);
                                                        if (proj) setProjectName(proj.name);
                                                    });
                                                }}
                                                className="text-2xl font-[800] text-[#2c3434] bg-transparent border-none outline-none cursor-pointer pr-8 tracking-tight appearance-none"
                                            >
                                                {!selectedProject && <option value="">Seleccione un proyecto...</option>}
                                                {selectedProject && <option value={selectedProject.id}>{`[${selectedProject.project_number}] ${selectedProject.name}`}</option>}
                                            </select>
                                            <span className="material-icons-round text-[#4A90E2] absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">expand_more</span>
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={projectName || config.clientName}
                                            onChange={(e) => {
                                                setProjectName(e.target.value);
                                                setConfig(prev => ({ ...prev, clientName: e.target.value }));
                                            }}
                                            placeholder="Nombre de Venta..."
                                            className="text-2xl font-[800] text-[#2c3434] bg-transparent border-none outline-none focus:ring-0 placeholder:text-[#d3dcdb] p-0 min-w-[240px] tracking-tight"
                                        />
                                    )}
                                    
                                    {/* Status Dropdown */}
                                    {optimizationStatus === 'LISTO_CORTE' ? (
                                        <span className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-[800] tracking-wider bg-[#dcfce7] text-[#2c3434] rounded-full whitespace-nowrap uppercase border border-[#dcfce7]">
                                            <span className="material-icons-round text-[14px]">verified</span>
                                            LISTO PARA CORTE
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                if (!hasQuotation) {
                                                    setShowQuotationWarning(true);
                                                    return;
                                                }
                                                setShowStatusConfirm(true);
                                            }}
                                            disabled={!optimizationId}
                                            className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-[800] tracking-wider bg-[#f0f5f4] text-[#366480] rounded-full whitespace-nowrap uppercase hover:bg-[#4A90E2]/10 transition-all border border-[#d3dcdb]/40 shadow-sm"
                                        >
                                            <div className="w-2 h-2 rounded-full bg-[#4A90E2] animate-pulse"></div>
                                            BORRADOR
                                            {optimizationId && <span className="material-icons-round text-[14px] opacity-40">expand_more</span>}
                                        </button>
                                    )}
                                </div>
                                
                                {/* ID and Version Metadata placed below Name */}
                                <div className="flex items-center gap-5 text-[12px] font-bold text-[#366480]/60">
                                    <div className="flex items-center gap-1.5">
                                        <span className="material-icons-round text-[16px]">fingerprint</span>
                                        <span>ID: {optimizationCode ? `#${optimizationCode.split('-V')[0]}` : 'PENDIENTE'}</span>
                                    </div>
                                    <div className="w-1 h-1 rounded-full bg-[#d3dcdb]"></div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="material-icons-round text-[16px]">alt_route</span>
                                        <span>V.{currentVersion}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Premium Buttons */}
                        <div className="flex items-center gap-3 flex-nowrap shrink-0">
                            {/* Optimize Button */}
                            <button
                                onClick={handleOptimize}
                                disabled={isOptimizing}
                                className="flex items-center gap-2 px-6 py-3.5 bg-[#4A90E2] text-white font-[800] rounded-[12px] hover:bg-[#357ABD] transition-all shadow-lg shadow-blue-500/20 active:scale-95 text-[14px] disabled:opacity-50"
                            >
                                <span className={`material-icons-round text-[20px] ${isOptimizing ? 'animate-spin' : ''}`}>
                                    {isOptimizing ? 'sync' : 'bolt'}
                                </span>
                                {isOptimizing ? 'Optimizando...' : 'Optimizar Ahora'}
                            </button>

                            {/* Save Button */}
                            {optimizationStatus !== 'LISTO_CORTE' && (
                            <button
                                onClick={() => handleSave('BORRADOR')}
                                disabled={isSaving || boards.length === 0 || isOptimizing || !hasUnsavedChanges}
                                className={`flex items-center gap-2 px-6 py-3.5 font-[800] rounded-[12px] transition-all active:scale-95 text-[14px] border-2 ${
                                    (isSaving || boards.length === 0 || isOptimizing || !hasUnsavedChanges) 
                                    ? 'bg-[#f0f5f4] border-transparent text-[#366480]/30 cursor-not-allowed' 
                                    : 'bg-white border-[#4A90E2]/20 text-[#4A90E2] hover:bg-[#f0f5f4] shadow-sm'
                                }`}
                            >
                                <span className={`material-icons-round text-[20px] ${isSaving ? 'animate-spin' : ''}`}>
                                    {isSaving ? 'sync' : 'cloud_upload'}
                                </span>
                                {isSaving ? 'Procesando...' : 'Guardar Cambios'}
                            </button>
                            )}

                            {/* Quotation Button */}
                            <button
                                onClick={() => setIsQuotationOpen(true)}
                                disabled={boards.length === 0 || isOptimizing}
                                className={`flex items-center gap-2 px-6 py-3.5 font-[800] rounded-[12px] transition-all active:scale-95 text-[14px] ${
                                    (boards.length === 0 || isOptimizing)
                                    ? 'bg-[#f0f5f4] text-[#366480]/30 cursor-not-allowed'
                                    : 'bg-[#dcfce7] text-[#2c3434] hover:shadow-lg hover:shadow-green-500/10'
                                }`}
                            >
                                <span className="material-icons-round text-[20px]">payments</span>
                                Cotización
                            </button>

                            {/* Actions Group */}
                            <div className="flex items-center bg-[#f0f5f4] p-1 rounded-[14px] gap-1 ml-2 border border-[#d3dcdb]/30">
                                <button onClick={() => setIsHistoryOpen(true)} className="p-2.5 text-[#366480] hover:bg-white rounded-[10px] transition-all shadow-sm-hover" title="Historial">
                                    <span className="material-icons-round text-[20px]">history</span>
                                </button>
                                <button onClick={handlePrint} className="p-2.5 text-[#366480] hover:bg-white rounded-[10px] transition-all shadow-sm-hover" title="Imprimir">
                                    <span className="material-icons-round text-[20px]">print</span>
                                </button>
                                <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 text-[#366480] hover:bg-white rounded-[10px] transition-all shadow-sm-hover" title="Configuración">
                                    <span className="material-icons-round text-[20px]">settings_suggest</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row: Stats Dashboard */}
                    <div className="flex items-center justify-between px-10 py-4 bg-[#f7faf9]/50 backdrop-blur-sm border-t border-[#d3dcdb]/20">
                        <div className="flex items-center gap-12">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#f0f5f4] flex items-center justify-center text-[#366480]">
                                    <span className="material-icons-round">delete_outline</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-[#366480]/50 uppercase tracking-[0.1em]">Desperdicio Estimado</span>
                                    <span className="text-[20px] font-[800] text-[#2c3434] tracking-tight">{stats?.wastePercent || '0.0'}%</span>
                                </div>
                            </div>
                            <div className="w-px h-10 bg-[#d3dcdb]/40"></div>
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#f0f5f4] flex items-center justify-center text-[#366480]">
                                    <span className="material-icons-round">category</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-[#366480]/50 uppercase tracking-[0.1em]">Piezas Ubicadas</span>
                                    <span className="text-[20px] font-[800] text-[#2c3434] tracking-tight">{stats?.remaining || 0}/{pieces.reduce((sum, p) => sum + p.quantity, 0)}</span>
                                </div>
                            </div>
                            <div className="w-px h-10 bg-[#d3dcdb]/40"></div>
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#f0f5f4] flex items-center justify-center text-[#4A90E2]">
                                    <span className="material-icons-round">grid_view</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-[#366480]/50 uppercase tracking-[0.1em]">Tableros de Corte</span>
                                    <span className="text-[20px] font-[800] text-[#2c3434] tracking-tight">{stats?.boards || 0} Unidades</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-[#f0f5f4] px-4 py-2 rounded-xl border border-[#d3dcdb]/20 shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-[#4A90E2] animate-pulse"></span>
                            <span className="text-[12px] font-[800] text-[#366480] uppercase tracking-wider">Cálculo Optimizado en Tiempo Real</span>
                        </div>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className={`flex-1 overflow-auto flex flex-col gap-8 ${viewMode === 'COMMANDS' ? 'pt-0 px-6 pb-6 md:px-8 md:pb-8' : 'p-6 md:p-8'}`}>

                    {/* Top Row: Input & List (Forced 50/50 Split) */}
                    <div className={`flex flex-row gap-0 shrink-0 min-h-[500px] h-auto border border-[#d3dcdb]/20 ${viewMode === 'COMMANDS' ? 'rounded-b-[24px]' : 'rounded-[24px]'} overflow-visible shadow-premium bg-white relative`}>
                        {/* Frozen overlay when LISTO_CORTE */}
                        {optimizationStatus === 'LISTO_CORTE' && !showFrozenPreview && (
                            <div className="absolute inset-0 z-20 rounded-3xl bg-slate-100/70 backdrop-blur-[3px] flex items-center justify-center">
                                <div className="flex flex-col items-center gap-4 px-8 py-6 bg-white/95 border border-slate-200 rounded-2xl shadow-xl max-w-sm text-center">
                                    <span className="material-icons-round text-emerald-600 text-4xl">lock</span>
                                    <div>
                                        <p className="text-lg font-[800] text-[#2c3434] tracking-tight">Optimización Bloqueada</p>
                                        <p className="text-sm font-medium text-[#366480] mt-1">Estado: Listo para Corte — las piezas ya no se pueden editar.</p>
                                    </div>
                                    <button
                                        onClick={() => setShowFrozenPreview(true)}
                                        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors border border-slate-200"
                                    >
                                        <span className="material-icons-round text-[18px]">visibility</span>
                                        Ver lista de piezas (solo lectura)
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* Grayscale read-only banner when preview is active */}
                        {optimizationStatus === 'LISTO_CORTE' && showFrozenPreview && (
                            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 bg-slate-800/80 backdrop-blur-sm rounded-t-3xl">
                                <div className="flex items-center gap-2 text-white">
                                    <span className="material-icons-round text-[16px] text-slate-300">visibility</span>
                                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Vista de Solo Lectura — Listo para Corte</span>
                                </div>
                                <button
                                    onClick={() => setShowFrozenPreview(false)}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold transition-colors"
                                >
                                    <span className="material-icons-round text-[14px]">lock</span>
                                    Bloquear vista
                                </button>
                            </div>
                        )}
                        {/* Apply grayscale filter to content when in preview mode */}
                        <div className={`w-full h-full flex flex-row ${optimizationStatus === 'LISTO_CORTE' && showFrozenPreview ? 'grayscale opacity-70 pt-10' : 'contents'}`}>
                        {viewMode === 'VISUAL' ? (
                            <>
                                {/* Left: Input Form (50%) */}
                                <div className="w-1/2 flex flex-col border-r border-slate-100 dark:border-slate-800">
                                    <PieceInputPanel pieces={pieces} setPieces={setPieces} onPiecesChanged={() => setBoards([])} />
                                </div>

                                {/* Right: Piece List (50%) */}
                                <div className="w-1/2 flex flex-col">
                                    <PieceListPanel 
                                        pieces={pieces} 
                                        setPieces={setPieces} 
                                        onPiecesChanged={() => setBoards([])}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="w-full h-full flex flex-col overflow-visible">
                                <CommandModeTable pieces={pieces} setPieces={setPieces} isLocked={optimizationStatus === 'LISTO_CORTE'} />
                            </div>
                        )}
                        </div>{/* end grayscale wrapper */}
                    </div>

                    {/* Bottom Row: Cutting Map */}
                    <div className="w-auto flex-none min-h-[600px] flex flex-col bg-white border border-[#d3dcdb]/20 rounded-[24px] overflow-hidden shadow-premium">
                        <CuttingMap
                            boards={annotatedBoards}
                            boardWidth={config.boardWidth}
                            boardHeight={config.boardHeight}
                            sawKerf={config.sawKerf}
                            trimming={config.trimming}
                            pieces={pieces}
                            onPiecesAdjust={(delta) => {
                                isManualAdjustingRef.current = true;
                                setPieces(prev => prev.map(p => {
                                    if (!Object.prototype.hasOwnProperty.call(delta, p.id)) return p;
                                    return { ...p, quantity: Math.max(0, (p.quantity || 0) + delta[p.id]) };
                                }));
                            }}
                        />
                    </div>
                </main>
            </div>



            {/* Print-only Report Section (Hidden from screen view but accessible to react-to-print) */}
            <div style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none', zIndex: -1 }}>
                <PrintReport
                    ref={printRef}
                    projectName={projectName}
                    config={config}
                    optimizationCode={optimizationCode}
                    boards={annotatedBoards}
                    pieces={pieces}
                    stats={stats}
                    totalEdge1={totalEdge1}
                    totalEdge2={totalEdge2}
                    currentVersion={currentVersion}
                    expandedPieces={expandedPieces}
                />
            </div>



        <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            config={config}
            setConfig={setConfig}
            viewMode={viewMode}
            setViewMode={setViewMode}
            onPrintLabels={handlePrintLabels}
            initialCustomBoards={customBoards}
        />

            {/* History Modal */}
            <OptimizationHistoryModal
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                onLoadOptimization={(opt) => {
                    setOptimizationId(opt.id);
                    setOptimizationCode(opt.code);
                    setOptimizationStatus(opt.status);
                    setOriginType(opt.origin_type);
                    setIsLoadedFromHistory(true);

                    if (opt.data) {
                        const loadedName = opt.data.projectName || '';
                        setProjectName(loadedName);
                        setPieces(opt.data.pieces || []);
                        setBoards(opt.data.boards || []);
                        setCurrentVersion(opt.data.version || 1);
                        
                        if (opt.data.config) {
                            const loadedConfig = {
                                ...opt.data.config,
                                clientName: loadedName || opt.data.config.clientName
                            };
                            setConfig(loadedConfig);
                            setInitialHash(JSON.stringify({ 
                                pieces: opt.data.pieces || [], 
                                boards: opt.data.boards || [], 
                                config: loadedConfig, 
                                projectName: loadedName 
                            }));
                        }
                    }

                    if (opt.project_id) {
                        setSelectedProject({ id: opt.project_id });
                        // If we don't have project details, fetch them
                        if (!selectedProject || selectedProject.id !== opt.project_id) {
                            api.getProjects().then(projects => {
                                const found = projects.find((p: any) => p.id === opt.project_id);
                                if (found) setSelectedProject(found);
                            });
                        }
                    } else {
                        setSelectedProject(null);
                    }
                }}
                filterCode={optimizationCode || undefined}
            />

            {/* Premium Toast Notification */}
            {toast && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[3000] animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className={`px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-md border flex items-center gap-3 min-w-[320px] ${toast?.type === 'success'
                        ? 'bg-emerald-500/90 border-emerald-400 text-white'
                        : toast?.type === 'error'
                            ? 'bg-rose-500/90 border-rose-400 text-white'
                            : 'bg-amber-500/90 border-amber-400 text-white'
                        }`}>
                        <span className="material-icons-round">
                            {toast?.type === 'success' ? 'check_circle' : toast?.type === 'error' ? 'error' : 'info'}
                        </span>
                        <p className="text-sm font-black tracking-tight">{toast?.message}</p>
                    </div>
                </div>
            )}

            {/* Quotation Warning Dialog */}
            {showQuotationWarning && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[4px] print:hidden">
                    <div className="bg-white/85 backdrop-blur-[24px] rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-sm overflow-hidden border border-white/50 flex flex-col p-6">
                        <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                            <span className="material-icons-round text-3xl">payments</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 text-center mb-2">Cotización Requerida</h3>
                        <p className="text-sm text-slate-500 text-center mb-6">
                            Debes generar y guardar la cotización antes de cambiar el estado a <strong className="text-slate-700">Listo para Corte</strong>.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowQuotationWarning(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    setShowQuotationWarning(false);
                                    setIsQuotationOpen(true);
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-[#4A90E2] text-white font-black text-sm hover:bg-[#357ABD] transition-colors flex items-center justify-center gap-2"
                            >
                                <span className="material-icons-round text-[16px]">add_circle</span>
                                Cotizar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm LISTO_CORTE Dialog */}
            {showStatusConfirm && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[4px] print:hidden">
                    <div className="bg-white/85 backdrop-blur-[24px] rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-sm overflow-hidden border border-white/50 flex flex-col p-6">
                        <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                            <span className="material-icons-round text-3xl">warning</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 text-center mb-2">¿Marcar como Listo para Corte?</h3>
                        <p className="text-sm text-slate-500 text-center mb-6">
                            Al confirmar, esta optimización quedará <strong className="text-slate-700">bloqueada</strong>. Ya no podrás agregar, eliminar ni modificar piezas. Esta acción <strong className="text-rose-600">no se puede deshacer</strong>.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowStatusConfirm(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmListoCorte}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <span className="material-icons-round text-[16px]">lock</span>
                                Confirmar y Bloquear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Recovery Modal */}
            {showRecoveryModal && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/10 backdrop-blur-[4px] print:hidden">
                    <div className="bg-white/75 backdrop-blur-[24px] rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.08)] w-full max-w-sm overflow-hidden border border-white/50 flex flex-col p-6 text-center">
                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/40 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <span className="material-icons-round text-3xl">restore</span>
                        </div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">Sesión Recuperada</h3>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6">
                            Se ha encontrado una sesión de optimización sin guardar. ¿Deseas recuperarla y continuar donde lo dejaste?
                        </p>
                        <div className="flex gap-3 w-full">
                            <button 
                                onClick={() => handleRecovery(false)}
                                className="flex-1 py-3 text-sm font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl"
                            >
                                Descartar
                            </button>
                            <button 
                                onClick={() => handleRecovery(true)}
                                className="flex-1 py-3 text-sm font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20"
                            >
                                Recuperar Info
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quotation Modal */}
            <QuotationModal
                isOpen={isQuotationOpen}
                onClose={() => setIsQuotationOpen(false)}
                optimizationData={optimizationData}
                onSaveSuccess={(newVersion, newCode) => {
                    setCurrentVersion(newVersion);
                    setOptimizationCode(newCode);
                    setIsLoadedFromHistory(false);
                    setHasQuotation(true);
                    handleSave();
                }}
            />

            {/* Hidden Labels for Printing */}
            <div style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none', zIndex: -1 }}>
                <PieceLabels 
                    ref={labelRef}
                    projectName={projectName || (selectedProject?.name ? `Tableros | ${selectedProject.name}` : '')}
                    clientName={config.clientName || ''}
                    material={config.material || ''}
                    pieces={pieces}
                />
            </div>
                </>
            )}
        </div>
    );
};

export default OptimizationLayout;
