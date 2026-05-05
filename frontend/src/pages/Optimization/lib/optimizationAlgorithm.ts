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
    evaluateSequence: (indices: number[]) => { boards: Board[], score: number }
): { nextPopulation: number[][], bestInStep: { boards: Board[], score: number } } {
    const results = population.map(seq => evaluateSequence(seq));
    let bestInStep = results[0];
    results.forEach(res => { if (res.score > bestInStep.score) bestInStep = res; });

    const POPULATION_SIZE = population.length;
    const sortedIndices = results.map((r, i) => ({ r, i })).sort((a, b) => b.r.score - a.r.score).map(x => x.i);
    const nextGen: number[][] = [];

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
        
        let child: number[];

        // 90% Crossover, 10% direct copy
        if (Math.random() < 0.90) {
            const start = Math.floor(Math.random() * p1.length);
            const end = Math.floor(Math.random() * (p1.length - start)) + start;
            child = new Array(p1.length).fill(-1);
            for (let i = start; i <= end; i++) child[i] = p1[i];
            let p2Idx = 0;
            for (let i = 0; i < p1.length; i++) {
                if (child[i] === -1) {
                    while (child.includes(p2[p2Idx])) p2Idx++;
                    child[i] = p2[p2Idx];
                }
            }
        } else {
            child = [...p1];
        }

        // DIVERSE MUTATIONS (Aumentado al 40% para búsqueda exhaustiva)
        if (Math.random() < 0.40) {
            const mutType = Math.random();
            if (mutType < 0.50) {
                // 1. SWAP
                const i1 = Math.floor(Math.random() * child.length);
                const i2 = Math.floor(Math.random() * child.length);
                [child[i1], child[i2]] = [child[i2], child[i1]];
            } else if (mutType < 0.75) {
                // 2. REVERSE
                const start = Math.floor(Math.random() * child.length);
                const end = Math.floor(Math.random() * (child.length - start)) + start;
                const sub = child.slice(start, end + 1).reverse();
                for (let i = 0; i < sub.length; i++) child[start + i] = sub[i];
            } else {
                // 3. SCRAMBLE
                const i1 = Math.floor(Math.random() * child.length);
                const val = child.splice(i1, 1)[0];
                const i2 = Math.floor(Math.random() * child.length);
                child.splice(i2, 0, val);
            }
        }

        nextGen.push(child);
    }

    // 3. ENTROPY (Injection of new random individuals)
    // Aumentado a 35% para el entrenamiento para asegurar que NUNCA se detenga la variación
    const entropyCount = Math.floor(POPULATION_SIZE * 0.35); 
    for (let i = 0; i < entropyCount; i++) {
        const seq = [...population[0]];
        for (let j = seq.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [seq[j], seq[k]] = [seq[k], seq[j]];
        }
        nextGen[POPULATION_SIZE - 1 - i] = seq;
    }

    return { nextPopulation: nextGen, bestInStep };
}

export function optimizeCuttingMap(
    pieces: Piece[],
    boardWidth: number,
    boardHeight: number,
    config: OptimizationConfig
): Board[] {
    const { population, evaluateSequence } = prepareEvolution(pieces, boardWidth, boardHeight, config);
    let bestOverallBoards: Board[] = [], bestOverallScore = -Infinity, currentPopulation = population;
    for (let gen = 0; gen < 1000; gen++) { // Aumentado a 1000 para búsqueda profunda
        const { nextPopulation, bestInStep } = evolveStep(currentPopulation, boardWidth, boardHeight, config, evaluateSequence);
        if (bestInStep.score > bestOverallScore) {
            bestOverallScore = bestInStep.score;
            bestOverallBoards = JSON.parse(JSON.stringify(bestInStep.boards));
        }
        currentPopulation = nextPopulation;
    }
    return bestOverallBoards;
}

export function prepareEvolution(pieces: Piece[], boardWidth: number, boardHeight: number, config: OptimizationConfig, trainingMode: boolean = false) {
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
    const evaluateSequence = (indices: number[]): { boards: Board[], score: number } => {
        const activeBoards: Board[] = [];
        const boardsFreeSpace: Map<string, Rect[]> = new Map();
        const boardsMasterCutDir: Map<string, 'H' | 'V' | null> = new Map(); // Track dominant cut
        const simulatedItems = itemsToPlace.map(it => ({ ...it }));

        const createBoard = (): Board => {
            const b = { id: `board-${activeBoards.length + 1}`, width: boardWidth, height: boardHeight, placedPieces: [], usedArea: 0 };
            activeBoards.push(b);
            boardsFreeSpace.set(b.id, [{ x: config.trimming.left, y: config.trimming.top, w: boardWidth - config.trimming.left - config.trimming.right + kerf, h: boardHeight - config.trimming.top - config.trimming.bottom + kerf }]);
            boardsMasterCutDir.set(b.id, null);
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
                        let score = (wasteW * r.h) + (wasteH * r.w); 

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
                                if (isGlobalMasterH || isGlobalMasterV) {
                                    score -= 2000000000000000000; // 2,000,000T (Recompensa base masiva)
                                    
                                    // RECOMPENSA EXTRA: Consistencia de dirección global
                                    if (masterDir) {
                                        if ((masterDir === 'H' && isGlobalMasterH) || (masterDir === 'V' && isGlobalMasterV)) {
                                            score -= 8000000000000000000; // 8,000,000T (Bono por alineación perfecta)
                                        } else {
                                            score += 5000000000000000000; // 5,000,000T (Castigo por romper el sentido del tablero)
                                        }
                                    }
                                } else if (isBlockMasterH || isBlockMasterV) {
                                    // 2. RECOMPENSA: Corte Maestro de Bloque (Local)
                                    score -= 500000000000000000; // 500,000T
                                }

                                // 3. RECOMPENSA: Agrupar piezas idénticas
                                if (prevItem && (Math.abs(h - prevItem.h) < 1 || Math.abs(w - prevItem.w) < 1)) {
                                    score -= 200000000000000000; // 200,000T
                                }

                                // 4. CASTIGO EXTREMO: Corte en L (Dispersión)
                                if (wasteW > 2 && wasteH > 2) score += 9000000000000000000; // Casi infinito
                            } else {
                                // Lógica estándar
                                if (wasteW < 1) score -= 100000000000000;
                                if (wasteH < 1) score -= 100000000000000;
                                if (prevItem && (Math.abs(w - prevItem.w) < 1 || Math.abs(h - prevItem.h) < 1)) score -= 50000000000000;
                                if (wasteW > 1 && wasteH > 1) score += 500000000000000;
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
                if (rw < 1) { if (bh > 0.5) newFreeRects.push({ x: r.x, y: r.y + fh, w: r.w, h: bh }); }
                else if (bh < 1) { if (rw > 0.5) newFreeRects.push({ x: r.x + fw, y: r.y, w: rw, h: r.h }); }
                else if (rw * r.h >= bh * r.w) { newFreeRects.push({ x: r.x + fw, y: r.y, w: rw, h: r.h }); newFreeRects.push({ x: r.x, y: r.y + fh, w: fw, h: bh }); }
                else { newFreeRects.push({ x: r.x, y: r.y + fh, w: r.w, h: bh }); newFreeRects.push({ x: r.x + fw, y: r.y, w: rw, h: fh }); }
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

        // --- PHASE 2: Apply quality constraints only if we are at minimum boards ---
        let fitness: number;
        if (trainingMode) {
            // PRIORIDAD ENTRENAMIENTO: APROVECHAMIENTO MÁXIMO + CERTO
            // 1. Penalización masiva por tableros extra (Prioridad 1)
            const boardPenalty = activeBoards.length * 1000000000000000000000000000; 
            
            // 2. Bono por área total utilizada (Prioridad 2)
            let totalUsedArea = 0;
            activeBoards.forEach(b => totalUsedArea += b.usedArea);
            
            // 3. Calidad CERTO (Prioridad 3)
            // Dividimos por un factor para que el orden NO supere el beneficio de ahorrar un tablero entero.
            const qualityScore = totalLayoutScore / 5000; 

            fitness = (-boardPenalty) + (totalUsedArea * 10000000) - qualityScore;
        } else {
            if (activeBoards.length > 1) {
                fitness = (-activeBoards.length * 1000000000000000000) + (activeBoards[0]?.usedArea || 0);
            } else {
                fitness = (-activeBoards.length * 1000000000000000000) - totalLayoutScore;
            }
        }

        return { boards: activeBoards, score: fitness };
    };

    let population = Array.from({ length: 10000 }, () => {
        const seq = [...itemIndices];
        for (let i = seq.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [seq[i], seq[j]] = [seq[j], seq[i]];
        }
        return seq;
    });
    population[0] = [...itemIndices].sort((a, b) => (itemsToPlace[b].w * itemsToPlace[b].h) - (itemsToPlace[a].w * itemsToPlace[a].h));
    population[1] = [...itemIndices].sort((a, b) => Math.max(itemsToPlace[b].w, itemsToPlace[b].h) - Math.max(itemsToPlace[a].w, itemsToPlace[a].h));
    // Semilla CERTO: Agrupar por altura y luego ancho para favorecer tiras
    population[2] = [...itemIndices].sort((a, b) => {
        const diffH = itemsToPlace[b].h - itemsToPlace[a].h;
        if (Math.abs(diffH) > 1) return diffH;
        return itemsToPlace[b].w - itemsToPlace[a].w;
    });
    return { population, itemsToPlace, evaluateSequence };
}

export function safeFallbackPack(pieces: Piece[], boardWidth: number, boardHeight: number, config: OptimizationConfig): Board[] {
    return optimizeCuttingMap(pieces, boardWidth, boardHeight, { ...config, strategy: 'MAX_SAVINGS' });
}
