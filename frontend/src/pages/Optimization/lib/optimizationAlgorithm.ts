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
    const kerf = config.sawKerf;

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
                w: finalW,
                h: finalH,
                cutW: finalW,
                cutH: finalH,
                index: idx
            });
        }
    });

    const createPlacedPiece = (item: ItemToPlace, x: number, y: number, rW: number, rH: number, rotated: boolean): PlacedPiece => {
        return {
            id: `${item.template.id}-${Math.random()}`,
            pieceTemplateId: item.template.id,
            x,
            y,
            width: rotated ? item.cutH : item.cutW,
            height: rotated ? item.cutW : item.cutH,
            finalWidth: rotated ? item.template.height : item.template.width,
            finalHeight: rotated ? item.template.width : item.template.height,
            rotated,
            matchGrain: !!item.template.matchGrain,
            code: item.template.code,
            description: item.template.description,
            edgeBanding: rotated ? {
                top: item.template.edgeBanding.left,
                bottom: item.template.edgeBanding.right,
                left: item.template.edgeBanding.bottom,
                right: item.template.edgeBanding.top,
            } : item.template.edgeBanding,
        };
    };

    const placeGuillotine = (freeRects: Rect[], item: ItemToPlace, board: Board, isVerticalMode: boolean) => {
        let bestRectIndex = -1;
        let bestRotated = false;
        let bestScore1 = Infinity;
        let bestScore2 = Infinity;

        for (let i = 0; i < freeRects.length; i++) {
            const r = freeRects[i];
            const evaluate = (w: number, h: number, isRotated: boolean) => {
                if (w <= r.w + 0.1 && h <= r.h + 0.1) {
                    let score1 = Math.min(r.w - w, r.h - h);
                    let score2 = (r.w * r.h) - (w * h);
                    
                    if (score1 < bestScore1 || (score1 === bestScore1 && score2 < bestScore2)) {
                        bestScore1 = score1;
                        bestScore2 = score2;
                        bestRectIndex = i;
                        bestRotated = isRotated;
                    }
                }
            };
            evaluate(item.w, item.h, false);
            if (!item.template.matchGrain && item.w !== item.h) evaluate(item.h, item.w, true);
        }

        if (bestRectIndex !== -1) {
            const F = freeRects[bestRectIndex];
            const finalW = bestRotated ? item.h : item.w;
            const finalH = bestRotated ? item.w : item.h;
            
            const placedRect = { x: F.x, y: F.y, w: finalW, h: finalH };
            const newFreeRects = [...freeRects];
            newFreeRects.splice(bestRectIndex, 1);
            
            // GUILLOTINE EXACTA: El rectángulo se parte de extremo a extremo
            const rightW = F.w - finalW - kerf;
            const bottomH = F.h - finalH - kerf;
            
            const rightRect:  Rect = { x: F.x + finalW + kerf, y: F.y, w: rightW, h: finalH };
            const bottomRect: Rect = { x: F.x, y: F.y + finalH + kerf, w: F.w, h: bottomH };
            
            const vRightRect:  Rect = { x: F.x + finalW + kerf, y: F.y, w: rightW, h: F.h };
            const vBottomRect: Rect = { x: F.x, y: F.y + finalH + kerf, w: finalW, h: bottomH };

            // Decidir la dirección del corte de Guillotina
            // Si estamos en modo Vertical (Columnas), el corte secundario lógico que atraviesa la columna es HORIZONTAL.
            // Si estamos en modo Horizontal (Filas), el corte secundario lógico que atraviesa la fila es VERTICAL.
            let chooseHorizontal = isVerticalMode; 
            
            // Forzar corte natural si la pieza casi ocupa toda la dimensión
            if (finalW >= F.w - 15) chooseHorizontal = true;
            else if (finalH >= F.h - 15) chooseHorizontal = false;

            if (chooseHorizontal) {
                if (rightW > 0 && finalH > 0) newFreeRects.push(rightRect);
                if (F.w > 0 && bottomH > 0) newFreeRects.push(bottomRect);
            } else {
                if (rightW > 0 && F.h > 0) newFreeRects.push(vRightRect);
                if (finalW > 0 && bottomH > 0) newFreeRects.push(vBottomRect);
            }
            
            return { rect: placedRect, newFreeRects, rotated: bestRotated, score: bestScore1 };
        }
        return null;
    };

    const evaluateStrictSequence = (globalRemaining: ItemToPlace[], boardId: string, isVerticalMode: boolean): { board: Board, remaining: ItemToPlace[], score: number } => {
        const leftOffset = config.trimming.left;
        const rightOffset = config.trimming.right;
        const topOffset = config.trimming.top;
        const bottomOffset = config.trimming.bottom;
        const usableWidth = boardWidth - leftOffset - rightOffset;
        
        // 1. Pre-agrupar y encontrar dimensiones maestras
        const groups = new Map<number, ItemToPlace[]>();
        for (const p of globalRemaining) {
            let dim = isVerticalMode ? p.w : p.h;
            // Si no tiene veta, preferimos la dimensión que ya exista en grupos o la más larga
            if (!p.template.matchGrain && p.w !== p.h) {
                const alt = isVerticalMode ? p.h : p.w;
                if (!groups.has(dim) && groups.has(alt)) dim = alt;
            }
            if (!groups.has(dim)) groups.set(dim, []);
            groups.get(dim)!.push(p);
        }

        const masterDims = Array.from(groups.keys()).sort((a, b) => b - a);
        const boardUsableLimit = isVerticalMode ? usableWidth : (boardHeight - topOffset - bottomOffset);

        // 2. Buscar la mejor COMBINACIÓN de tiras (Strips) para este tablero
        let bestCombo: number[] = [];
        let maxPerfectArea = -1;

        const findBestCombo = (current: number[], currentSum: number, startIndex: number) => {
            let area = 0;
            const tempGroups = new Map<number, number>();
            for (const d of current) {
                const count = tempGroups.get(d) || 0;
                const pool = groups.get(d) || [];
                const piecesPerStrip = Math.floor(usableWidth / (isVerticalMode ? d : 300));
                const used = Math.min(pool.length - (count * piecesPerStrip), piecesPerStrip);
                if (used > 0) area += d * (isVerticalMode ? boardHeight : usableWidth);
                tempGroups.set(d, count + 1);
            }

            if (area > maxPerfectArea) {
                maxPerfectArea = area;
                bestCombo = [...current];
            }

            for (let i = startIndex; i < masterDims.length; i++) {
                const dim = masterDims[i];
                const addedKerf = current.length > 0 ? kerf : 0;
                if (currentSum + addedKerf + dim <= boardUsableLimit + 0.1) {
                    findBestCombo([...current, dim], currentSum + addedKerf + dim, i);
                }
            }
        };

        findBestCombo([], 0, 0);

        // 3. Ejecutar el PLAN de tiras elegido
        const comboBoard: Board = { id: boardId, width: boardWidth, height: boardHeight, placedPieces: [], usedArea: 0 };
        let currentRemaining = [...globalRemaining];
        let cursor = isVerticalMode ? leftOffset : topOffset;
        let zonesFreeRects: Rect[][] = [];

        for (const dim of bestCombo) {
            const addedKerf = (isVerticalMode ? (cursor > leftOffset) : (cursor > topOffset)) ? kerf : 0;
            const startPos = cursor + addedKerf;
            
            const stripRect: Rect = isVerticalMode
                ? { x: startPos, y: topOffset, w: dim, h: boardHeight - topOffset - bottomOffset }
                : { x: leftOffset, y: startPos, w: usableWidth, h: dim };
            
            let currentZoneRects = [stripRect];
            const pool = [...(groups.get(dim) || [])];
            
            let j = 0;
            while (j < pool.length) {
                const item = pool[j];
                const res = placeGuillotine(currentZoneRects, item, comboBoard, isVerticalMode);
                const isPerfect = res && (isVerticalMode ? (res.rect.w === dim) : (res.rect.h === dim));
                
                if (res && isPerfect) {
                    comboBoard.placedPieces.push(createPlacedPiece(item, res.rect.x, res.rect.y, res.rect.w, res.rect.h, res.rotated));
                    comboBoard.usedArea += item.cutW * item.cutH;
                    currentZoneRects = res.newFreeRects;
                    pool.splice(j, 1);
                    const idx = currentRemaining.indexOf(item);
                    if (idx !== -1) currentRemaining.splice(idx, 1);
                } else {
                    j++;
                }
            }
            
            zonesFreeRects.push(currentZoneRects);
            cursor = startPos + dim;
        }

        // 4. PASS 2: Rellenar huecos con piezas sobrantes
        const leftovers = currentRemaining.filter(p => {
            const dim = isVerticalMode ? p.w : p.h;
            if (masterDims.includes(dim) && !bestCombo.includes(dim)) {
                if (groups.get(dim)!.length >= 2) return false; 
            }
            return true;
        });

        leftovers.sort((a, b) => (b.w * b.h) - (a.w * a.h));
        
        let pool2 = [...leftovers];
        while (pool2.length > 0) {
            let bestIdx = -1;
            let bestZoneIdx = -1;
            let bestPlacement = null;
            let minWaste = Infinity;
            
            for (let j = 0; j < pool2.length; j++) {
                for (let i = 0; i < zonesFreeRects.length; i++) {
                    const res = placeGuillotine(zonesFreeRects[i], pool2[j], comboBoard, isVerticalMode);
                    if (res && res.score < minWaste) {
                        minWaste = res.score; bestPlacement = res; bestIdx = j; bestZoneIdx = i;
                        if (minWaste === 0) break;
                    }
                }
                if (minWaste === 0) break;
            }
            
            if (bestPlacement) {
                const item = pool2[bestIdx];
                comboBoard.placedPieces.push(createPlacedPiece(item, bestPlacement.rect.x, bestPlacement.rect.y, bestPlacement.rect.w, bestPlacement.rect.h, bestPlacement.rotated));
                comboBoard.usedArea += item.cutW * item.cutH;
                zonesFreeRects[bestZoneIdx] = bestPlacement.newFreeRects;
                pool2.splice(bestIdx, 1);
                const idx = currentRemaining.indexOf(item);
                if (idx !== -1) currentRemaining.splice(idx, 1);
            } else {
                pool2.shift();
            }
        }

        return { board: comboBoard, remaining: currentRemaining, score: comboBoard.usedArea };
    };

    const evaluateFullSequence = (isVerticalMode: boolean): { boards: Board[], score: number } => {
        let globalRemaining = [...itemsToPlace];
        let boardIndex = 1;
        const boards: Board[] = [];
        let totalScore = 0;

        while (globalRemaining.length > 0) {
            const res = evaluateStrictSequence(globalRemaining, `board-${boardIndex}`, isVerticalMode);
            boards.push(res.board);
            globalRemaining = res.remaining;
            totalScore += res.score;
            boardIndex++;
            // Safety break
            if (boardIndex > 100) break;
        }

        // The sequence score should prioritize fewest boards first, then highest packed area.
        const score = -boards.length * 1000000 + totalScore;
        return { boards, score };
    };

    // Evaluamos la secuencia COMPLETA en ambos modos
    const seqH = evaluateFullSequence(false); // FILAS
    const seqV = evaluateFullSequence(true);  // COLUMNAS

    let chosenSeq = seqH; // Prioridad absoluta a Filas (Horizontal)
    
    if (config.cutDirection === 'VERTICAL') {
        chosenSeq = seqV;
    } else if (config.cutDirection === 'HORIZONTAL') {
        chosenSeq = seqH;
    } else {
        // En modo Libre, solo elegimos Vertical si logramos ahorrar un tablero completo
        if (seqV.score > seqH.score + 500000) {
            chosenSeq = seqV;
        }
    }

    return chosenSeq.boards;
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
