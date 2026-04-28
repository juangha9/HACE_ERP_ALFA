import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import type { Board, PlacedPiece } from '../lib/optimizationAlgorithm';

interface CuttingMapProps {
    boards: Board[];
    boardWidth?: number;
    boardHeight?: number;
    /** Delta por pieceTemplateId (id de fila en la tabla de medidas).
     *  El padre debe marcar isManualAdjustingRef antes de mutar pieces para
     *  evitar que el efecto de geometry vacíe `boards` y reinicie el manual. */
    onPiecesAdjust?: (delta: Record<string, number>) => void;
}

const DESATURATED_COLORS = [
    '#f0f9ff', '#ecfdf5', '#fefce8', '#fff7ed', '#fef2f2',
    '#fdf4ff', '#f5f3ff', '#eff6ff', '#f0fdf4', '#fff1f2',
    '#faf5ff', '#f0fdfa',
];

const MAT_COLORS = [
    { badge: 'bg-[#4A90E2]' },
    { badge: 'bg-[#F5A623]' },
    { badge: 'bg-[#7ED321]' },
    { badge: 'bg-[#BD10E0]' },
    { badge: 'bg-[#D0021B]' },
];

const getCodeColor = (code: string) => {
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
        hash = code.charCodeAt(i) + ((hash << 5) - hash);
    }
    return DESATURATED_COLORS[Math.abs(hash) % DESATURATED_COLORS.length];
};

interface RepositoryItem {
    code: string;
    piece: PlacedPiece;
    count: number;
    color: string;
    // El boardId al que pertenece este repo (el repo es privado por tablero).
    ownerBoardId: string;
    sourceMaterialKey: string;
    // Posiciones de origen (todas las instancias acumuladas) — la primera entrada
    // que coincida con el tablero destino se usa para "snap a origen" al devolver.
    origins: { boardId: string; x: number; y: number; pieceId: string }[];
}

// Repository PRIVADO por tablero: boardId → pieceCode → RepositoryItem.
// Antes era compartido por material (un repo para todos los tableros del mismo
// material), lo que causaba que las piezas aparecieran "duplicadas" en otros
// tableros del mismo tipo (e incluso entre tableros sin materialNumber, que
// caían todos en la clave "default").
type Repository = Record<string, Record<string, RepositoryItem>>;

interface DragCtx {
    sourceType: 'BOARD' | 'REPO';
    sourceMaterialKey: string;
    sourceBoardId: string; // necesario para no duplicar al regresar sobre el mismo tablero
    pieces: PlacedPiece[]; // soporta arrastre multi-selección
    pieceCodes: string[];
    anchorIndex: number; // índice de la pieza agarrada (referencia del cursor)
    relativeOffsets: { dx: number; dy: number }[]; // offsets relativos al anchor
    grabOffset?: { x: number; y: number };
}

const matKeyOf = (board: Board) => board.materialNumber || 'default';

export const CuttingMap = memo(({ boards, boardWidth, boardHeight, onPiecesAdjust }: CuttingMapProps) => {
    const [isManual, setIsManual] = useState(false);
    const [localBoards, setLocalBoards] = useState<Board[]>([]);
    const [repository, setRepository] = useState<Repository>({});

    // Drag visual feedback — only for UI; actual drag data lives in dragCtxRef
    const [draggingMaterialKey, setDraggingMaterialKey] = useState<string | null>(null);
    // boardId del que partió el arrastre (BOARD o REPO). Solo el repo de ese
    // tablero debe iluminarse al arrastrar — los demás repos del mismo material
    // no aceptan la pieza porque cada repo es privado al tablero.
    const [draggingSourceBoardId, setDraggingSourceBoardId] = useState<string | null>(null);
    const [dragSourceType, setDragSourceType] = useState<'BOARD' | 'REPO' | null>(null);
    const [draggingPieceIds, setDraggingPieceIds] = useState<Set<string>>(new Set());
    const [localError, setLocalError] = useState<string | null>(null);

    // Selección múltiple estilo Windows: ids seleccionados + tablero al que pertenecen
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectionBoardId, setSelectionBoardId] = useState<string | null>(null);

    // Animations
    const [newBoardPieceIds, setNewBoardPieceIds] = useState<Set<string>>(new Set());
    const [newRepoCodes, setNewRepoCodes] = useState<Set<string>>(new Set());

    // Reliable drag context stored in ref — always current, no stale closure issues
    const dragCtxRef = useRef<DragCtx | null>(null);

    // Espejo del último localBoards para que los handlers de drop usen el estado más
    // reciente al validar colisiones y bordes (evita el "ghost" de un targetBoard stale
    // cuando hubo un re-render entre dragstart y drop).
    const latestBoardsRef = useRef<Board[]>([]);

    // Firma estructural del prop boards. Captura solo IDs (no metadatos como
    // printCode/printIndex que se inyectan en cada re-render del padre). Así el
    // estado manual NO se reinicia cuando el padre vuelve a renderizar por
    // edición de la tabla, sino solo cuando hay una optimización fresca.
    const boardsFingerprint = useMemo(() => {
        return boards
            .map(b => `${b.id}#${b.placedPieces.map(p => p.id).join(',')}`)
            .join('|');
    }, [boards]);

    // El fingerprint solo cambia si los IDs reales del prop boards cambian
    // (re-optimización, carga de historial, reset por cambio de geometría).
    // Cualquier re-render del padre (auto-save, edits que no afectan boards,
    // anotaciones de printCode) deja el fingerprint intacto y el localBoards
    // del usuario en modo manual no se toca.
    //
    // Importante: NO bloqueamos la sincronización por isManual. Antes lo
    // hacíamos, pero eso causaba que al pulsar "Optimizar" estando en manual,
    // el padre actualizara `boards` con nuevos IDs y este efecto los ignorara
    // — el usuario veía los tableros viejos sin error en consola. Cuando
    // detectamos un fingerprint nuevo asumimos que es una re-optimización
    // legítima: salimos del modo manual y limpiamos todo el estado local.
    const lastSyncedFingerprintRef = useRef<string>('');
    useEffect(() => {
        if (lastSyncedFingerprintRef.current === boardsFingerprint) return;
        const cloned = JSON.parse(JSON.stringify(boards));
        setLocalBoards(cloned);
        latestBoardsRef.current = cloned;
        setRepository({});
        setSelectedIds(new Set());
        setSelectionBoardId(null);
        if (isManual) setIsManual(false);
        lastSyncedFingerprintRef.current = boardsFingerprint;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boardsFingerprint]);

    useEffect(() => {
        latestBoardsRef.current = localBoards;
    }, [localBoards]);

    const fallbackW = boardWidth || 2440;
    const fallbackH = boardHeight || 2140;

    const materialGroups = localBoards.reduce((acc, board) => {
        const key = board.materialNumber || 'default';
        if (!acc[key]) acc[key] = {
            matKey: key,
            matLabel: board.materialLabel || 'MATERIAL BASE',
            boards: []
        };
        acc[key].boards.push(board);
        return acc;
    }, {} as Record<string, { matKey: string; matLabel: string; boards: Board[] }>);

    const materialGroupsArray = Object.values(materialGroups);
    let globalBoardIndex = 0;

    // --- Drag & Drop ---

    const clearDrag = () => {
        dragCtxRef.current = null;
        setDraggingMaterialKey(null);
        setDraggingSourceBoardId(null);
        setDragSourceType(null);
        setDraggingPieceIds(new Set());
    };

    const showError = (msg: string) => {
        setLocalError(msg);
        setTimeout(() => setLocalError(null), 3000);
    };

    // Selección al apretar el botón del mouse (antes del posible dragstart).
    // Sin modificadores: si ya estaba seleccionada, mantiene la selección actual
    // (para poder arrastrar el grupo); si no, queda solo esa.
    // Ctrl/Cmd: alterna esta pieza dentro de la selección.
    const handlePieceMouseDown = (e: React.MouseEvent, piece: PlacedPiece, board: Board) => {
        if (!isManual) return;
        const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
        if (isMulti) {
            if (selectionBoardId && selectionBoardId !== board.id) {
                setSelectionBoardId(board.id);
                setSelectedIds(new Set([piece.id]));
                return;
            }
            setSelectionBoardId(board.id);
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(piece.id)) next.delete(piece.id);
                else next.add(piece.id);
                return next;
            });
        } else {
            if (selectionBoardId === board.id && selectedIds.has(piece.id)) return;
            setSelectionBoardId(board.id);
            setSelectedIds(new Set([piece.id]));
        }
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
        setSelectionBoardId(null);
    };

    const handleDragStartFromBoard = (e: React.DragEvent, piece: PlacedPiece, board: Board) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        // Determinar conjunto de piezas a arrastrar:
        // si la pieza está dentro de la selección actual del mismo tablero, arrastra todo el grupo;
        // si no, arrastra solo esta y ajusta la selección a esta pieza.
        let dragPieces: PlacedPiece[];
        if (selectionBoardId === board.id && selectedIds.has(piece.id) && selectedIds.size > 1) {
            dragPieces = board.placedPieces.filter(p => selectedIds.has(p.id));
            if (!dragPieces.some(p => p.id === piece.id)) dragPieces.unshift(piece);
        } else {
            dragPieces = [piece];
            setSelectionBoardId(board.id);
            setSelectedIds(new Set([piece.id]));
        }

        const anchorIndex = dragPieces.findIndex(p => p.id === piece.id);
        const anchor = dragPieces[anchorIndex];
        const relativeOffsets = dragPieces.map(p => ({ dx: p.x - anchor.x, dy: p.y - anchor.y }));

        e.dataTransfer.setData('text/plain', piece.id);
        e.dataTransfer.effectAllowed = 'move';
        const matKey = matKeyOf(board);
        dragCtxRef.current = {
            sourceType: 'BOARD',
            sourceMaterialKey: matKey,
            sourceBoardId: board.id,
            pieces: dragPieces,
            pieceCodes: dragPieces.map(p => p.code),
            anchorIndex,
            relativeOffsets,
            grabOffset: { x: offsetX, y: offsetY }
        };
        setDraggingMaterialKey(matKey);
        setDraggingSourceBoardId(board.id);
        setDragSourceType('BOARD');
        setDraggingPieceIds(new Set(dragPieces.map(p => p.id)));
    };

    // El repo es privado por tablero, así que el drag desde repo necesita saber
    // a qué tablero pertenece para que el drop solo se acepte de vuelta a ese
    // mismo tablero (no a otro del mismo material).
    const handleDragStartFromRepo = (e: React.DragEvent, item: RepositoryItem, ownerBoard: Board) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        e.dataTransfer.setData('text/plain', item.code);
        e.dataTransfer.effectAllowed = 'move';
        dragCtxRef.current = {
            sourceType: 'REPO',
            sourceMaterialKey: item.sourceMaterialKey,
            sourceBoardId: ownerBoard.id,
            pieces: [item.piece],
            pieceCodes: [item.code],
            anchorIndex: 0,
            relativeOffsets: [{ dx: 0, dy: 0 }],
            grabOffset: { x: offsetX, y: offsetY }
        };
        setDraggingMaterialKey(item.sourceMaterialKey);
        setDraggingSourceBoardId(ownerBoard.id);
        setDragSourceType('REPO');
        setDraggingPieceIds(new Set());
    };

    // Cada tablero tiene su propio repositorio privado.
    // El drop solo se acepta si las piezas vienen DEL MISMO tablero al que se
    // le está soltando: cada repo es exclusivo de su tablero, no se comparte
    // con otros tableros del mismo material.
    // Descuenta `quantity` en la tabla del padre vía onPiecesAdjust(pieceTemplateId, -1).
    const handleDropOnRepo = (e: React.DragEvent, targetBoard: Board) => {
        e.preventDefault();
        e.stopPropagation();
        const ctx = dragCtxRef.current;
        if (!ctx || ctx.sourceType !== 'BOARD') return clearDrag();
        if (ctx.sourceBoardId !== targetBoard.id) {
            showError("El repositorio solo recibe piezas de su propio tablero.");
            return clearDrag();
        }
        const targetMatKey = matKeyOf(targetBoard);

        const { sourceBoardId, pieces: piecesToMove } = ctx;

        // Validar contra el estado más fresco — no contra el closure del render previo.
        const fresh = latestBoardsRef.current;
        const srcFresh = fresh.find(b => b.id === sourceBoardId);
        if (!srcFresh) return clearDrag();
        const actuallyPresent = piecesToMove.filter(p => srcFresh.placedPieces.some(sp => sp.id === p.id));
        if (actuallyPresent.length === 0) return clearDrag();

        const actuallyMovingIds = new Set(actuallyPresent.map(p => p.id));
        const movedTotalArea = actuallyPresent.reduce((acc, p) => acc + p.width * p.height, 0);

        // Mutación atómica: filtra la fuente solo si las piezas siguen ahí.
        setLocalBoards(prev => {
            const board = prev.find(b => b.id === sourceBoardId);
            if (!board) return prev;
            const present = board.placedPieces.some(p => actuallyMovingIds.has(p.id));
            if (!present) return prev;
            const next = prev.map(b => {
                if (b.id !== sourceBoardId) return b;
                return {
                    ...b,
                    placedPieces: b.placedPieces.filter(p => !actuallyMovingIds.has(p.id)),
                    usedArea: Math.max(0, b.usedArea - movedTotalArea)
                };
            });
            latestBoardsRef.current = next;
            return next;
        });

        setRepository(prev => {
            const boardRepo = { ...(prev[targetBoard.id] || {}) };
            for (const piece of actuallyPresent) {
                const existing = boardRepo[piece.code];
                const origin = { boardId: sourceBoardId, x: piece.x, y: piece.y, pieceId: piece.id };
                boardRepo[piece.code] = {
                    code: piece.code,
                    piece: JSON.parse(JSON.stringify(piece)),
                    count: (existing?.count ?? 0) + 1,
                    color: getCodeColor(piece.code),
                    ownerBoardId: targetBoard.id,
                    sourceMaterialKey: targetMatKey,
                    origins: existing ? [...existing.origins, origin] : [origin]
                };
            }
            return { ...prev, [targetBoard.id]: boardRepo };
        });

        // Descontar de la tabla de medidas (1 por pieza) usando pieceTemplateId.
        if (onPiecesAdjust) {
            const delta: Record<string, number> = {};
            for (const piece of actuallyPresent) {
                const tid = piece.pieceTemplateId;
                if (!tid) continue;
                delta[tid] = (delta[tid] || 0) - 1;
            }
            if (Object.keys(delta).length > 0) onPiecesAdjust(delta);
        }

        for (const piece of actuallyPresent) {
            const animKey = `${targetMatKey}:${piece.code}`;
            setNewRepoCodes(prev => new Set(prev).add(animKey));
            setTimeout(() => setNewRepoCodes(prev => { const s = new Set(prev); s.delete(animKey); return s; }), 400);
        }

        clearSelection();
        clearDrag();
    };

    // Tablero acepta:
    //   - REPO → BOARD del mismo tipo (saca del repositorio compartido)
    //   - BOARD → BOARD distintos pero del mismo tipo (mueve la pieza)
    //   - Re-posicionamiento dentro del mismo tablero (incluye "devolver al origen")
    // Soporta drop multi-pieza preservando offsets relativos al anchor.
    const handleDropOnBoard = (e: React.DragEvent, targetBoard: Board) => {
        e.preventDefault();
        const ctx = dragCtxRef.current;
        if (!ctx) return clearDrag();
        const targetMatKey = matKeyOf(targetBoard);
        if (ctx.sourceMaterialKey !== targetMatKey) {
            showError("La pieza no corresponde al material de este tablero.");
            return clearDrag();
        }

        const boardElem = e.currentTarget as HTMLElement;
        const boardRect = boardElem.getBoundingClientRect();

        const bw = targetBoard.width || fallbackW;
        const bh = targetBoard.height || fallbackH;

        const scaleX = bw / boardRect.width;
        const scaleY = bh / boardRect.height;

        const anchor = ctx.pieces[ctx.anchorIndex] || ctx.pieces[0];

        let grabX = 0, grabY = 0;
        if (ctx.sourceType === 'BOARD' && ctx.grabOffset) {
            grabX = ctx.grabOffset.x * scaleX;
            grabY = ctx.grabOffset.y * scaleY;
        } else {
            grabX = anchor.width / 2;
            grabY = anchor.height / 2;
        }

        const anchorX = Math.round((e.clientX - boardRect.left) * scaleX - grabX);
        const anchorY = Math.round((e.clientY - boardRect.top) * scaleY - grabY);

        // Posiciones propuestas para todas las piezas del grupo arrastrado.
        const proposed = ctx.pieces.map((p, i) => ({
            piece: p,
            newX: anchorX + ctx.relativeOffsets[i].dx,
            newY: anchorY + ctx.relativeOffsets[i].dy
        }));

        // Bordes: si ALGUNA pieza queda fuera del tablero, rechazar.
        for (const { piece, newX, newY } of proposed) {
            if (newX < 0 || newY < 0 || newX + piece.width > bw || newY + piece.height > bh) {
                showError("Alguna pieza queda fuera del tablero.");
                return clearDrag();
            }
        }

        const draggingIds = new Set(ctx.pieces.map(p => p.id));
        const isSameBoardMove = ctx.sourceType === 'BOARD' && ctx.sourceBoardId === targetBoard.id;

        // Detector de colisión que opera sobre un board "fresco" (el que React tiene en cola).
        // Devuelve la pieza ofensiva (o null) — útil para mostrar un mensaje claro y
        // distinguir colisión real de "fantasma" cuando una pieza ya fue removida.
        const findCollisionAgainst = (freshBoard: Board): PlacedPiece | null => {
            for (const { piece, newX, newY } of proposed) {
                for (const p of freshBoard.placedPieces) {
                    if (p.id === piece.id) continue;
                    if (isSameBoardMove && draggingIds.has(p.id)) continue;
                    const overlapX = newX < p.x + p.width && newX + piece.width > p.x;
                    const overlapY = newY < p.y + p.height && newY + piece.height > p.y;
                    if (overlapX && overlapY) return p;
                }
            }
            return null;
        };

        // Re-posicionamiento intra-tablero (preserva IDs).
        if (isSameBoardMove) {
            const updatedById = new Map(proposed.map(({ piece, newX, newY }) => [piece.id, { x: newX, y: newY }]));
            let abortMsg: string | null = null;
            setLocalBoards(prev => {
                const freshBoard = prev.find(b => b.id === targetBoard.id);
                if (!freshBoard) return prev;
                const offender = findCollisionAgainst(freshBoard);
                if (offender) {
                    abortMsg = `La pieza choca con "${offender.code}".`;
                    return prev;
                }
                const next = prev.map(board => {
                    if (board.id !== targetBoard.id) return board;
                    return {
                        ...board,
                        placedPieces: board.placedPieces.map(p => {
                            const upd = updatedById.get(p.id);
                            return upd ? { ...p, x: upd.x, y: upd.y } : p;
                        })
                    };
                });
                latestBoardsRef.current = next;
                return next;
            });
            if (abortMsg) showError(abortMsg);
            clearDrag();
            return;
        }

        if (ctx.sourceType === 'REPO') {
            // El repo es privado al tablero — la pieza solo puede regresar a
            // su tablero de origen, no a otro del mismo material.
            if (ctx.sourceBoardId !== targetBoard.id) {
                showError("La pieza del repositorio solo puede volver a su tablero de origen.");
                return clearDrag();
            }
            const code = ctx.pieceCodes[0];
            const boardRepo = repository[targetBoard.id];
            const repoItem = boardRepo?.[code];
            if (!repoItem) return clearDrag();

            // SNAP A ORIGEN: si una de las instancias guardadas en `origins` proviene del
            // tablero destino, intentar primero su (x,y) original. Como esa pieza ya no
            // está en placedPieces (fue movida al repo), su hueco está libre — esto evita
            // colisiones falsas por imprecisión del cursor (a escala 2.4mm/px un offset
            // pequeño basta para solapar con la vecina).
            const originOnTarget = repoItem.origins.find(o => o.boardId === targetBoard.id);
            const cursorX = proposed[0].newX;
            const cursorY = proposed[0].newY;
            let placeX = cursorX;
            let placeY = cursorY;
            let consumedOriginPieceId: string | null = null;

            if (originOnTarget) {
                // Distancia al origen en mm; tolerancia generosa: ~el 60% del lado mayor.
                const dx = cursorX - originOnTarget.x;
                const dy = cursorY - originOnTarget.y;
                const tolerance = Math.max(repoItem.piece.width, repoItem.piece.height) * 0.6;
                if (Math.abs(dx) <= tolerance && Math.abs(dy) <= tolerance) {
                    placeX = originOnTarget.x;
                    placeY = originOnTarget.y;
                    consumedOriginPieceId = originOnTarget.pieceId;
                }
            }

            // Recalcular `proposed[0]` para que la validación de colisión use placeX/placeY.
            proposed[0] = { piece: proposed[0].piece, newX: placeX, newY: placeY };

            const newPieceId = consumedOriginPieceId
                ? consumedOriginPieceId
                : `${repoItem.piece.pieceTemplateId}-repo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const newPiece: PlacedPiece = JSON.parse(JSON.stringify(repoItem.piece));
            newPiece.id = newPieceId;
            newPiece.x = placeX;
            newPiece.y = placeY;

            let abortMsg: string | null = null;
            setLocalBoards(prev => {
                const freshBoard = prev.find(b => b.id === targetBoard.id);
                if (!freshBoard) return prev;
                const offender = findCollisionAgainst(freshBoard);
                if (offender) {
                    abortMsg = `La pieza choca con "${offender.code}" en (${offender.x},${offender.y}).`;
                    return prev;
                }
                const next = prev.map(board => {
                    if (board.id !== targetBoard.id) return board;
                    if (board.placedPieces.some(p => p.id === newPieceId)) return board;
                    return {
                        ...board,
                        placedPieces: [...board.placedPieces, newPiece],
                        usedArea: board.usedArea + newPiece.width * newPiece.height
                    };
                });
                latestBoardsRef.current = next;
                return next;
            });
            if (abortMsg) {
                showError(abortMsg);
                return clearDrag();
            }

            setRepository(prev => {
                const boardRepoPrev = prev[targetBoard.id] || {};
                const existing = boardRepoPrev[code];
                if (!existing) return prev;
                // Consumir el origin que coincida (si hubo snap) o el primero disponible.
                const remainingOrigins = consumedOriginPieceId
                    ? existing.origins.filter(o => o.pieceId !== consumedOriginPieceId)
                    : existing.origins.slice(1);
                if (existing.count <= 1) {
                    const nextRepo = { ...boardRepoPrev };
                    delete nextRepo[code];
                    return { ...prev, [targetBoard.id]: nextRepo };
                }
                return {
                    ...prev,
                    [targetBoard.id]: {
                        ...boardRepoPrev,
                        [code]: { ...existing, count: existing.count - 1, origins: remainingOrigins }
                    }
                };
            });

            // Re-incrementar `quantity` en la tabla del padre — la pieza vuelve al plan.
            if (onPiecesAdjust && newPiece.pieceTemplateId) {
                onPiecesAdjust({ [newPiece.pieceTemplateId]: 1 });
            }

            // Selección al nuevo id colocado.
            setSelectionBoardId(targetBoard.id);
            setSelectedIds(new Set([newPieceId]));

            setNewBoardPieceIds(prev => new Set(prev).add(newPieceId));
            setTimeout(() => setNewBoardPieceIds(prev => { const s = new Set(prev); s.delete(newPieceId); return s; }), 450);

            clearDrag();
            return;
        }

        // BOARD → BOARD distinto: mover el grupo completo.
        if (ctx.sourceType === 'BOARD') {
            const sourceBoardId = ctx.sourceBoardId;
            const movedTotalArea = ctx.pieces.reduce((acc, p) => acc + p.width * p.height, 0);
            const tsTag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const newPiecesForTarget: PlacedPiece[] = proposed.map(({ piece, newX, newY }, i) => {
                const np: PlacedPiece = JSON.parse(JSON.stringify(piece));
                np.id = `${piece.pieceTemplateId}-mv-${tsTag}-${i}`;
                np.x = newX;
                np.y = newY;
                return np;
            });
            const movingIdsSet = new Set(ctx.pieces.map(p => p.id));

            let abortMsg: string | null = null;
            setLocalBoards(prev => {
                const srcBoard = prev.find(b => b.id === sourceBoardId);
                if (!srcBoard) return prev;
                // Si la pieza fuente ya no está, abortar para no insertar el destino y duplicar.
                const stillPresent = srcBoard.placedPieces.some(p => movingIdsSet.has(p.id));
                if (!stillPresent) return prev;
                const freshTargetBoard = prev.find(b => b.id === targetBoard.id);
                if (!freshTargetBoard) return prev;
                const offender = findCollisionAgainst(freshTargetBoard);
                if (offender) {
                    abortMsg = `La pieza choca con "${offender.code}".`;
                    return prev;
                }
                const next = prev.map(board => {
                    if (board.id === sourceBoardId) {
                        return {
                            ...board,
                            placedPieces: board.placedPieces.filter(p => !movingIdsSet.has(p.id)),
                            usedArea: Math.max(0, board.usedArea - movedTotalArea)
                        };
                    }
                    if (board.id === targetBoard.id) {
                        const existingIds = new Set(board.placedPieces.map(p => p.id));
                        const toAdd = newPiecesForTarget.filter(p => !existingIds.has(p.id));
                        return {
                            ...board,
                            placedPieces: [...board.placedPieces, ...toAdd],
                            usedArea: board.usedArea + toAdd.reduce((a, p) => a + p.width * p.height, 0)
                        };
                    }
                    return board;
                });
                latestBoardsRef.current = next;
                return next;
            });

            if (abortMsg) {
                showError(abortMsg);
                return clearDrag();
            }

            for (const np of newPiecesForTarget) {
                setNewBoardPieceIds(prev => new Set(prev).add(np.id));
                setTimeout(() => setNewBoardPieceIds(prev => { const s = new Set(prev); s.delete(np.id); return s; }), 450);
            }

            // Selección sigue al grupo en el tablero destino.
            setSelectionBoardId(targetBoard.id);
            setSelectedIds(new Set(newPiecesForTarget.map(p => p.id)));
        }

        clearDrag();
    };

    // Rotación de la selección activa (modo manual). Tecla 'R'/'r'.
    // Cada pieza intercambia ancho/alto manteniendo su esquina superior-izquierda;
    // se valida bordes del tablero y colisiones contra el resto, considerando
    // las nuevas dimensiones de las otras piezas seleccionadas (rotación grupal).
    const rotateSelection = () => {
        if (!selectionBoardId || selectedIds.size === 0) return;
        const fresh = latestBoardsRef.current;
        const board = fresh.find(b => b.id === selectionBoardId);
        if (!board) return;
        const bw = board.width || fallbackW;
        const bh = board.height || fallbackH;

        const selectedPieces = board.placedPieces.filter(p => selectedIds.has(p.id));
        if (selectedPieces.length === 0) return;

        // Mapa id → nuevas dimensiones tras rotar.
        const rotatedDims = new Map(selectedPieces.map(p => [p.id, { w: p.height, h: p.width }]));

        // Bordes: el bbox rotado debe caber dentro del tablero.
        for (const p of selectedPieces) {
            const nd = rotatedDims.get(p.id)!;
            if (p.x < 0 || p.y < 0 || p.x + nd.w > bw || p.y + nd.h > bh) {
                showError(`"${p.code}" no cabe rotada en el tablero.`);
                return;
            }
        }

        // Colisiones: cada pieza seleccionada (con sus nuevas dims) vs todas las
        // demás (las no seleccionadas mantienen sus dims originales; las
        // seleccionadas usan sus dims rotadas).
        for (const p of selectedPieces) {
            const nd = rotatedDims.get(p.id)!;
            for (const other of board.placedPieces) {
                if (other.id === p.id) continue;
                const otherDims = rotatedDims.get(other.id);
                const ow = otherDims ? otherDims.w : other.width;
                const oh = otherDims ? otherDims.h : other.height;
                const overlapX = p.x < other.x + ow && p.x + nd.w > other.x;
                const overlapY = p.y < other.y + oh && p.y + nd.h > other.y;
                if (overlapX && overlapY) {
                    showError(`"${p.code}" rotada chocaría con "${other.code}".`);
                    return;
                }
            }
        }

        setLocalBoards(prev => {
            const next = prev.map(b => {
                if (b.id !== selectionBoardId) return b;
                return {
                    ...b,
                    placedPieces: b.placedPieces.map(p => {
                        if (!selectedIds.has(p.id)) return p;
                        return { ...p, width: p.height, height: p.width, rotated: !p.rotated };
                    })
                };
            });
            latestBoardsRef.current = next;
            return next;
        });
    };

    // Listener global de teclado: 'R' rota la selección estando en modo manual.
    // Se ignora si el foco está en un input/textarea para no interferir con
    // la edición de campos en el resto de la página.
    useEffect(() => {
        if (!isManual) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'r' && e.key !== 'R') return;
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
            if (!selectionBoardId || selectedIds.size === 0) return;
            e.preventDefault();
            rotateSelection();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isManual, selectionBoardId, selectedIds]);

    return (
        <div className="flex flex-col h-full bg-[#edf0f5]">
            {/* Header */}
            <div className="px-10 py-6 border-b border-[#cbd5e1] flex items-center justify-between bg-white/95 backdrop-blur-md">
                <div className="flex items-center gap-6">
                    <h2 className="text-xl font-[900] text-[#1c3547] tracking-tight">Mapa de Corte Optimizado</h2>
                    {boards.length > 0 && (
                        <div className="px-3 py-1 rounded-full bg-white text-[#4A90E2] flex items-center gap-1.5 border border-[#4A90E2]/30 shadow-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#4A90E2]"></div>
                            <span className="text-[10px] font-black tracking-wider uppercase">{String(localBoards.length).padStart(2, '0')} Tableros</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {isManual && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#4A90E2]/5 border border-[#4A90E2]/20 text-[10px] font-black uppercase tracking-wider text-[#1c3547]/60">
                            <span className="material-icons-round text-[14px] text-[#4A90E2]/70">rotate_right</span>
                            <span>Selecciona una pieza y pulsa</span>
                            <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#cbd5e1] text-[#1c3547] font-mono text-[10px] shadow-sm">R</kbd>
                            <span>para rotar</span>
                        </div>
                    )}
                    <button
                        onClick={() => setIsManual(!isManual)}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl transition-all duration-300 font-black text-[11px] uppercase tracking-widest ${
                            isManual
                            ? 'bg-[#1c3547] text-white shadow-lg shadow-[#1c3547]/20 scale-105'
                            : 'bg-white text-[#1c3547]/40 border border-[#cbd5e1] hover:border-[#1c3547]/20'
                        }`}
                    >
                        <span className={`material-icons-round text-sm ${isManual ? 'animate-pulse' : ''}`}>
                            {isManual ? 'edit' : 'lock_open'}
                        </span>
                        {isManual ? 'Modo Manual Activo' : 'Manual'}
                    </button>
                </div>
            </div>

            {/* Error Toast */}
            {localError && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-[#e11d48] text-white px-6 py-2.5 rounded-full shadow-lg font-black text-xs tracking-wider flex items-center gap-2 border border-white/20">
                        <span className="material-icons-round text-sm">warning</span>
                        {localError}
                    </div>
                </div>
            )}

            {/* Map Area */}
            <div className="flex-1 overflow-auto p-12 flex flex-col items-center gap-24 min-h-0 relative custom-scrollbar">
                {localBoards.length === 0 ? (
                    <div className="flex-1 w-full flex flex-col items-center justify-center text-[#366480]/20">
                        <span className="material-icons-round text-7xl mb-4 opacity-10">grid_view</span>
                        <p className="font-black text-sm uppercase tracking-[0.2em]">Optimice para visualizar el mapa</p>
                    </div>
                ) : (
                    materialGroupsArray.map((group, groupIdx) => {
                        const color = MAT_COLORS[groupIdx % MAT_COLORS.length];
                        return (
                            <div key={group.matKey} className="w-full flex flex-col gap-12">
                                {materialGroupsArray.length > 1 && (
                                    <div className="flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm self-center">
                                        <div className={`w-3.5 h-3.5 rounded-full ${color.badge} shadow-sm`}></div>
                                        <span className="font-[900] text-xs uppercase tracking-[0.25em] text-[#1c3547]">{group.matLabel}</span>
                                        <div className="ml-6 w-px h-4 bg-[#1c3547]/10"></div>
                                        <span className="ml-2 text-[10px] font-black text-[#1c3547]/40">{group.boards.length} UNIDADES</span>
                                    </div>
                                )}

                                {group.boards.map((board) => {
                                    const bw = board.width || fallbackW;
                                    const bh = board.height || fallbackH;
                                    const localIdx = globalBoardIndex++;
                                    const usePct = ((board.usedArea / (bw * bh)) * 100).toFixed(1);
                                    const matKey = matKeyOf(board);
                                    const boardRepo = repository[board.id] || {};
                                    const repoItems = Object.values(boardRepo);
                                    const repoCount = repoItems.reduce((acc, i) => acc + i.count, 0);
                                    // La superficie del tablero se ilumina con cualquier arrastre
                                    // del mismo material (permite movimientos cross-board).
                                    const isPair = draggingMaterialKey === matKey;
                                    // El repo solo se ilumina si la pieza viene de ESTE mismo
                                    // tablero — los demás repos no aceptan la pieza.
                                    const isOwnRepoTarget = draggingSourceBoardId === board.id;

                                    return (
                                        <div key={board.id} className={`w-full max-w-7xl flex gap-12 shrink-0 transition-all duration-500 ${isManual ? 'items-start justify-start pl-20' : 'items-center justify-center'}`}>

                                            {/* Board Column */}
                                            <div className="flex flex-col gap-5 w-full max-w-5xl">
                                                <div className="flex items-center justify-between px-8">
                                                    <div className="flex items-center gap-5">
                                                        <div className="bg-[#1c3547] text-white px-4 py-1.5 rounded-lg text-[10px] font-black tracking-[0.15em] uppercase shadow-sm">
                                                            Tablero {String(localIdx + 1).padStart(2, '0')}
                                                        </div>
                                                        <span className="text-[11px] font-black text-[#1c3547]/30 font-mono tracking-wider">{bw} × {bh} mm</span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className="text-[9px] font-black text-[#1c3547]/40 uppercase tracking-widest">Utilización</span>
                                                            <span className="text-[14px] font-black text-[#1c3547] leading-none">{usePct}%</span>
                                                        </div>
                                                        <div className="h-10 w-[2px] bg-[#1c3547]/5"></div>
                                                        <div className="h-2 w-32 bg-white rounded-full overflow-hidden border border-slate-200">
                                                            <div className="h-full bg-[#1c3547] opacity-80 transition-all duration-1000" style={{ width: `${usePct}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Board surface */}
                                                <div
                                                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                                    onDrop={e => handleDropOnBoard(e, board)}
                                                    onMouseDown={e => {
                                                        // Click en zona vacía del tablero limpia la selección.
                                                        if (isManual && e.target === e.currentTarget) clearSelection();
                                                    }}
                                                    className={`relative w-full bg-[#f8f9fc] shadow-[0_30px_70px_rgba(0,0,0,0.08)] mx-auto overflow-hidden border-[8px] border-white ring-1 ring-black/5 transition-all duration-300 ${isManual && isPair && dragSourceType ? 'ring-2 ring-[#4A90E2] ring-offset-4 ring-offset-[#edf0f5]' : ''}`}
                                                    style={{ aspectRatio: `${bw} / ${bh}` }}
                                                >
                                                    <div
                                                        className="absolute inset-0 pointer-events-none"
                                                        style={{
                                                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 15px, rgba(28,53,71,0.04) 15px, rgba(28,53,71,0.04) 16px)',
                                                            backgroundColor: '#f8f9fc'
                                                        }}
                                                    />
                                                    <div
                                                        className="absolute inset-0"
                                                        onMouseDown={e => {
                                                            if (isManual && e.target === e.currentTarget) clearSelection();
                                                        }}
                                                    >
                                                        {board.placedPieces.map((piece, index) => {
                                                            const left  = (piece.x / bw) * 100 + '%';
                                                            const top   = (piece.y / bh) * 100 + '%';
                                                            const w     = (piece.width / bw) * 100 + '%';
                                                            const h     = (piece.height / bh) * 100 + '%';
                                                            const isSmall = piece.width < 275 && piece.height < 275;
                                                            const pieceColor = getCodeColor(piece.code || '');
                                                            const isDragging = draggingPieceIds.has(piece.id);
                                                            const isNew = newBoardPieceIds.has(piece.id);
                                                            const isSelected = selectionBoardId === board.id && selectedIds.has(piece.id);

                                                            return (
                                                                <div
                                                                    key={piece.id}
                                                                    draggable={isManual}
                                                                    onMouseDown={e => handlePieceMouseDown(e, piece, board)}
                                                                    onDragStart={e => handleDragStartFromBoard(e, piece, board)}
                                                                    onDragEnd={clearDrag}
                                                                    className={`absolute flex flex-col items-center justify-center ${isManual ? 'cursor-grab active:cursor-grabbing hover:brightness-90' : ''} ${isNew ? 'anim-piece-grow' : ''}`}
                                                                    style={{
                                                                        left, top, width: w, height: h,
                                                                        backgroundColor: pieceColor,
                                                                        border: isSelected ? '2px solid #4A90E2' : '1px solid #cbd5e1',
                                                                        boxShadow: isSelected ? '0 0 0 2px rgba(74,144,226,0.25)' : undefined,
                                                                        opacity: isDragging ? 0.35 : 1,
                                                                        transform: isDragging ? 'scale(0.88) rotate(2deg)' : undefined,
                                                                        transition: isDragging ? 'none' : 'opacity 0.2s ease, border-color 0.15s ease',
                                                                        zIndex: isDragging ? 100 : (isSelected ? 5 : 1)
                                                                    }}
                                                                >
                                                                    <div className="absolute top-2 left-2 bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-lg border border-black/5 shadow-sm">
                                                                        <span className="text-[10px] font-black text-[#1c3547]">{(piece as any).printIndex || index + 1}</span>
                                                                    </div>
                                                                    <div className={`absolute w-2 h-2 rounded-full bg-[#e11d48] z-20 shadow-sm border-2 border-white ${piece.rotated ? 'top-2 right-2' : 'bottom-2 left-2'}`} />
                                                                    {!isSmall && (
                                                                        <div className="flex flex-col items-center justify-center p-4 text-center pointer-events-none">
                                                                            <span className="text-[11px] font-black text-[#1c3547] leading-tight uppercase truncate w-full px-2">{piece.code}</span>
                                                                            <span className="text-[10px] font-bold text-[#1c3547]/40 mt-1.5 bg-white/30 px-2 py-0.5 rounded-full">{piece.width} × {piece.height}</span>
                                                                        </div>
                                                                    )}
                                                                    {piece.rotated && (
                                                                        <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-white/50 backdrop-blur-sm flex items-center justify-center border border-white">
                                                                            <span className="material-icons-round text-[14px] text-[#1c3547]/60">sync</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Repository — only shown in Manual mode, bound exclusively to this board */}
                                            {isManual && (
                                                <div className="flex flex-col gap-5 w-80 shrink-0 animate-in fade-in slide-in-from-right-10 duration-500">
                                                    <div className="flex items-center gap-3 px-4 h-10">
                                                        <span className="material-icons-round text-[#1c3547]/30 text-lg">inventory_2</span>
                                                        <span className="text-[11px] font-black text-[#1c3547] uppercase tracking-widest">Repositorio</span>
                                                        {repoCount > 0 && (
                                                            <span className="ml-auto text-[10px] font-black text-[#e11d48] bg-[#e11d48]/10 px-2 py-0.5 rounded-full">
                                                                {repoCount} pzs
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div
                                                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                                        onDrop={e => handleDropOnRepo(e, board)}
                                                        className={`relative w-full aspect-square bg-white/40 border-2 border-dashed rounded-[40px] flex flex-wrap content-start p-8 gap-6 transition-all duration-300 overflow-auto custom-scrollbar ${isManual && isOwnRepoTarget && dragSourceType === 'BOARD' ? 'border-[#4A90E2] bg-[#4A90E2]/5 shadow-inner' : 'border-[#cbd5e1] hover:border-[#1c3547]/20'}`}
                                                    >
                                                        {repoItems.length === 0 ? (
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#1c3547]/20 pointer-events-none select-none">
                                                                <span className="material-icons-round text-4xl mb-3">move_to_inbox</span>
                                                                <p className="text-[9px] font-black uppercase text-center leading-relaxed">Arrastre piezas aquí<br/>para removerlas</p>
                                                            </div>
                                                        ) : (
                                                            repoItems.map((item) => {
                                                                const animKey = `${matKey}:${item.code}`;
                                                                const isNewRepo = newRepoCodes.has(animKey);

                                                                // Conservar la proporción de la pieza, en versión pequeña.
                                                                // Caja contenedora máx 110x110; escalamos por el lado mayor.
                                                                const MAX_BOX = 110;
                                                                const longSide = Math.max(item.piece.width, item.piece.height);
                                                                const scale = MAX_BOX / longSide;
                                                                const itemW = Math.max(28, Math.round(item.piece.width * scale));
                                                                const itemH = Math.max(28, Math.round(item.piece.height * scale));
                                                                const isTinyItem = itemW < 70 || itemH < 50;

                                                                return (
                                                                    <div
                                                                        key={item.code}
                                                                        draggable
                                                                        onDragStart={e => handleDragStartFromRepo(e, item, board)}
                                                                        onDragEnd={clearDrag}
                                                                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                                                                        onDrop={e => { e.stopPropagation(); handleDropOnRepo(e, board); }}
                                                                        className={`relative cursor-grab active:cursor-grabbing ${isNewRepo ? 'anim-repo-shrink' : ''}`}
                                                                        style={{
                                                                            width: `${itemW}px`,
                                                                            height: `${itemH}px`,
                                                                            backgroundColor: item.color,
                                                                            border: '1px solid #cbd5e1',
                                                                            borderRadius: '10px',
                                                                            transition: isNewRepo ? 'none' : 'transform 0.15s ease'
                                                                        }}
                                                                        onMouseEnter={e => { if (!isNewRepo) (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
                                                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                                                                    >
                                                                        {item.count > 1 && (
                                                                            <div className="absolute -top-3 -right-3 bg-[#e11d48] text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg border-2 border-white z-20">
                                                                                x{item.count}
                                                                            </div>
                                                                        )}
                                                                        {!isTinyItem && (
                                                                            <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center pointer-events-none">
                                                                                <span className="text-[9px] font-black text-[#1c3547] truncate w-full text-center leading-tight">{item.code}</span>
                                                                                <span className="text-[7px] font-bold text-[#1c3547]/40 mt-0.5 uppercase tracking-tighter">{item.piece.width}×{item.piece.height}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Legend */}
            <div className="px-12 py-6 border-t border-[#cbd5e1] bg-white/60 backdrop-blur-md flex justify-between items-center shrink-0">
                <div className="flex items-center gap-10">
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-lg bg-[#f8f9fc] border border-[#1c3547]/10 shadow-sm"></div>
                        <span className="text-[11px] font-[900] text-[#1c3547]/40 uppercase tracking-[0.2em]">Tablero Material</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-lg bg-white border border-[#1c3547]/10 flex items-center justify-center shadow-sm">
                            <div className="w-2.5 h-2.5 rounded-sm bg-slate-100"></div>
                        </div>
                        <span className="text-[11px] font-[900] text-[#1c3547]/40 uppercase tracking-[0.2em]">Piezas Optimización</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-[#e11d48] border-2 border-white shadow-md"></div>
                        <span className="text-[11px] font-[900] text-[#1c3547]/40 uppercase tracking-[0.2em]">Punto de Referencia</span>
                    </div>
                </div>
                <div className="flex items-center gap-8">
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-[9px] font-black text-[#1c3547]/30 uppercase tracking-[0.3em]">Resumen de Salida</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[16px] font-black text-[#1c3547]">{localBoards.length}</span>
                            <span className="text-[10px] font-black text-[#1c3547]/40 uppercase tracking-widest">Tableros Totales</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});
