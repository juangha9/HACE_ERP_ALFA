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

/**
 * A Guillotine-style 2D Bin Packing Algorithm.
 * Fits given pieces into boards of given dimensions.
 */
export function optimizeCuttingMap(
    pieces: Piece[],
    boardWidth: number,
    boardHeight: number,
    config: OptimizationConfig
): Board[] {

    // First, unroll the pieces by quantity
    const itemsToPlace: { template: Piece, w: number, h: number, cutW: number, cutH: number, index: number }[] = [];
    pieces.forEach((p, idx) => {
        // Cut dimensions = Final dimensions - Edge Banding
        const cutW = Math.max(0, p.width - p.edgeBanding.left - p.edgeBanding.right);
        const cutH = Math.max(0, p.height - p.edgeBanding.top - p.edgeBanding.bottom);

        // Global Grain Direction adjustment for locked pieces
        // If board grain is vertical, and piece is grain-locked, we must ensure its principal dimension
        // aligns with the boards's vertical axis.
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
                index: idx
            });
        }
    });

    // Sort items by Area descending, but give preference based on Cut Direction
    itemsToPlace.sort((a, b) => {
        // If strategy is SIMPLE_CUTS, we prioritize the original order (index) 
        // to make the packing more predictable for the user.
        if (config.strategy !== 'MAX_SAVINGS') {
            if (a.index !== b.index) return a.index - b.index;
        }

        const areaA = a.w * a.h;
        const areaB = b.w * b.h;
        const maxA = Math.max(a.w, a.h);
        const maxB = Math.max(b.w, b.h);

        if (config.cutDirection === 'HORIZONTAL') {
            // For horizontal cuts, sorting by longest edge first helps create uniform strips
            if (maxB !== maxA) return maxB - maxA;
            return areaB - areaA;
        } else if (config.cutDirection === 'VERTICAL') {
            // For vertical cuts, sorting by longest edge first is also good
            if (maxB !== maxA) return maxB - maxA;
            return areaB - areaA;
        } else {
            // Area desc
            if (areaB !== areaA) return areaB - areaA;
            return maxB - maxA;
        }
    });

    const activeBoards: Board[] = [];

    // Helper to create a new empty board
    const createBoard = (): Board => ({
        id: `board-${activeBoards.length + 1}`,
        width: boardWidth,
        height: boardHeight,
        placedPieces: [],
        usedArea: 0
    });

    // Helper to find free space in a specific board.
    const placeInBoard = (freeRects: Rect[], itemW: number, itemH: number, matchGrain: boolean): { rect: Rect, newFreeRects: Rect[] } | null => {
        let bestRectIndex = -1;
        let bestRotated = false;
        let bestScore1 = Infinity; // Primary score (e.g. min area or min dimension)
        let bestScore2 = Infinity; // Secondary score

        for (let i = 0; i < freeRects.length; i++) {
            const r = freeRects[i];

            // Helper to evaluate a fit
            const evaluate = (w: number, h: number, isRotated: boolean) => {
                if (w <= r.w && h <= r.h) {
                    let score1 = 0;
                    let score2 = 0;

                    if (config.strategy === 'MAX_SAVINGS') {
                        // Best Area Fit (BAF): minimizes leftover area directly.
                        // This is excellent for ensuring small pieces pack tightly into existing gaps and corners.
                        score1 = (r.w * r.h) - (w * h);
                        score2 = Math.min(r.w - w, r.h - h);
                    } else {
                        // Best Area Fit (BAF) for SIMPLE_CUTS: minimizes leftover area
                        score1 = (r.w * r.h) - (w * h);
                        score2 = Math.min(r.w - w, r.h - h);
                    }

                    // Tie breaker: alignment with cut direction
                    // If Horizontal cuts are forced, we prefer placing items such that their longest side is horizontal (w >= h)
                    let alignmentPenalty = 0;
                    if (config.cutDirection === 'HORIZONTAL') {
                        if (w < h) alignmentPenalty = 1000000;
                    } else if (config.cutDirection === 'VERTICAL') {
                        if (h < w) alignmentPenalty = 1000000;
                    }

                    score2 += alignmentPenalty;

                    if (score1 < bestScore1 || (score1 === bestScore1 && score2 < bestScore2)) {
                        bestScore1 = score1;
                        bestScore2 = score2 + (isRotated ? 0.01 : 0); // Add tiny stabilization penalty for rotation
                        bestRectIndex = i;
                        bestRotated = isRotated;
                    }
                }
            };

            // Check normal
            evaluate(itemW, itemH, false);
            // Check rotated
            if (!matchGrain && itemW !== itemH) {
                evaluate(itemH, itemW, true);
            }
        }

        if (bestRectIndex !== -1) {
            const r = freeRects[bestRectIndex];
            const finalW = bestRotated ? itemH : itemW;
            const finalH = bestRotated ? itemW : itemH;
            return performGuillotineCut(freeRects, bestRectIndex, r, finalW, finalH);
        }

        return null; // Doesn't fit in this board
    };

    const performGuillotineCut = (freeRects: Rect[], index: number, r: Rect, w: number, h: number) => {
        // Remove the chosen rect
        const newFreeRects = [...freeRects];
        newFreeRects.splice(index, 1);

        // We do a guillotine cut, splitting the remaining space into two rectangles.
        // We choose the split axis that minimizes the shortest leftover dimension (MAXIMAL RECTANGLES approach variation)
        const rightW = r.w - w;
        const rightH = h;

        const bottomW = r.w;
        const bottomH = r.h - h;

        const rightRect: Rect = { x: r.x + w, y: r.y, w: rightW, h: rightH };
        const bottomRect: Rect = { x: r.x, y: r.y + h, w: bottomW, h: bottomH };

        // Or vertical split first
        const vRightW = r.w - w;
        const vRightH = r.h;
        const vBottomW = w;
        const vBottomH = r.h - h;

        const vRightRect: Rect = { x: r.x + w, y: r.y, w: vRightW, h: vRightH };
        const vBottomRect: Rect = { x: r.x, y: r.y + h, w: vBottomW, h: vBottomH };

        // Choose which split is better based on strategy
        let chooseHorizontal = false;

        const maxHArea = Math.max(rightW * rightH, bottomW * bottomH);
        const maxVArea = Math.max(vRightW * vRightH, vBottomW * vBottomH);

        if (config.cutDirection === 'HORIZONTAL') {
            chooseHorizontal = true;
        } else if (config.cutDirection === 'VERTICAL') {
            chooseHorizontal = false;
        } else {
            // OPTIMAL: Choose based on strategy
            if (config.strategy === 'MAX_SAVINGS') {
                // For maximum savings, we usually want the split that leaves the largest possible remaining rectangle
                // so we compare the area of the resulting "main" free rectangle
                chooseHorizontal = maxHArea >= maxVArea;
            } else {
                // SIMPLE_CUTS: Preference for horizontal strips to simplify saw operations
                chooseHorizontal = true;
            }
        }

        if (chooseHorizontal) {
            if (rightW > 0 && rightH > 0) newFreeRects.push(rightRect);
            if (bottomW > 0 && bottomH > 0) newFreeRects.push(bottomRect);
        } else {
            if (vRightW > 0 && vRightH > 0) newFreeRects.push(vRightRect);
            if (vBottomW > 0 && vBottomH > 0) newFreeRects.push(vBottomRect);
        }

        return {
            rect: { x: r.x, y: r.y, w, h },
            newFreeRects
        };
    };

    // State to track free space per board
    const boardsFreeSpace: Map<string, Rect[]> = new Map();

    for (const item of itemsToPlace) {
        let placed = false;

        // Try to place in existing boards
        for (const board of activeBoards) {
            let freeRects = boardsFreeSpace.get(board.id) || [];
            const result = placeInBoard(freeRects, item.w, item.h, item.template.matchGrain);

            if (result) {
                // Determine if it was rotated
                const isRotated = result.rect.w === item.h && item.w !== item.h;
                const finalCutW = isRotated ? item.cutH : item.cutW;
                const finalCutH = isRotated ? item.cutW : item.cutH;
                const finalTemplateW = isRotated ? item.template.height : item.template.width;
                const finalTemplateH = isRotated ? item.template.width : item.template.height;

                board.placedPieces.push({
                    id: `${item.template.id}-${board.placedPieces.length}`,
                    pieceTemplateId: item.template.id,
                    x: result.rect.x,
                    y: result.rect.y,
                    width: finalCutW,
                    height: finalCutH,
                    finalWidth: finalTemplateW,
                    finalHeight: finalTemplateH,
                    rotated: isRotated,
                    code: item.template.code,
                    description: item.template.description,
                    edgeBanding: isRotated ? {
                        top: item.template.edgeBanding.left,
                        bottom: item.template.edgeBanding.right,
                        left: item.template.edgeBanding.bottom,
                        right: item.template.edgeBanding.top
                    } : item.template.edgeBanding
                });

                board.usedArea += (item.cutW * item.cutH);
                boardsFreeSpace.set(board.id, result.newFreeRects);
                placed = true;
                break;
            }
        }

        // Create new board if not placed
        if (!placed) {
            const newBoard = createBoard();
            activeBoards.push(newBoard);

            // Available space in new board accounts for trimming
            // We mathematically add sawKerf to the usable area to compensate for the fact that every piece requires 'sawKerf' space. 
            // The last piece touching the edge doesn't actually need kerf on its outside edge.
            const usableWidth = boardWidth - config.trimming.left - config.trimming.right + config.sawKerf;
            const usableHeight = boardHeight - config.trimming.top - config.trimming.bottom + config.sawKerf;

            const initialFree: Rect[] = [{
                x: config.trimming.left,
                y: config.trimming.top,
                w: usableWidth,
                h: usableHeight
            }];

            const result = placeInBoard(initialFree, item.w, item.h, item.template.matchGrain);
            if (result) {
                const isRotated = result.rect.w === item.h && item.w !== item.h;
                const finalCutW = isRotated ? item.cutH : item.cutW;
                const finalCutH = isRotated ? item.cutW : item.cutH;
                const finalTemplateW = isRotated ? item.template.height : item.template.width;
                const finalTemplateH = isRotated ? item.template.width : item.template.height;

                newBoard.placedPieces.push({
                    id: `${item.template.id}-${newBoard.placedPieces.length}`,
                    pieceTemplateId: item.template.id,
                    x: result.rect.x,
                    y: result.rect.y,
                    width: finalCutW,
                    height: finalCutH,
                    finalWidth: finalTemplateW,
                    finalHeight: finalTemplateH,
                    rotated: isRotated,
                    code: item.template.code,
                    description: item.template.description,
                    edgeBanding: isRotated ? {
                        top: item.template.edgeBanding.left,
                        bottom: item.template.edgeBanding.right,
                        left: item.template.edgeBanding.bottom,
                        right: item.template.edgeBanding.top
                    } : item.template.edgeBanding
                });

                newBoard.usedArea += (item.cutW * item.cutH);
                boardsFreeSpace.set(newBoard.id, result.newFreeRects);
            }
        }
    }

    return activeBoards;
}
