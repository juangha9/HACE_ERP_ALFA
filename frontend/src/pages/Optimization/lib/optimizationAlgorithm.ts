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
    /** Si TRUE la pieza tiene veta y NO puede rotarse — ni con la tecla R en
     *  modo manual ni por la optimización. Se hereda de Piece.matchGrain (que
     *  a su vez puede provenir de la columna `veta` del custom_board del
     *  material elegido para esta pieza). */
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
    materialNumber?: string;  // The MAT. number that this board belongs to
    materialLabel?: string;   // Human-readable material name for display
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

type ItemToPlace = {
    template: Piece;
    w: number;     // width including sawKerf
    h: number;     // height including sawKerf
    cutW: number;  // visual cut width (no kerf)
    cutH: number;  // visual cut height (no kerf)
    index: number;
};

/**
 * Strip-based packing for SIMPLE_CUTS strategy.
 *
 * Produces the minimum number of straight, full-width guillotine cuts:
 *   1. One horizontal cut per strip boundary (spans entire board width)
 *   2. Sequential vertical cuts within each strip to separate individual pieces
 *
 * Pieces of equal height are grouped into the same strip. The saw operator
 * makes one rip cut per strip, then crosscuts each piece in sequence.
 */
function runStripPacking(
    items: ItemToPlace[],
    boardWidth: number,
    boardHeight: number,
    config: OptimizationConfig
): Board[] {
    // SIMPLE_CUTS con guillotina horizontal-prioritaria.
    //
    // Antes era strip-packing puro: el primer corte horizontal definía la
    // altura del strip y dentro de él solo se acumulaban piezas a la derecha.
    // Si una pieza tenía altura menor a la del strip, todo el offcut debajo
    // quedaba sin usar (ej.: tras una pieza alta se desperdiciaba la columna
    // derecha). Ahora cada slot vacío del tablero se sigue como rectángulo
    // libre y se sub-divide al colocar una pieza:
    //   1. Slot derecho del slot original, conserva la altura completa.
    //   2. Slot inferior, debajo de la pieza, con el ancho de la pieza.
    // Las piezas se ordenan por altura desc (sort en optimizeCuttingMap), así
    // las primeras en cada slot fijan una altura "tipo strip" y las cortas
    // posteriores caben en los slots inferiores. Los cortes siguen siendo
    // rectos (guillotina pura) — solo se requieren cortes adicionales para
    // separar el offcut, lo cual es aceptable a cambio de mejor utilización.
    const useHorizontalStrips = config.cutDirection !== 'VERTICAL';

    const usableAcross = (useHorizontalStrips
        ? boardWidth  - config.trimming.left - config.trimming.right
        : boardHeight - config.trimming.top  - config.trimming.bottom
    ) + config.sawKerf;

    const usableAlong = (useHorizontalStrips
        ? boardHeight - config.trimming.top  - config.trimming.bottom
        : boardWidth  - config.trimming.left - config.trimming.right
    ) + config.sawKerf;

    interface Slot {
        x: number;  // across offset within usable area (relative al borde de trimming)
        y: number;  // along offset within usable area
        w: number;  // capacidad across (incluye kerf)
        h: number;  // capacidad along  (incluye kerf)
    }

    const activeBoards: Board[] = [];
    const boardSlots = new Map<string, Slot[]>();

    const createNewBoard = (): Board => {
        const board: Board = {
            id: `board-${activeBoards.length + 1}`,
            width: boardWidth,
            height: boardHeight,
            placedPieces: [],
            usedArea: 0,
        };
        activeBoards.push(board);
        boardSlots.set(board.id, [{ x: 0, y: 0, w: usableAcross, h: usableAlong }]);
        return board;
    };

    const tryPlaceInBoard = (board: Board, item: ItemToPlace): boolean => {
        const dimAcross = useHorizontalStrips ? item.w : item.h;
        const dimAlong  = useHorizontalStrips ? item.h : item.w;
        const cutAcross = useHorizontalStrips ? item.cutW : item.cutH;
        const cutAlong  = useHorizontalStrips ? item.cutH : item.cutW;

        const slots = boardSlots.get(board.id);
        if (!slots) return false;

        // Best-fit: elegir el slot con menos desperdicio donde la pieza entra.
        // Esto agrupa piezas similares en el mismo "strip" lógico (altura del
        // primer slot que las acepta) y reserva slots grandes para piezas
        // grandes posteriores.
        let bestIdx = -1;
        let bestWaste = Infinity;
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (dimAcross <= s.w + 0.5 && dimAlong <= s.h + 0.5) {
                const waste = (s.w * s.h) - (dimAcross * dimAlong);
                if (waste < bestWaste) {
                    bestWaste = waste;
                    bestIdx = i;
                }
            }
        }
        if (bestIdx < 0) return false;
        const slot = slots[bestIdx];

        // Posición absoluta en el tablero.
        const x = useHorizontalStrips
            ? config.trimming.left + slot.x
            : config.trimming.left + slot.y;
        const y = useHorizontalStrips
            ? config.trimming.top  + slot.y
            : config.trimming.top  + slot.x;

        const pieceVisualW = useHorizontalStrips ? cutAcross : cutAlong;
        const pieceVisualH = useHorizontalStrips ? cutAlong  : cutAcross;

        board.placedPieces.push({
            id: `${item.template.id}-${board.placedPieces.length}`,
            pieceTemplateId: item.template.id,
            x,
            y,
            width:       pieceVisualW,
            height:      pieceVisualH,
            finalWidth:  item.template.width,
            finalHeight: item.template.height,
            rotated:     false,
            matchGrain:  !!item.template.matchGrain,
            code:        item.template.code,
            description: item.template.description,
            edgeBanding: item.template.edgeBanding,
        });
        board.usedArea += item.cutW * item.cutH;

        // Split guillotina con preferencia horizontal:
        //   - rightSlot: a la derecha de la pieza con la altura COMPLETA del slot.
        //   - bottomSlot: debajo de la pieza, solo con el ancho de la pieza.
        // Esto reserva la "columna derecha" como una franja continua para más
        // piezas tipo strip, y aprovecha el espacio bajo piezas cortas.
        const rightSlot:  Slot = { x: slot.x + dimAcross, y: slot.y,            w: slot.w - dimAcross, h: slot.h };
        const bottomSlot: Slot = { x: slot.x,             y: slot.y + dimAlong, w: dimAcross,          h: slot.h - dimAlong };

        slots.splice(bestIdx, 1);
        if (rightSlot.w  > 0.5 && rightSlot.h  > 0.5) slots.push(rightSlot);
        if (bottomSlot.w > 0.5 && bottomSlot.h > 0.5) slots.push(bottomSlot);

        return true;
    };

    for (const item of items) {
        let placed = false;
        for (const board of activeBoards) {
            if (tryPlaceInBoard(board, item)) { placed = true; break; }
        }
        if (!placed) {
            const newBoard = createNewBoard();
            tryPlaceInBoard(newBoard, item);
        }
    }

    return activeBoards;
}

/**
 * Scores placements by leftover area (Best Area Fit) to maximise material utilisation.
 * Implementation: Genetic Algorithm for global sequence optimization.
 */
export function optimizeCuttingMap(
    pieces: Piece[],
    boardWidth: number,
    boardHeight: number,
    config: OptimizationConfig
): Board[] {
    const kerf = config.sawKerf;

    // ── STEP 1: PREPARE ITEMS ──
    const itemsToPlace: ItemToPlace[] = [];
    pieces.forEach((p, idx) => {
        const cutW = Math.max(0, p.width  - p.edgeBanding.left - p.edgeBanding.right);
        const cutH = Math.max(0, p.height - p.edgeBanding.top  - p.edgeBanding.bottom);

        // Pre-calculate grain swap if necessary
        const shouldSwapForGrain = p.matchGrain && config.grainDirection === 'VERTICAL';
        const initialW = shouldSwapForGrain ? cutH : cutW;
        const initialH = shouldSwapForGrain ? cutW : cutH;

        for (let i = 0; i < p.quantity; i++) {
            itemsToPlace.push({
                template: p,
                w: initialW + kerf,
                h: initialH + kerf,
                cutW: initialW,
                cutH: initialH,
                index: idx,
            });
        }
    });

    // Route SIMPLE_CUTS immediately
    if (config.strategy === 'SIMPLE_CUTS') {
        itemsToPlace.sort((a, b) => {
            if (a.template.code !== b.template.code) return a.template.code.localeCompare(b.template.code);
            const stripA = config.cutDirection === 'VERTICAL' ? a.w : a.h;
            const stripB = config.cutDirection === 'VERTICAL' ? b.w : b.h;
            if (Math.abs(stripB - stripA) > 0.5) return stripB - stripA;
            const acrossA = config.cutDirection === 'VERTICAL' ? a.h : a.w;
            const acrossB = config.cutDirection === 'VERTICAL' ? b.h : b.w;
            return acrossB - acrossA;
        });
        return runStripPacking(itemsToPlace, boardWidth, boardHeight, config);
    }

    // ── GENETIC ALGORITHM PARAMETERS (Eternal Search) ──
    const POPULATION_SIZE = 5000; 
    const GENERATIONS = 120; // 600,000 evaluations per click
    const MUTATION_RATE = 0.5;

    let bestOverallBoards: Board[] = [];
    let bestOverallScore = -Infinity;

    const itemIndices = itemsToPlace.map((_, i) => i);

    // ── HELPER: EVALUATE A SEQUENCE ──
    const evaluateSequence = (indices: number[]): { boards: Board[], score: number } => {
        const activeBoards: Board[] = [];
        const boardsFreeSpace: Map<string, Rect[]> = new Map();
        const simulatedItems = itemsToPlace.map(it => ({ ...it }));

        const createBoard = (): Board => {
            const b = {
                id: `board-${activeBoards.length + 1}`,
                width: boardWidth,
                height: boardHeight,
                placedPieces: [],
                usedArea: 0,
            };
            activeBoards.push(b);
            boardsFreeSpace.set(b.id, [{
                x: config.trimming.left,
                y: config.trimming.top,
                w: boardWidth - config.trimming.left - config.trimming.right + kerf,
                h: boardHeight - config.trimming.top - config.trimming.bottom + kerf,
            }]);
            return b;
        };

        const placeInBoard = (board: Board, item: any, prevItem?: any) => {
            const freeRects = boardsFreeSpace.get(board.id) || [];
            let bestRectIndex = -1;
            let bestRotated = false;
            let bestScore = Infinity;

            for (let i = 0; i < freeRects.length; i++) {
                const r = freeRects[i];
                const evalRot = (w: number, h: number, isRotated: boolean) => {
                    if (w <= r.w + 0.1 && h <= r.h + 0.1) {
                        const wasteW = r.w - w;
                        const wasteH = r.h - h;
                        let score = (wasteW * r.h) + (wasteH * r.w); 

                        // 1. MASTER BAND CONTINUITY (The "Corte Certo" look)
                        const isFullWidth = wasteW < 1.2;
                        const isFullHeight = wasteH < 1.2;
                        if (isFullWidth || isFullHeight) score -= 1000000000;

                        // 2. SAME SIZE GROUPING (Horizontal or Vertical rows)
                        if (prevItem) {
                            const matchW = Math.abs(w - prevItem.w) < 1;
                            const matchH = Math.abs(h - prevItem.h) < 1;
                            if (matchW || matchH) score -= 500000000;
                        }

                        // 3. STAIRCASE L-CUT PREVENTION
                        if (wasteW > 1.5 && wasteW < 300) score += 100000000;
                        if (wasteH > 1.5 && wasteH < 300) score += 100000000;

                        if (score < bestScore) {
                            bestScore = score;
                            bestRectIndex = i;
                            bestRotated = isRotated;
                        }
                    }
                };
                evalRot(item.w, item.h, false);
                if (!item.template.matchGrain && Math.abs(item.w - item.h) > 0.5) evalRot(item.h, item.w, true);
            }

            if (bestRectIndex !== -1) {
                const r = freeRects[bestRectIndex];
                const fw = bestRotated ? item.h : item.w;
                const fh = bestRotated ? item.w : item.h;
                item.w = fw; item.h = fh; 

                const newFreeRects = [...freeRects];
                newFreeRects.splice(bestRectIndex, 1);
                
                const rw = r.w - fw;
                const bh = r.h - fh;
                
                // Force Clean Strips
                if (rw < 1.2) {
                    if (bh > 0.5) newFreeRects.push({ x: r.x, y: r.y + fh, w: r.w, h: bh });
                } else if (bh < 1.2) {
                    if (rw > 0.5) newFreeRects.push({ x: r.x + fw, y: r.y, w: rw, h: r.h });
                } else if (rw * r.h >= bh * r.w) {
                    newFreeRects.push({ x: r.x + fw, y: r.y, w: rw, h: r.h });
                    newFreeRects.push({ x: r.x, y: r.y + fh, w: fw, h: bh });
                } else {
                    newFreeRects.push({ x: r.x, y: r.y + fh, w: r.w, h: bh });
                    newFreeRects.push({ x: r.x + fw, y: r.y, w: rw, h: fh });
                }
                return { rect: { x: r.x, y: r.y, w: fw, h: fh }, newFreeRects, rotated: bestRotated };
            }
            return null;
        };

        let lastItem: any;
        for (const idx of indices) {
            const item = simulatedItems[idx];
            let placed = false;
            if (activeBoards.length === 0) createBoard();
            
            for (const b of activeBoards) {
                const res = placeInBoard(b, item, lastItem);
                if (res) {
                    b.placedPieces.push({
                        id: `${item.template.id}-${Math.random().toString(36).substr(2, 9)}`,
                        pieceTemplateId: item.template.id,
                        x: res.rect.x, y: res.rect.y,
                        width: res.rotated ? item.cutH : item.cutW,
                        height: res.rotated ? item.cutW : item.cutH,
                        finalWidth: res.rotated ? item.template.height : item.template.width,
                        finalHeight: res.rotated ? item.template.width : item.template.height,
                        rotated: res.rotated,
                        code: item.template.code,
                        description: item.template.description,
                        matchGrain: !!item.template.matchGrain,
                        edgeBanding: res.rotated ? {
                            top: item.template.edgeBanding.left,
                            bottom: item.template.edgeBanding.right,
                            left: item.template.edgeBanding.bottom,
                            right: item.template.edgeBanding.top,
                        } : item.template.edgeBanding,
                    });
                    b.usedArea += (item.cutW * item.cutH);
                    boardsFreeSpace.set(b.id, res.newFreeRects);
                    lastItem = item;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                const nb = createBoard();
                const res = placeInBoard(nb, item, undefined);
                if (res) {
                    nb.placedPieces.push({
                        id: `${item.template.id}-${Math.random().toString(36).substr(2, 9)}`,
                        pieceTemplateId: item.template.id,
                        x: res.rect.x, y: res.rect.y,
                        width: res.rotated ? item.cutH : item.cutW,
                        height: res.rotated ? item.cutW : item.cutH,
                        finalWidth: res.rotated ? item.template.height : item.template.width,
                        finalHeight: res.rotated ? item.template.width : item.template.height,
                        rotated: res.rotated,
                        code: item.template.code,
                        description: item.template.description,
                        matchGrain: !!item.template.matchGrain,
                        edgeBanding: res.rotated ? {
                            top: item.template.edgeBanding.left,
                            bottom: item.template.edgeBanding.right,
                            left: item.template.edgeBanding.bottom,
                            right: item.template.edgeBanding.top,
                        } : item.template.edgeBanding,
                    });
                    nb.usedArea += (item.cutW * item.cutH);
                    boardsFreeSpace.set(nb.id, res.newFreeRects);
                    lastItem = item;
                }
            }
        }

        const fitness = -activeBoards.length * 10000000000000 + (activeBoards[0]?.usedArea || 0);
        return { boards: activeBoards, score: fitness };
    };

    // ── INITIAL POPULATION ──
    let population = Array.from({ length: POPULATION_SIZE }, () => {
        const seq = [...itemIndices];
        for (let i = seq.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [seq[i], seq[j]] = [seq[j], seq[i]];
        }
        return seq;
    });

    // Strategy 1: Sorting by Area
    population[0] = [...itemIndices].sort((a, b) => {
        const itemA = itemsToPlace[a];
        const itemB = itemsToPlace[b];
        return (itemB.w * itemB.h) - (itemA.w * itemA.h);
    });

    // Strategy 2: Sorting by Dimension (Height/Width)
    population[1] = [...itemIndices].sort((a, b) => {
        const itemA = itemsToPlace[a];
        const itemB = itemsToPlace[b];
        return Math.max(itemB.w, itemB.h) - Math.max(itemA.w, itemA.h);
    });

    // EVOLUTIONARY LOOP
    for (let gen = 0; gen < GENERATIONS; gen++) {
        const results = population.map(seq => evaluateSequence(seq));
        
        results.forEach((res) => {
            if (res.score > bestOverallScore) {
                bestOverallScore = res.score;
                bestOverallBoards = JSON.parse(JSON.stringify(res.boards));
            }
        });

        const sortedIndices = results.map((r, i) => ({ r, i }))
            .sort((a, b) => b.r.score - a.r.score)
            .map(x => x.i);

        const survivalCount = Math.floor(POPULATION_SIZE / 2);
        const winners = sortedIndices.slice(0, survivalCount);
        
        const nextGen = [];
        // Keep top Elite
        for (let e = 0; e < 100; e++) nextGen.push(population[sortedIndices[e]]);

        while (nextGen.length < POPULATION_SIZE) {
            const parentIndex = winners[Math.floor(Math.random() * winners.length)];
            const child = [...population[parentIndex]];
            
            if (Math.random() < MUTATION_RATE) {
                const i1 = Math.floor(Math.random() * child.length);
                const i2 = Math.floor(Math.random() * child.length);
                [child[i1], child[i2]] = [child[i2], child[i1]];
            }
            nextGen.push(child);
        }
        population = nextGen;
    }

    return bestOverallBoards;
}

/**
 * Fallback algorithm used if the main optimizer is interrupted or needs a quick result.
 */
export function safeFallbackPack(
    pieces: Piece[],
    boardWidth: number,
    boardHeight: number,
    config: OptimizationConfig
): Board[] {
    // Simple one-pass MAX_SAVINGS strategy as a safe fallback
    return optimizeCuttingMap(pieces, boardWidth, boardHeight, { 
        ...config, 
        strategy: 'MAX_SAVINGS' 
    });
}
