import type { Piece, OptimizationConfig } from '../types';

export interface PlacedPiece {
    id: string; // Unique ID per placed piece instance
    pieceTemplateId: string; // Reference to original Piece
    x: number;
    y: number;
    width: number; // Final visual width (cut size)
    height: number; // Final visual height (cut size)
    finalWidth: number; // Requested width (including banding)
    finalHeight: number; // Requested height (including banding)
    rotated: boolean;
    code: string;
    description: string;
    matchGrain: boolean;
    edgeBanding: {
        top: number;
        bottom: number;
        left: number;
        right: number;
    };
}

export interface Board {
    id: string;
    width: number;
    height: number;
    placedPieces: PlacedPiece[];
    usedArea: number;
    materialNumber?: string;
    materialLabel?: string;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type ItemToPlace = {
    template: Piece;
    w: number;
    h: number;
    cutW: number;
    cutH: number;
    index: number;
};

/**
 * Performs a single generation of evolution on a population.
 */
export function evolveStep(
    population: number[][],
    boardWidth: number,
    boardHeight: number,
    config: OptimizationConfig,
    evaluateSequence: (indices: number[], masterPref: 'H' | 'V', customWeights?: any) => { boards: Board[], score: number },
    customWeights?: any
): { nextPopulation: number[][], bestInStep: { boards: Board[], score: number } } {
    const results = population.map(seq => {
        const indices = seq.slice(0, -1);
        const pref = seq[seq.length - 1] === 0 ? 'H' : 'V';
        return { ...evaluateSequence(indices, pref, customWeights), chromosome: seq };
    });
    let bestInStep = results[0];
    results.forEach(res => { if (res.score > bestInStep.score) bestInStep = res; });

    const POPULATION_SIZE = population.length;
    const sortedIndices = results.map((r, i) => ({ r, i })).sort((a, b) => b.r.score - a.r.score).map(x => x.i);
    const nextGen: number[][] = [];

    // Return the best chromosome found in this step
    const bestChromosome = population[sortedIndices[0]];

    // 1. ELITISM (Keep top 2.5%)
    const eliteSize = Math.max(5, Math.floor(POPULATION_SIZE * 0.025));
    for (let e = 0; e < eliteSize; e++) {
        nextGen.push([...population[sortedIndices[e]]]);
    }

    // 2. EVOLUTION (OX Crossover + Diverse Mutations)
    const survivors = sortedIndices.slice(0, Math.floor(POPULATION_SIZE / 2));
    
    while (nextGen.length < POPULATION_SIZE) {
        const p1 = population[survivors[Math.floor(Math.random() * survivors.length)]];
        const p2 = population[survivors[Math.floor(Math.random() * survivors.length)]];
        
        let childIndices: number[];
        let childFlag: number;

        const p1Indices = p1.slice(0, -1);
        const p2Indices = p2.slice(0, -1);
        const p1Flag = p1[p1.length - 1];
        const p2Flag = p2[p2.length - 1];

        // 90% Crossover, 10% direct copy
        if (Math.random() < 0.90) {
            const len = p1Indices.length;
            const start = Math.floor(Math.random() * len);
            const end = Math.floor(Math.random() * (len - start)) + start;
            
            childIndices = new Array(len).fill(-1);
            for (let i = start; i <= end; i++) childIndices[i] = p1Indices[i];
            
            let p2Idx = 0;
            for (let i = 0; i < len; i++) {
                if (childIndices[i] === -1) {
                    while (childIndices.includes(p2Indices[p2Idx])) p2Idx++;
                    childIndices[i] = p2Indices[p2Idx];
                }
            }
            // El gen de dirección se hereda de uno de los padres o se mezcla
            childFlag = Math.random() < 0.5 ? p1Flag : p2Flag;
        } else {
            childIndices = [...p1Indices];
            childFlag = p1Flag;
        }

        // DIVERSE MUTATIONS (Aumentado al 60% para romper estancamientos)
        if (Math.random() < 0.60) {
            const mutType = Math.random();
            const len = childIndices.length;
            if (mutType < 0.35) {
                // 1. SWAP (Multiple swaps for more disruption)
                for (let k = 0; k < 2; k++) {
                    const i1 = Math.floor(Math.random() * len);
                    const i2 = Math.floor(Math.random() * len);
                    [childIndices[i1], childIndices[i2]] = [childIndices[i2], childIndices[i1]];
                }
            } else if (mutType < 0.65) {
                // 2. REVERSE
                const start = Math.floor(Math.random() * len);
                const end = Math.floor(Math.random() * (len - start)) + start;
                const sub = childIndices.slice(start, end + 1).reverse();
                for (let i = 0; i < sub.length; i++) childIndices[start + i] = sub[i];
            } else if (mutType < 0.85) {
                // 3. SCRAMBLE / INSERT
                const i1 = Math.floor(Math.random() * len);
                const val = childIndices.splice(i1, 1)[0];
                const i2 = Math.floor(Math.random() * len);
                childIndices.splice(i2, 0, val);
            } else {
                // 4. MUTACIÓN DEL GEN DE DIRECCIÓN (Más frecuente)
                childFlag = childFlag === 0 ? 1 : 0;
            }
        }

        nextGen.push([...childIndices, childFlag]);
    }

    // 3. ENTROPY (Injection of new random individuals)
    // Aumentado a 40% para el entrenamiento para asegurar que NUNCA se detenga la variación
    const entropyCount = Math.floor(POPULATION_SIZE * 0.40); 
    for (let i = 0; i < entropyCount; i++) {
        const seq = [...population[0]];
        // Shuffle indices completely
        for (let j = seq.length - 2; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [seq[j], seq[k]] = [seq[k], seq[j]];
        }
        // Randomize master preference
        seq[seq.length - 1] = Math.random() < 0.5 ? 0 : 1;
        nextGen[POPULATION_SIZE - 1 - i] = seq;
    }

    return { nextPopulation: nextGen, bestInStep: { ...bestInStep, chromosome: bestChromosome } };
}

export function optimizeCuttingMap(
    pieces: Piece[],
    boardWidth: number,
    boardHeight: number,
    config: OptimizationConfig,
    customWeights?: any
): Board[] {
    const { population, evaluateSequence } = prepareEvolution(pieces, boardWidth, boardHeight, config);
    let bestOverallBoards: Board[] = [], bestOverallScore = -Infinity, currentPopulation = population;
    for (let gen = 0; gen < 1000; gen++) { 
        const { nextPopulation, bestInStep } = evolveStep(currentPopulation, boardWidth, boardHeight, config, evaluateSequence, customWeights);
        if (bestInStep.score > bestOverallScore) {
            bestOverallScore = bestInStep.score;
            bestOverallBoards = JSON.parse(JSON.stringify(bestInStep.boards));
        }
        currentPopulation = nextPopulation;
    }
    return bestOverallBoards;
}

export function prepareEvolution(
    pieces: Piece[], 
    boardWidth: number, 
    boardHeight: number, 
    config: OptimizationConfig, 
    trainingMode: boolean = false,
    initialSeed?: number[]
) {
    const kerf = config.sawKerf;
    const itemsToPlace: ItemToPlace[] = [];
    pieces.forEach((p, idx) => {
        const cutW = Math.max(0, p.width - p.edgeBanding.left - p.edgeBanding.right);
        const cutH = Math.max(0, p.height - p.edgeBanding.top - p.edgeBanding.bottom);
        const swap = p.matchGrain && config.grainDirection === 'VERTICAL';
        const initialW = swap ? cutH : cutW, initialH = swap ? cutW : cutH;
        for (let i = 0; i < p.quantity; i++) itemsToPlace.push({ template: p, w: initialW + kerf, h: initialH + kerf, cutW: initialW, cutH: initialH, index: idx });
    });

    const itemIndices = itemsToPlace.map((_, i) => i);
    const evaluateSequence = (
        indices: number[], 
        masterPref: 'H' | 'V',
        customWeights?: any
    ): { boards: Board[], score: number } => {
        const activeBoards: Board[] = [];
        const boardsFreeSpace: Map<string, Rect[]> = new Map();
        const boardsMasterCutDir: Map<string, 'H' | 'V' | null> = new Map(); 
        const simulatedItems = itemsToPlace.map(it => ({ ...it }));

        // Pesos dinámicos del cerebro (Meta-Aprendizaje)
        const W = customWeights || {
            fragmentation_penalty: 2000000000000000,
            family_grouping_bonus: 8000000000000000000,
            guillotine_consistency: 18000000000000000000,
            master_cut_reward: 6000000000000000000,
            l_cut_penalty: 25000000000000000000,
            rotation_bonus: 2000000000000
        };

        const createBoard = (): Board => {
            const b = { id: `board-${activeBoards.length + 1}`, width: boardWidth, height: boardHeight, placedPieces: [], usedArea: 0 };
            activeBoards.push(b);
            boardsFreeSpace.set(b.id, [{ x: config.trimming.left, y: config.trimming.top, w: boardWidth - config.trimming.left - config.trimming.right + kerf, h: boardHeight - config.trimming.top - config.trimming.bottom + kerf }]);
            // Usamos la preferencia genética para el tablero inicial
            boardsMasterCutDir.set(b.id, trainingMode ? masterPref : null);
            return b;
        };

        const placeInBoard = (board: Board, item: any, prevItem?: any, ignoreQuality: boolean = false) => {
            const freeRects = boardsFreeSpace.get(board.id) || [];
            const masterDir = boardsMasterCutDir.get(board.id);
            let bestRectIndex = -1, bestRotated = false, bestScore = Infinity, bestIsMasterH = false, bestIsMasterV = false;

            for (let i = 0; i < freeRects.length; i++) {
                const r = freeRects[i];
                const evalRot = (w: number, h: number, isRotated: boolean) => {
                    if (w <= r.w + 0.1 && h <= r.h + 0.1) {
                        const wasteW = r.w - w, wasteH = r.h - h;
                        
                        // --- BASE SCORE: Minimizamos desperdicio local ---
                        let score = (wasteW * r.h) + (wasteH * r.w); 

                        // --- RECOMPENSA POR ROTACIÓN ---
                        // Premiamos la rotación para explorar orientaciones que puedan desbloquear 
                        // mejores agrupaciones de espacio, especialmente en piezas rectangulares.
                        if (isRotated) {
                            score -= W.rotation_bonus; 
                        }

                        // --- BIAS POSICIONAL: Esquina Inferior Izquierda ---
                        // Queremos Y máximo (abajo) y X mínimo (izquierda)
                        // Invertimos Y en el score: a mayor Y, menor score.
                        score += (boardHeight - (r.y + h)) * 2000000; 
                        score += r.x * 100000;

                        if (!ignoreQuality) {
                            if (trainingMode) {
                                // --- LÓGICA CERTO ULTRA (SOLO ENTRENAMIENTO) ---
                                // Detectamos si el corte atraviesa el tablero COMPLETO (Global Master Cut)
                                const isGlobalMasterH = Math.abs(r.w - (boardWidth - config.trimming.left - config.trimming.right + kerf)) < 1 && wasteW < 0.5;
                                const isGlobalMasterV = Math.abs(r.h - (boardHeight - config.trimming.top - config.trimming.bottom + kerf)) < 1 && wasteH < 0.5;
                                
                                // Detectamos si es un corte maestro dentro de su bloque actual
                                const isBlockMasterH = wasteW < 0.5;
                                const isBlockMasterV = wasteH < 0.5;

                                // 1. RECOMPENSA: Corte Maestro Global (Atraviesa todo el tablero)
                                // Ahora permitimos que sea H o V dinámicamente para "jugar" con la dirección
                                if (isGlobalMasterH || isGlobalMasterV) {
                                    score -= W.master_cut_reward; 
                                    
                                    // RECOMPENSA EXTRA: Consistencia de dirección global
                                    // Aumentamos la flexibilidad: un pequeño porcentaje (5%) ignora el patrón 
                                    // para "ir contra corriente" y explorar layouts disruptivos.
                                    const goesAgainstFlow = trainingMode && Math.random() < 0.05;

                                    if (masterDir && !goesAgainstFlow) {
                                        if ((masterDir === 'H' && isGlobalMasterH) || (masterDir === 'V' && isGlobalMasterV)) {
                                            score -= W.guillotine_consistency; 
                                        } else {
                                            score += (W.guillotine_consistency * 0.8); 
                                        }
                                    } else if (goesAgainstFlow) {
                                        // Bonus por "exploración disruptiva"
                                        score -= 2000000000000000000;
                                    }
                                } else if (isBlockMasterH || isBlockMasterV) {
                                    // 2. RECOMPENSA: Corte Maestro de Bloque (Local)
                                    score -= 1000000000000000000; // 1,000,000T
                                }

                                // 3. RECOMPENSA: Agrupar piezas idénticas o de medidas similares (Agrupación por Familias)
                                if (prevItem) {
                                    const matchH = Math.abs(h - prevItem.h) < 0.5;
                                    const matchW = Math.abs(w - prevItem.w) < 0.5;
                                    const isSameTemplate = item.template.id === prevItem.template.id;

                                    if (isSameTemplate) {
                                        score -= W.family_grouping_bonus; 
                                    } else if (matchH || matchW) {
                                        score -= (W.family_grouping_bonus * 0.6); 
                                    }
                                }

                                // 4. CASTIGO EXTREMO: Corte en L (Dispersión)
                                if (wasteW > 2 && wasteH > 2) {
                                    score += W.l_cut_penalty; 
                                }
                            } else {
                                // Lógica estándar reforzada
                                if (wasteW < 1) score -= 150000000000000;
                                if (wasteH < 1) score -= 150000000000000;
                                if (prevItem && (Math.abs(h - prevItem.h) < 1 || Math.abs(w - prevItem.w) < 1)) score -= 150000000000000;
                                if (wasteW > 1 && wasteH > 1) score += 1000000000000000;
                            }
                        }

                        if (score < bestScore) { 
                            bestScore = score; bestRectIndex = i; bestRotated = isRotated; 
                            bestIsMasterH = wasteW < 0.5; bestIsMasterV = wasteH < 0.5;
                        }
                    }
                };
                evalRot(item.w, item.h, false);
                if (!item.template.matchGrain && Math.abs(item.w - item.h) > 0.1) evalRot(item.h, item.w, true);
            }

            if (bestRectIndex !== -1) {
                // Update master direction if not set
                if (trainingMode && !masterDir) {
                    if (bestIsMasterH) boardsMasterCutDir.set(board.id, 'H');
                    else if (bestIsMasterV) boardsMasterCutDir.set(board.id, 'V');
                }
                
                const r = freeRects[bestRectIndex], fw = bestRotated ? item.h : item.w, fh = bestRotated ? item.w : item.h;
                item.w = fw; item.h = fh; 
                const newFreeRects = [...freeRects];
                newFreeRects.splice(bestRectIndex, 1);
                
                const rw = r.w - fw, bh = r.h - fh;
                // --- LÓGICA DE CORTE GUILLOTINA DINÁMICA ---
                if (rw < 0.5) { 
                    if (bh > 0.5) newFreeRects.push({ x: r.x, y: r.y + fh, w: r.w, h: bh }); 
                }
                else if (bh < 0.5) { 
                    if (rw > 0.5) newFreeRects.push({ x: r.x + fw, y: r.y, w: rw, h: r.h }); 
                }
                else {
                    // Elegimos el sentido de corte basado en la dirección maestra del tablero
                    if (masterDir === 'V') {
                        // Corte Vertical Primero: el sobrante principal queda a la derecha (columna)
                        newFreeRects.push({ x: r.x + fw, y: r.y, w: rw, h: r.h }); 
                        newFreeRects.push({ x: r.x, y: r.y + fh, w: fw, h: bh });
                    } else {
                        // Corte Horizontal Primero: el sobrante principal queda arriba (fila)
                        newFreeRects.push({ x: r.x, y: r.y + fh, w: r.w, h: bh }); 
                        newFreeRects.push({ x: r.x + fw, y: r.y, w: rw, h: fh });
                    }
                }
                return { rect: { x: r.x, y: r.y, w: fw, h: fh }, newFreeRects, rotated: bestRotated, score: bestScore };
            }
            return null;
        };

        let lastItem: any, totalLayoutScore = 0;
        
        // --- PHASE 1: Find ANY way to fit pieces in minimum boards ---
        // We use a simplified placement logic to find a valid packing first.
        for (const idx of indices) {
            const item = simulatedItems[idx];
            let placed = false;
            if (activeBoards.length === 0) createBoard();
            for (const b of activeBoards) {
                const res = placeInBoard(b, item, lastItem, trainingMode ? false : true); 
                if (res) {
                    totalLayoutScore += res.score;
                    b.placedPieces.push({
                        id: `${item.template.id}-${Math.random().toString(36).substr(2, 9)}`, pieceTemplateId: item.template.id,
                        x: res.rect.x, y: res.rect.y, width: res.rotated ? item.cutH : item.cutW, height: res.rotated ? item.cutW : item.cutH,
                        finalWidth: res.rotated ? item.template.height : item.template.width, finalHeight: res.rotated ? item.template.width : item.template.height,
                        rotated: res.rotated, code: item.template.code, description: item.template.description, matchGrain: !!item.template.matchGrain,
                        edgeBanding: res.rotated ? { top: item.template.edgeBanding.left, bottom: item.template.edgeBanding.right, left: item.template.edgeBanding.bottom, right: item.template.edgeBanding.top } : item.template.edgeBanding,
                    });
                    b.usedArea += (item.cutW * item.cutH);
                    boardsFreeSpace.set(b.id, res.newFreeRects);
                    lastItem = item; placed = true; break;
                }
            }
            if (!placed) {
                const nb = createBoard();
                const res = placeInBoard(nb, item, undefined, trainingMode ? false : true);
                if (res) {
                    totalLayoutScore += res.score;
                    nb.placedPieces.push({
                        id: `${item.template.id}-${Math.random().toString(36).substr(2, 9)}`, pieceTemplateId: item.template.id,
                        x: res.rect.x, y: res.rect.y, width: res.rotated ? item.cutH : item.cutW, height: res.rotated ? item.cutW : item.cutH,
                        finalWidth: res.rotated ? item.template.height : item.template.width, finalHeight: res.rotated ? item.template.width : item.template.height,
                        rotated: res.rotated, code: item.template.code, description: item.template.description, matchGrain: !!item.template.matchGrain,
                        edgeBanding: res.rotated ? { top: item.template.edgeBanding.left, bottom: item.template.edgeBanding.right, left: item.template.edgeBanding.bottom, right: item.template.edgeBanding.top } : item.template.edgeBanding,
                    });
                    nb.usedArea += (item.cutW * item.cutH);
                    boardsFreeSpace.set(nb.id, res.newFreeRects);
                    lastItem = item;
                }
            }
        }

        // --- PHASE 3: Compactness & Leftover Consolidation ---
        let fitness: number;
        let compactnessBonus = 0;

        if (trainingMode) {
            // Evaluamos la calidad del "sobrante". Queremos que el espacio no usado sea un solo bloque grande.
            activeBoards.forEach(b => {
                const freeRects = boardsFreeSpace.get(b.id) || [];
                if (freeRects.length > 0) {
                    const maxFreeArea = Math.max(...freeRects.map(r => r.w * r.h));
                    const totalFreeArea = (boardWidth * boardHeight) - b.usedArea;
                    
                    // RECOMPENSA MASIVA por consolidación de sobrantes
                    if (maxFreeArea > totalFreeArea * 0.85) {
                        compactnessBonus += 5000000000000000; // 5,000,000,000T
                    }
                    compactnessBonus += maxFreeArea * 5000000;
                }
                // PENALIZACIÓN EXTREMA por fragmentación (cada rectángulo libre extra resta mucho)
                compactnessBonus -= (freeRects.length * W.fragmentation_penalty); 
            });

            // PRIORIDAD ENTRENAMIENTO: APROVECHAMIENTO MÁXIMO + CERTO + COMPACIDAD
            const boardPenalty = activeBoards.length * 1000000000000000000000000000; 
            let totalUsedArea = 0;
            activeBoards.forEach(b => totalUsedArea += b.usedArea);
            
            const qualityScore = totalLayoutScore / 5000; 
            fitness = (-boardPenalty) + (totalUsedArea * 10000000) - qualityScore + compactnessBonus;
        } else {
            if (activeBoards.length > 1) {
                fitness = (-activeBoards.length * 1000000000000000000) + (activeBoards[0]?.usedArea || 0);
            } else {
                fitness = (-activeBoards.length * 1000000000000000000) - totalLayoutScore;
            }
        }

        return { boards: activeBoards, score: fitness };
    };

    let population = Array.from({ length: 2000 }, (_, popIdx) => {
        const seq = [...itemIndices];
        for (let i = seq.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [seq[i], seq[j]] = [seq[j], seq[i]];
        }
        // GEN DE DIRECCIÓN MAESTRA: 50% Horizontal (0), 50% Vertical (1)
        const masterDirGene = popIdx < 1000 ? 0 : 1;
        return [...seq, masterDirGene];
    });
    
    // Si tenemos una semilla previa (la "élite de la élite"), la inyectamos como individuo 0
    if (initialSeed && initialSeed.length === itemIndices.length + 1) {
        population[0] = [...initialSeed];
    } else {
        population[0] = [...itemIndices].sort((a, b) => (itemsToPlace[b].w * itemsToPlace[b].h) - (itemsToPlace[a].w * itemsToPlace[a].h));
        population[0].push(0); // Elite H
    }
    
    population[1] = [...itemIndices].sort((a, b) => Math.max(itemsToPlace[b].w, itemsToPlace[b].h) - Math.max(itemsToPlace[a].w, itemsToPlace[a].h));
    population[1].push(1); // Elite V
    
    // Semilla CERTO: Agrupar por altura y luego ancho para favorecer tiras
    population[2] = [...itemIndices].sort((a, b) => {
        const diffH = itemsToPlace[b].h - itemsToPlace[a].h;
        if (Math.abs(diffH) > 1) return diffH;
        return itemsToPlace[b].w - itemsToPlace[a].w;
    });
    population[2].push(0); // Certo H
    
    return { population, itemsToPlace, evaluateSequence };
}

export function safeFallbackPack(pieces: Piece[], boardWidth: number, boardHeight: number, config: OptimizationConfig): Board[] {
    return optimizeCuttingMap(pieces, boardWidth, boardHeight, { ...config, strategy: 'MAX_SAVINGS' });
}
