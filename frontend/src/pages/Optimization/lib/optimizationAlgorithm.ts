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
 * Guillotine 2D Bin Packing — used by MAX_SAVINGS strategy.
 * Scores placements by leftover area (Best Area Fit) to maximise material utilisation.
 */
export function optimizeCuttingMap(
    pieces: Piece[],
    boardWidth: number,
    boardHeight: number,
    config: OptimizationConfig
): Board[] {

    // Unroll pieces by quantity
    const itemsToPlace: ItemToPlace[] = [];
    pieces.forEach((p, idx) => {
        const cutW = Math.max(0, p.width  - p.edgeBanding.left - p.edgeBanding.right);
        const cutH = Math.max(0, p.height - p.edgeBanding.top  - p.edgeBanding.bottom);

        const shouldSwapForGrain = p.matchGrain && config.grainDirection === 'VERTICAL';

        const finalW = shouldSwapForGrain ? cutH : cutW;
        const finalH = shouldSwapForGrain ? cutW : cutH;

        for (let i = 0; i < p.quantity; i++) {
            itemsToPlace.push({
                template: p,
                w: finalW + config.sawKerf,
                h: finalH + config.sawKerf,
                cutW: finalW,
                cutH: finalH,
                index: idx,
            });
        }
    });
    // Route SIMPLE_CUTS immediately (no multi-pass needed)
    if (config.strategy === 'SIMPLE_CUTS') {
        itemsToPlace.sort((a, b) => {
            const stripA = config.cutDirection === 'VERTICAL' ? a.w : a.h;
            const stripB = config.cutDirection === 'VERTICAL' ? b.w : b.h;
            if (Math.abs(stripB - stripA) > 0.5) return stripB - stripA;
            const acrossA = config.cutDirection === 'VERTICAL' ? a.h : a.w;
            const acrossB = config.cutDirection === 'VERTICAL' ? b.h : b.w;
            return acrossB - acrossA;
        });
        return runStripPacking(itemsToPlace, boardWidth, boardHeight, config, 'STRIP');
    }

    // ── METAHEURISTIC MULTI-PASS OPTIMIZATION (SIMULATED ANNEALING) ──
    const PASSES = config.strategy === 'BALANCED' ? 50 : 1; // 50 attempts for perfect tetris
    let bestOverallBoards: Board[] = [];
    let bestOverallScore = -Infinity;

    for (let pass = 0; pass < PASSES; pass++) {
        let currentItemsToPlace = itemsToPlace.map(item => ({...item, isBasePiece: false}));

        if (true) {

            currentItemsToPlace.sort((a, b) => {
                const areaA = a.w * a.h;
                const areaB = b.w * b.h;
                return areaB - areaA; // Always sort strictly by area descending!
            });
            if (pass > 0) {
                for (let i = 0; i < currentItemsToPlace.length - 1; i++) {
                    if (Math.random() < 0.15) {
                        const j = i + 1 + Math.floor(Math.random() * Math.min(3, currentItemsToPlace.length - 1 - i));
                        [currentItemsToPlace[i], currentItemsToPlace[j]] = [currentItemsToPlace[j], currentItemsToPlace[i]];
                    }
                }
            }
        }

        const activeBoards: Board[] = [];
        const createBoard = (): Board => ({
            id: `board-${activeBoards.length + 1}`,
            width: boardWidth,
            height: boardHeight,
            placedPieces: [],
            usedArea: 0,
        });

        const placeInBoard = (
            freeRects: Rect[],
            item: ItemToPlace,
            matchGrain: boolean,
            board: Board,
        ): { rect: Rect; newFreeRects: Rect[] } | null => {
            let bestRectIndex = -1;
            let bestRotated   = false;
            let bestScore1    = Infinity;
            let bestScore2    = Infinity;

            for (let i = 0; i < freeRects.length; i++) {
                const r = freeRects[i];
                const evaluate = (w: number, h: number, isRotated: boolean) => {
                    if (w <= r.w && h <= r.h) {
                        // BSSF: primary score = min remainder
                        let score1 = Math.min(r.w - w, r.h - h);
                        // BAF: secondary score = wasted area
                        let score2 = (r.w * r.h) - (w * h);

                        if (config.cutDirection === 'HORIZONTAL' && w < h) score1 += 1_000_000;
                        if (config.cutDirection === 'VERTICAL'   && h < w) score1 += 1_000_000;
                        
                        if (pass > 0 && Math.random() < 0.1) {
                            score1 -= Math.random() * 50;
                        }

                        if (score1 < bestScore1 || (score1 === bestScore1 && score2 < bestScore2)) {
                            bestScore1    = score1;
                            bestScore2    = score2;
                            bestRectIndex = i;
                            bestRotated   = isRotated;
                        }
                    }
                };
                evaluate(item.w, item.h, false);
                if (!matchGrain && item.w !== item.h) evaluate(item.h, item.w, true);
            }

            if (bestRectIndex !== -1) {
                const r      = freeRects[bestRectIndex];
                const finalW = bestRotated ? item.h : item.w;
                const finalH = bestRotated ? item.w : item.h;
                
                // HYBRID LOGIC
                const useGuillotine = board.placedPieces.length < 4 || (finalW * finalH > 400000 && freeRects.length < 10);
                
                if (useGuillotine) {
                    const newFreeRects = [...freeRects];
                    newFreeRects.splice(bestRectIndex, 1);
                    const rightRect:  Rect = { x: r.x + finalW, y: r.y,          w: r.w - finalW, h: finalH };
                    const bottomRect: Rect = { x: r.x,          y: r.y + finalH, w: r.w,          h: r.h - finalH };
                    const vRightRect:  Rect = { x: r.x + finalW, y: r.y,          w: r.w - finalW, h: r.h };
                    const vBottomRect: Rect = { x: r.x,          y: r.y + finalH, w: finalW,       h: r.h - finalH };

                    let chooseHorizontal: boolean;
                    if (config.cutDirection === 'HORIZONTAL') chooseHorizontal = true;
                    else if (config.cutDirection === 'VERTICAL') chooseHorizontal = false;
                    else {
                        if (finalW === r.w) {
                            chooseHorizontal = true;
                        } else if (finalH === r.h) {
                            chooseHorizontal = false;
                        } else {
                            const maxHArea = Math.max(rightRect.w * rightRect.h, bottomRect.w * bottomRect.h);
                            const maxVArea = Math.max(vRightRect.w * vRightRect.h, vBottomRect.w * vBottomRect.h);
                            chooseHorizontal = maxHArea >= maxVArea;
                            if (pass > 0 && Math.random() < 0.2) chooseHorizontal = !chooseHorizontal;
                        }
                    }

                    if (chooseHorizontal) {
                        if (rightRect.w > 0 && rightRect.h > 0) newFreeRects.push(rightRect);
                        if (bottomRect.w > 0 && bottomRect.h > 0) newFreeRects.push(bottomRect);
                    } else {
                        if (vRightRect.w > 0 && vRightRect.h > 0) newFreeRects.push(vRightRect);
                        if (vBottomRect.w > 0 && vBottomRect.h > 0) newFreeRects.push(vBottomRect);
                    }
                    return { rect: { x: r.x, y: r.y, w: finalW, h: finalH }, newFreeRects };
                } else {
                    const newFreeRects: Rect[] = [];
                    const placedRect = { x: r.x, y: r.y, w: finalW, h: finalH };
                    for (let i = 0; i < freeRects.length; i++) {
                        const F = freeRects[i];
                        if (placedRect.x >= F.x + F.w || placedRect.x + placedRect.w <= F.x ||
                            placedRect.y >= F.y + F.h || placedRect.y + placedRect.h <= F.y) {
                            newFreeRects.push(F);
                            continue;
                        }
                        if (placedRect.y > F.y) {
                            newFreeRects.push({ x: F.x, y: F.y, w: F.w, h: placedRect.y - F.y });
                        }
                        if (placedRect.y + placedRect.h < F.y + F.h) {
                            newFreeRects.push({ x: F.x, y: placedRect.y + placedRect.h, w: F.w, h: (F.y + F.h) - (placedRect.y + placedRect.h) });
                        }
                        if (placedRect.x > F.x) {
                            newFreeRects.push({ x: F.x, y: F.y, w: placedRect.x - F.x, h: F.h });
                        }
                        if (placedRect.x + placedRect.w < F.x + F.w) {
                            newFreeRects.push({ x: placedRect.x + placedRect.w, y: F.y, w: (F.x + F.w) - (placedRect.x + placedRect.w), h: F.h });
                        }
                    }

                    const prunedRects: Rect[] = [];
                    for (let i = 0; i < newFreeRects.length; i++) {
                        let isContained = false;
                        for (let j = 0; j < newFreeRects.length; j++) {
                            if (i === j) continue;
                            const r1 = newFreeRects[i];
                            const r2 = newFreeRects[j];
                            if (r1.x >= r2.x - 0.01 && r1.y >= r2.y - 0.01 && 
                                r1.x + r1.w <= r2.x + r2.w + 0.01 && r1.y + r1.h <= r2.y + r2.h + 0.01) {
                                isContained = true;
                                break;
                            }
                        }
                        if (!isContained) {
                            prunedRects.push(newFreeRects[i]);
                        }
                    }
                    return { rect: placedRect, newFreeRects: prunedRects };
                }
            }
            return null;
        };

        const boardsFreeSpace: Map<string, Rect[]> = new Map();
        const placePiece = (board: Board, result: { rect: Rect; newFreeRects: Rect[] }, item: ItemToPlace) => {
            const placementRotated = result.rect.w === item.h && item.w !== item.h;
            const placedRotated    = item.normalizedRotated !== placementRotated;
            board.placedPieces.push({
                id:             `${item.template.id}-${board.placedPieces.length}`,
                pieceTemplateId: item.template.id,
                x:              result.rect.x,
                y:              result.rect.y,
                width:          placementRotated ? item.cutH : item.cutW,
                height:         placementRotated ? item.cutW : item.cutH,
                finalWidth:     placedRotated ? item.template.height : item.template.width,
                finalHeight:    placedRotated ? item.template.width  : item.template.height,
                rotated:        placedRotated,
                matchGrain:     !!item.template.matchGrain,
                code:           item.template.code,
                description:    item.template.description,
                edgeBanding:    placedRotated ? {
                    top:    item.template.edgeBanding.left,
                    bottom: item.template.edgeBanding.right,
                    left:   item.template.edgeBanding.bottom,
                    right:  item.template.edgeBanding.top,
                } : item.template.edgeBanding,
            });
            board.usedArea += item.cutW * item.cutH;
        };

        for (const item of currentItemsToPlace) {
            let placed = false;
            for (const board of activeBoards) {
                const result = placeInBoard(boardsFreeSpace.get(board.id) || [], item, item.template.matchGrain, board);
                if (result) {
                    placePiece(board, result, item);
                    boardsFreeSpace.set(board.id, result.newFreeRects);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                const newBoard = createBoard();
                activeBoards.push(newBoard);
                const initialFree: Rect[] = [{
                    x: config.trimming.left,
                    y: config.trimming.top,
                    w: boardWidth  - config.trimming.left - config.trimming.right  + config.sawKerf,
                    h: boardHeight - config.trimming.top  - config.trimming.bottom + config.sawKerf,
                }];
                const result = placeInBoard(initialFree, item, item.template.matchGrain, newBoard);
                if (result) {
                    placePiece(newBoard, result, item);
                    boardsFreeSpace.set(newBoard.id, result.newFreeRects);
                }
            }
        }

        // Calculate pass score
        // We prioritize fewest boards, then highest area utilization on the first board
        const boardsCount = activeBoards.length;
        const totalUsedArea = activeBoards.reduce((sum, b) => sum + b.usedArea, 0);
        const passScore = -boardsCount * 1_000_000_000 + (activeBoards[0]?.usedArea || 0);

        if (passScore > bestOverallScore) {
            bestOverallScore = passScore;
            // Deep clone to prevent reference mutations
            bestOverallBoards = JSON.parse(JSON.stringify(activeBoards));
        }
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
