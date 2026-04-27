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
    // Horizontal strips: strips run across the board width, stacked top→bottom.
    // Vertical strips:   strips run down the board height, stacked left→right.
    const useHorizontalStrips = config.cutDirection !== 'VERTICAL';

    // Usable board dimensions (trimming removed, +sawKerf compensates for last piece not needing kerf on outer edge)
    const usableAcross = (useHorizontalStrips
        ? boardWidth  - config.trimming.left - config.trimming.right
        : boardHeight - config.trimming.top  - config.trimming.bottom
    ) + config.sawKerf;

    const usableAlong = (useHorizontalStrips
        ? boardHeight - config.trimming.top  - config.trimming.bottom
        : boardWidth  - config.trimming.left - config.trimming.right
    ) + config.sawKerf;

    const activeBoards: Board[] = [];
    let curBoard: Board | null = null;

    // Strip tracking (offsets are relative to the trimming edge, not the board origin)
    let stripOffset  = 0;  // along-axis start of current strip (y for H, x for V)
    let stripSize    = 0;  // along-axis size of current strip including sawKerf
    let cursorAcross = 0;  // across-axis cursor within current strip

    const createNewBoard = () => {
        curBoard = {
            id: `board-${activeBoards.length + 1}`,
            width: boardWidth,
            height: boardHeight,
            placedPieces: [],
            usedArea: 0,
        };
        activeBoards.push(curBoard);
        stripOffset  = 0;
        stripSize    = 0;
        cursorAcross = 0;
    };

    for (const item of items) {
        // "along"  = the strip's fixed dimension (height for H strips, width for V strips)
        // "across" = the piece's variable dimension within the strip (width for H, height for V)
        const dimAlong  = useHorizontalStrips ? item.h : item.w;
        const dimAcross = useHorizontalStrips ? item.w : item.h;
        const cutAlong  = useHorizontalStrips ? item.cutH : item.cutW;
        const cutAcross = useHorizontalStrips ? item.cutW : item.cutH;

        if (!curBoard) {
            createNewBoard();
            stripSize = dimAlong;
        }

        // A new strip is needed when: piece height differs from current strip, or strip is full across.
        const differentStrip = Math.abs(dimAlong - stripSize) > 0.5;
        const stripFull      = cursorAcross + dimAcross > usableAcross;

        if (differentStrip || stripFull) {
            const nextOffset = stripOffset + stripSize;
            if (nextOffset + dimAlong > usableAlong) {
                // New strip won't fit on this board → open a new board
                createNewBoard();
            } else {
                // Advance to next strip on the same board
                stripOffset  = nextOffset;
                cursorAcross = 0;
            }
            stripSize = dimAlong;
        }

        // Compute absolute x,y position on board
        const x = useHorizontalStrips
            ? config.trimming.left + cursorAcross
            : config.trimming.left + stripOffset;
        const y = useHorizontalStrips
            ? config.trimming.top  + stripOffset
            : config.trimming.top  + cursorAcross;

        // No rotation in strip mode — rotating would change the strip dimension and break grouping.
        const pieceVisualW = useHorizontalStrips ? cutAcross : cutAlong;
        const pieceVisualH = useHorizontalStrips ? cutAlong  : cutAcross;

        curBoard!.placedPieces.push({
            id: `${item.template.id}-${curBoard!.placedPieces.length}`,
            pieceTemplateId: item.template.id,
            x,
            y,
            width:       pieceVisualW,
            height:      pieceVisualH,
            finalWidth:  item.template.width,
            finalHeight: item.template.height,
            rotated:     false,
            code:        item.template.code,
            description: item.template.description,
            edgeBanding: item.template.edgeBanding,
        });

        curBoard!.usedArea += item.cutW * item.cutH;
        cursorAcross += dimAcross;
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

    // Sort order depends on strategy
    itemsToPlace.sort((a, b) => {
        const areaA = a.w * a.h;
        const areaB = b.w * b.h;
        const maxA  = Math.max(a.w, a.h);
        const maxB  = Math.max(b.w, b.h);

        if (config.strategy === 'SIMPLE_CUTS') {
            // Group pieces by their strip dimension so each full-width cut spans a uniform strip.
            // Horizontal strips → sort by height desc; vertical strips → sort by width desc.
            const stripA = config.cutDirection === 'VERTICAL' ? a.w : a.h;
            const stripB = config.cutDirection === 'VERTICAL' ? b.w : b.h;
            if (Math.abs(stripB - stripA) > 0.5) return stripB - stripA;
            // Within the same strip height: wider pieces first to minimise strip fragmentation
            const acrossA = config.cutDirection === 'VERTICAL' ? a.h : a.w;
            const acrossB = config.cutDirection === 'VERTICAL' ? b.h : b.w;
            return acrossB - acrossA;
        }

        if (config.cutDirection === 'HORIZONTAL') {
            if (maxB !== maxA) return maxB - maxA;
            return areaB - areaA;
        } else if (config.cutDirection === 'VERTICAL') {
            if (maxB !== maxA) return maxB - maxA;
            return areaB - areaA;
        } else {
            if (areaB !== areaA) return areaB - areaA;
            return maxB - maxA;
        }
    });

    // Route to the correct algorithm
    if (config.strategy === 'SIMPLE_CUTS') {
        return runStripPacking(itemsToPlace, boardWidth, boardHeight, config);
    }

    // ── MAX_SAVINGS: guillotine bin-packing ─────────────────────────────────

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
        itemW: number,
        itemH: number,
        matchGrain: boolean,
    ): { rect: Rect; newFreeRects: Rect[] } | null => {
        let bestRectIndex = -1;
        let bestRotated   = false;
        let bestScore1    = Infinity;
        let bestScore2    = Infinity;

        for (let i = 0; i < freeRects.length; i++) {
            const r = freeRects[i];

            const evaluate = (w: number, h: number, isRotated: boolean) => {
                if (w <= r.w && h <= r.h) {
                    // Best Area Fit: minimises leftover area so pieces pack tightly into gaps.
                    const score1 = (r.w * r.h) - (w * h);
                    let   score2 = Math.min(r.w - w, r.h - h);

                    // Alignment penalty enforces cut-direction preference
                    if (config.cutDirection === 'HORIZONTAL' && w < h) score2 += 1_000_000;
                    if (config.cutDirection === 'VERTICAL'   && h < w) score2 += 1_000_000;

                    if (score1 < bestScore1 || (score1 === bestScore1 && score2 < bestScore2)) {
                        bestScore1    = score1;
                        bestScore2    = score2 + (isRotated ? 0.01 : 0);
                        bestRectIndex = i;
                        bestRotated   = isRotated;
                    }
                }
            };

            evaluate(itemW, itemH, false);
            if (!matchGrain && itemW !== itemH) {
                evaluate(itemH, itemW, true);
            }
        }

        if (bestRectIndex !== -1) {
            const r      = freeRects[bestRectIndex];
            const finalW = bestRotated ? itemH : itemW;
            const finalH = bestRotated ? itemW : itemH;
            return performGuillotineCut(freeRects, bestRectIndex, r, finalW, finalH);
        }

        return null;
    };

    const performGuillotineCut = (
        freeRects: Rect[],
        index: number,
        r: Rect,
        w: number,
        h: number,
    ) => {
        const newFreeRects = [...freeRects];
        newFreeRects.splice(index, 1);

        // Horizontal split: right strip same height as piece, bottom strip full width
        const rightRect:  Rect = { x: r.x + w, y: r.y,     w: r.w - w, h };
        const bottomRect: Rect = { x: r.x,     y: r.y + h, w: r.w,     h: r.h - h };

        // Vertical split: right strip full height, bottom strip same width as piece
        const vRightRect:  Rect = { x: r.x + w, y: r.y,     w: r.w - w, h: r.h     };
        const vBottomRect: Rect = { x: r.x,     y: r.y + h, w,          h: r.h - h };

        let chooseHorizontal: boolean;
        if (config.cutDirection === 'HORIZONTAL') {
            chooseHorizontal = true;
        } else if (config.cutDirection === 'VERTICAL') {
            chooseHorizontal = false;
        } else {
            // OPTIMAL / MAX_SAVINGS: choose split that leaves the largest remaining rect
            const maxHArea = Math.max(rightRect.w * rightRect.h, bottomRect.w * bottomRect.h);
            const maxVArea = Math.max(vRightRect.w * vRightRect.h, vBottomRect.w * vBottomRect.h);
            chooseHorizontal = maxHArea >= maxVArea;
        }

        if (chooseHorizontal) {
            if (rightRect.w  > 0 && rightRect.h  > 0) newFreeRects.push(rightRect);
            if (bottomRect.w > 0 && bottomRect.h > 0) newFreeRects.push(bottomRect);
        } else {
            if (vRightRect.w  > 0 && vRightRect.h  > 0) newFreeRects.push(vRightRect);
            if (vBottomRect.w > 0 && vBottomRect.h > 0) newFreeRects.push(vBottomRect);
        }

        return { rect: { x: r.x, y: r.y, w, h }, newFreeRects };
    };

    const boardsFreeSpace: Map<string, Rect[]> = new Map();

    const placePiece = (
        board: Board,
        result: { rect: Rect; newFreeRects: Rect[] },
        item: ItemToPlace,
    ) => {
        const isRotated    = result.rect.w === item.h && item.w !== item.h;
        const finalCutW    = isRotated ? item.cutH : item.cutW;
        const finalCutH    = isRotated ? item.cutW : item.cutH;
        const finalTemplW  = isRotated ? item.template.height : item.template.width;
        const finalTemplH  = isRotated ? item.template.width  : item.template.height;

        board.placedPieces.push({
            id:             `${item.template.id}-${board.placedPieces.length}`,
            pieceTemplateId: item.template.id,
            x:              result.rect.x,
            y:              result.rect.y,
            width:          finalCutW,
            height:         finalCutH,
            finalWidth:     finalTemplW,
            finalHeight:    finalTemplH,
            rotated:        isRotated,
            code:           item.template.code,
            description:    item.template.description,
            edgeBanding:    isRotated ? {
                top:    item.template.edgeBanding.left,
                bottom: item.template.edgeBanding.right,
                left:   item.template.edgeBanding.bottom,
                right:  item.template.edgeBanding.top,
            } : item.template.edgeBanding,
        });

        board.usedArea += item.cutW * item.cutH;
    };

    for (const item of itemsToPlace) {
        let placed = false;

        for (const board of activeBoards) {
            const freeRects = boardsFreeSpace.get(board.id) || [];
            const result    = placeInBoard(freeRects, item.w, item.h, item.template.matchGrain);

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

            const usableWidth  = boardWidth  - config.trimming.left - config.trimming.right  + config.sawKerf;
            const usableHeight = boardHeight - config.trimming.top  - config.trimming.bottom + config.sawKerf;

            const initialFree: Rect[] = [{
                x: config.trimming.left,
                y: config.trimming.top,
                w: usableWidth,
                h: usableHeight,
            }];

            const result = placeInBoard(initialFree, item.w, item.h, item.template.matchGrain);
            if (result) {
                placePiece(newBoard, result, item);
                boardsFreeSpace.set(newBoard.id, result.newFreeRects);
            }
        }
    }

    return activeBoards;
}
