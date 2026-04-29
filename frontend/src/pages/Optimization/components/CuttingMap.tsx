import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import type { Board, PlacedPiece } from '../lib/optimizationAlgorithm';

interface CuttingMapProps {
    boards: Board[];
    boardWidth?: number;
    boardHeight?: number;
    /** Grosor de la sierra (mm). Las piezas no pueden quedar más cerca que este
     *  valor entre sí — refleja el material que se "pierde" en el corte. */
    sawKerf?: number;
    /** Refilado / trimming del tablero (mm). Las piezas no pueden invadir esta
     *  franja en ningún lado. */
    trimming?: { top: number; bottom: number; left: number; right: number };
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

export const CuttingMap = memo(({ boards, boardWidth, boardHeight, sawKerf, trimming, onPiecesAdjust }: CuttingMapProps) => {
    // Constantes de geometría usadas en validación y snap magnético.
    const kerf = Math.max(0, sawKerf ?? 0);
    const trim = {
        top: Math.max(0, trimming?.top ?? 0),
        bottom: Math.max(0, trimming?.bottom ?? 0),
        left: Math.max(0, trimming?.left ?? 0),
        right: Math.max(0, trimming?.right ?? 0)
    };
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
    // Mismo patrón para repository — los handlers leen siempre lo último, sin
    // depender de la closure del render previo.
    const latestRepositoryRef = useRef<Repository>({});

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
        const cloned: Board[] = JSON.parse(JSON.stringify(boards));
        // FIX duplicación cross-material: el optimizador genera ids como
        // "board-1", "board-2" reiniciando el contador en CADA llamada, y en
        // OptimizationLayout se llama una vez POR MATERIAL. Con dos o más
        // materiales hay colisión de ids ("board-1" del material 1 == "board-1"
        // del material 2). Eso hacía que `fresh.map(b => b.id === target.id ? ... : b)`
        // mutara AMBOS tableros — duplicando la pieza en el tablero que no era.
        // Normalizamos prefijando con materialNumber para garantizar unicidad
        // dentro del estado local. El padre conserva sus ids originales.
        const seen = new Set<string>();
        for (const b of cloned) {
            const matKey = b.materialNumber || 'default';
            let id = `m${matKey}#${b.id}`;
            let suffix = 0;
            while (seen.has(id)) {
                suffix++;
                id = `m${matKey}#${b.id}#${suffix}`;
            }
            seen.add(id);
            b.id = id;
        }
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

    useEffect(() => {
        latestRepositoryRef.current = repository;
    }, [repository]);

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
    //
    // El patrón es: leer estado fresco desde refs → validar → setear DIRECTO.
    // No usamos `setLocalBoards(prev => ...)` con abortMsg leakage porque ese
    // patrón causaba estados inconsistentes (la verificación afterwards leía
    // `let abortMsg` ANTES de que el updater corriese, por el batching de React).
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
        const { sourceBoardId } = ctx;

        const fresh = latestBoardsRef.current;
        const srcFresh = fresh.find(b => b.id === sourceBoardId);
        if (!srcFresh) return clearDrag();

        const movingIds = new Set(ctx.pieces.map(p => p.id));
        const actuallyPresent = srcFresh.placedPieces.filter(p => movingIds.has(p.id));
        if (actuallyPresent.length === 0) return clearDrag();

        const actuallyMovingIds = new Set(actuallyPresent.map(p => p.id));
        const movedTotalArea = actuallyPresent.reduce((acc, p) => acc + p.width * p.height, 0);

        const nextBoards = fresh.map(b => {
            if (b.id !== sourceBoardId) return b;
            return {
                ...b,
                placedPieces: b.placedPieces.filter(p => !actuallyMovingIds.has(p.id)),
                usedArea: Math.max(0, b.usedArea - movedTotalArea)
            };
        });
        latestBoardsRef.current = nextBoards;
        setLocalBoards(nextBoards);

        const repoNow = latestRepositoryRef.current;
        const boardRepo = { ...(repoNow[targetBoard.id] || {}) };
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
        const nextRepo = { ...repoNow, [targetBoard.id]: boardRepo };
        latestRepositoryRef.current = nextRepo;
        setRepository(nextRepo);

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

    // ---------- Helpers de geometría con kerf y trimming ----------

    // ¿La pieza A en (ax,ay) con (aw,ah) y la pieza B en (bx,by,bw,bh) están más
    // cerca que `kerf` mm? Devuelve true si se "tocan" (incluyendo distancia 0
    // al considerar el grosor de la sierra). Útil para validar colocación.
    const hitsWithKerf = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean => {
        // Sin separación de al menos kerf en X o Y → conflicto.
        const overlapX = ax < bx + bw + kerf && ax + aw + kerf > bx;
        const overlapY = ay < by + bh + kerf && ay + ah + kerf > by;
        return overlapX && overlapY;
    };

    // Bordes con trimming: la pieza debe caber dentro del rectángulo útil.
    const fitsInBounds = (x: number, y: number, w: number, h: number, bw: number, bh: number): boolean => {
        return x >= trim.left && y >= trim.top && x + w <= bw - trim.right && y + h <= bh - trim.bottom;
    };

    // Snap magnético: dado el cursor (cx,cy) y la pieza (pw,ph) que se quiere
    // colocar en `board`, devuelve la posición válida más cercana al cursor
    // (respetando bordes con trimming y kerf entre piezas). `excludeIds` ignora
    // piezas que se están moviendo (para no chocar con uno mismo en intra-mov.).
    // Si nada cabe dentro de la tolerancia, devuelve null.
    const magneticSnap = (
        cx: number, cy: number,
        pw: number, ph: number,
        board: Board,
        excludeIds: Set<string>,
        toleranceMm: number
    ): { x: number; y: number } | null => {
        const bw = board.width || fallbackW;
        const bh = board.height || fallbackH;
        const minX = trim.left;
        const minY = trim.top;
        const maxX = bw - trim.right - pw;
        const maxY = bh - trim.bottom - ph;
        if (maxX < minX || maxY < minY) return null;

        const others = board.placedPieces.filter(p => !excludeIds.has(p.id));

        // Candidatos de X: cursor, bordes útiles, y posiciones "pegadas" a otras
        // piezas con kerf (a derecha, a izquierda, alineadas al borde del vecino).
        const xs = new Set<number>([Math.round(cx), minX, maxX]);
        const ys = new Set<number>([Math.round(cy), minY, maxY]);
        for (const o of others) {
            xs.add(o.x + o.width + kerf);
            xs.add(o.x - pw - kerf);
            xs.add(o.x);
            xs.add(o.x + o.width - pw);
            ys.add(o.y + o.height + kerf);
            ys.add(o.y - ph - kerf);
            ys.add(o.y);
            ys.add(o.y + o.height - ph);
        }

        let best: { x: number; y: number; dist: number } | null = null;
        for (const xRaw of xs) {
            const x = Math.round(xRaw);
            if (x < minX || x > maxX) continue;
            for (const yRaw of ys) {
                const y = Math.round(yRaw);
                if (y < minY || y > maxY) continue;
                let collides = false;
                for (const o of others) {
                    if (hitsWithKerf(x, y, pw, ph, o.x, o.y, o.width, o.height)) { collides = true; break; }
                }
                if (collides) continue;
                const dx = x - cx;
                const dy = y - cy;
                const dist = Math.hypot(dx, dy);
                if (dist > toleranceMm) continue;
                if (!best || dist < best.dist) best = { x, y, dist };
            }
        }
        return best ? { x: best.x, y: best.y } : null;
    };

    // Tablero acepta:
    //   - REPO → BOARD: la pieza solo puede volver a su tablero de origen
    //     (cada repo es privado al tablero, no compartido por material)
    //   - BOARD → BOARD distintos pero del MISMO material (mueve la pieza)
    //   - Re-posicionamiento dentro del mismo tablero (incluye snap-a-origen)
    // Soporta drop multi-pieza preservando offsets relativos al anchor.
    //
    // Validación: bordes contra trimming, colisiones contra otras piezas con
    // gap mínimo de `kerf`. Drop con mouse aplica snap magnético (busca el
    // hueco válido más cercano para que el usuario no calcule al milímetro).
    const handleDropOnBoard = (e: React.DragEvent, targetBoard: Board) => {
        e.preventDefault();
        const ctx = dragCtxRef.current;
        if (!ctx) return clearDrag();
        const targetMatKey = matKeyOf(targetBoard);
        // Validación de material: solo permitir mezcla cuando MAT. coincide.
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

        const draggingIds = new Set(ctx.pieces.map(p => p.id));
        const isSameBoardMove = ctx.sourceType === 'BOARD' && ctx.sourceBoardId === targetBoard.id;

        // Estado fresco: piezas y repo. Los closures pueden estar stale entre
        // dragstart y drop si hubo un re-render del padre — los refs no.
        const fresh = latestBoardsRef.current;
        const tgtFresh = fresh.find(b => b.id === targetBoard.id);
        if (!tgtFresh) return clearDrag();

        // Conjunto de IDs a excluir al validar (las que se mueven).
        const excludeIds = new Set<string>(isSameBoardMove ? ctx.pieces.map(p => p.id) : []);

        // Detector de colisión basado en kerf: dos piezas no pueden estar a
        // menos de `kerf` mm entre sí (refleja el grosor real de la sierra).
        const findCollisionOn = (board: Board, items: { piece: PlacedPiece; newX: number; newY: number }[]): PlacedPiece | null => {
            for (const { piece, newX, newY } of items) {
                for (const p of board.placedPieces) {
                    if (p.id === piece.id) continue;
                    if (isSameBoardMove && draggingIds.has(p.id)) continue;
                    if (hitsWithKerf(newX, newY, piece.width, piece.height, p.x, p.y, p.width, p.height)) return p;
                }
            }
            return null;
        };

        // ---------- 1) RE-POSICIONAMIENTO INTRA-TABLERO ----------
        if (isSameBoardMove) {
            // Snap magnético: si la posición exacta del cursor no es válida o
            // está cerca de un hueco más limpio, atrae al spot válido más
            // cercano (respeta trim y kerf). Solo se aplica si es 1 sola pieza
            // o si el grupo entero cabe; con grupos, snap se aplica al anchor.
            const anchorIdx = ctx.anchorIndex;
            const anchorProposed = proposed[anchorIdx];
            const tolerance = Math.max(anchorProposed.piece.width, anchorProposed.piece.height) * 1.2;
            const snapped = magneticSnap(
                anchorProposed.newX, anchorProposed.newY,
                anchorProposed.piece.width, anchorProposed.piece.height,
                tgtFresh, excludeIds, tolerance
            );
            // Si hubo snap del anchor, recalcular toda la propuesta usando los
            // mismos offsets relativos.
            if (snapped) {
                const ax = snapped.x, ay = snapped.y;
                for (let i = 0; i < proposed.length; i++) {
                    proposed[i] = {
                        piece: proposed[i].piece,
                        newX: ax + ctx.relativeOffsets[i].dx,
                        newY: ay + ctx.relativeOffsets[i].dy
                    };
                }
            }

            // Bordes con trimming
            for (const { piece, newX, newY } of proposed) {
                if (!fitsInBounds(newX, newY, piece.width, piece.height, bw, bh)) {
                    showError("Alguna pieza queda fuera del refilado del tablero.");
                    return clearDrag();
                }
            }
            const offender = findCollisionOn(tgtFresh, proposed);
            if (offender) {
                showError(`La pieza choca con "${offender.code}" (mín. ${kerf}mm de sierra).`);
                return clearDrag();
            }
            const updatedById = new Map(proposed.map(({ piece, newX, newY }) => [piece.id, { x: newX, y: newY }]));
            const next = fresh.map(board => {
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
            setLocalBoards(next);
            clearDrag();
            return;
        }

        // ---------- 2) REPO → BOARD ----------
        if (ctx.sourceType === 'REPO') {
            // Repo privado al tablero: solo vuelve al de origen.
            if (ctx.sourceBoardId !== targetBoard.id) {
                showError("La pieza del repositorio solo puede volver a su tablero de origen.");
                return clearDrag();
            }
            const code = ctx.pieceCodes[0];
            const repoNow = latestRepositoryRef.current;
            const boardRepo = repoNow[targetBoard.id];
            const repoItem = boardRepo?.[code];
            if (!repoItem || repoItem.count <= 0) return clearDrag();

            const cursorX = proposed[0].newX;
            const cursorY = proposed[0].newY;
            const pw = repoItem.piece.width;
            const ph = repoItem.piece.height;

            const originOnTarget = repoItem.origins.find(o => o.boardId === targetBoard.id);
            let placeX: number | null = null;
            let placeY: number | null = null;
            let consumedOriginPieceId: string | null = null;

            // Validador del origen contra el estado fresco del tablero (bordes y kerf).
            const isOriginFreeAndValid = (): boolean => {
                if (!originOnTarget) return false;
                const ox = originOnTarget.x, oy = originOnTarget.y;
                if (!fitsInBounds(ox, oy, pw, ph, bw, bh)) return false;
                for (const p of tgtFresh.placedPieces) {
                    if (hitsWithKerf(ox, oy, pw, ph, p.x, p.y, p.width, p.height)) return false;
                }
                return true;
            };

            // Prioridad 1: snap a origen exacto si está libre.
            // Antes la tolerancia era max(pw,ph) * 0.6 — demasiado estricta. En piezas
            // pequeñas y pares de piezas extraídas (esquinas o medio del tablero), si
            // el cursor caía fuera de ese radio el snap a origen no se activaba y se
            // pasaba a magneticSnap, que con pocos vecinos suele aterrizar en la propia
            // posición del cursor (no en el origen). Eso colocaba la pieza off-by-X mm
            // pegada a la vecina y disparaba el chequeo de kerf, rechazando el drop.
            // Con tolerancia 1.5x — y validación previa de que el origen está libre —
            // la pieza vuelve a su sitio exacto siempre que el usuario suelte cerca.
            if (originOnTarget && isOriginFreeAndValid()) {
                const dxAbs = Math.abs(cursorX - originOnTarget.x);
                const dyAbs = Math.abs(cursorY - originOnTarget.y);
                const generous = Math.max(pw, ph) * 1.5;
                if (dxAbs <= generous && dyAbs <= generous) {
                    placeX = originOnTarget.x;
                    placeY = originOnTarget.y;
                    consumedOriginPieceId = originOnTarget.pieceId;
                }
            }

            // Prioridad 2: snap magnético al hueco más cercano al cursor.
            if (placeX === null || placeY === null) {
                const tolerance = Math.max(pw, ph) * 2;
                const snapped = magneticSnap(cursorX, cursorY, pw, ph, tgtFresh, new Set(), tolerance);
                if (snapped) {
                    placeX = snapped.x;
                    placeY = snapped.y;
                } else if (isOriginFreeAndValid()) {
                    // Último recurso: cursor lejos pero el origen sigue libre.
                    // El usuario claramente quiere devolverla; la mandamos al sitio original.
                    placeX = originOnTarget!.x;
                    placeY = originOnTarget!.y;
                    consumedOriginPieceId = originOnTarget!.pieceId;
                } else {
                    showError("No hay espacio válido cerca para colocar la pieza.");
                    return clearDrag();
                }
            }

            // Doble check defensivo (trim + kerf) — los pasos previos ya validan,
            // este re-chequeo cubre cualquier discrepancia residual.
            if (!fitsInBounds(placeX, placeY, pw, ph, bw, bh)) {
                showError("La pieza queda fuera del refilado del tablero.");
                return clearDrag();
            }
            const finalProposed = [{ piece: proposed[0].piece, newX: placeX, newY: placeY }];
            const offender = findCollisionOn(tgtFresh, finalProposed);
            if (offender) {
                showError(`La pieza choca con "${offender.code}" (mín. ${kerf}mm de sierra).`);
                return clearDrag();
            }

            const newPieceId = consumedOriginPieceId
                ?? `${repoItem.piece.pieceTemplateId}-repo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const newPiece: PlacedPiece = JSON.parse(JSON.stringify(repoItem.piece));
            newPiece.id = newPieceId;
            newPiece.x = placeX;
            newPiece.y = placeY;

            const nextBoards = fresh.map(board => {
                if (board.id !== targetBoard.id) return board;
                if (board.placedPieces.some(p => p.id === newPieceId)) return board;
                return {
                    ...board,
                    placedPieces: [...board.placedPieces, newPiece],
                    usedArea: board.usedArea + newPiece.width * newPiece.height
                };
            });
            latestBoardsRef.current = nextBoards;
            setLocalBoards(nextBoards);

            // Decrementar repo (consumir el origin usado o el primero disponible).
            const remainingOrigins = consumedOriginPieceId
                ? repoItem.origins.filter(o => o.pieceId !== consumedOriginPieceId)
                : repoItem.origins.slice(1);
            const updatedBoardRepo: Record<string, RepositoryItem> = { ...boardRepo };
            if (repoItem.count <= 1) {
                delete updatedBoardRepo[code];
            } else {
                updatedBoardRepo[code] = { ...repoItem, count: repoItem.count - 1, origins: remainingOrigins };
            }
            const nextRepo = { ...repoNow, [targetBoard.id]: updatedBoardRepo };
            latestRepositoryRef.current = nextRepo;
            setRepository(nextRepo);

            if (onPiecesAdjust && newPiece.pieceTemplateId) {
                onPiecesAdjust({ [newPiece.pieceTemplateId]: 1 });
            }

            setSelectionBoardId(targetBoard.id);
            setSelectedIds(new Set([newPieceId]));
            setNewBoardPieceIds(prev => new Set(prev).add(newPieceId));
            setTimeout(() => setNewBoardPieceIds(prev => { const s = new Set(prev); s.delete(newPieceId); return s; }), 450);
            clearDrag();
            return;
        }

        // ---------- 3) BOARD → BOARD distinto (mismo material) ----------
        if (ctx.sourceType === 'BOARD') {
            const sourceBoardId = ctx.sourceBoardId;
            const srcFresh = fresh.find(b => b.id === sourceBoardId);
            if (!srcFresh) return clearDrag();
            const movingIdsSet = new Set(ctx.pieces.map(p => p.id));
            const stillPresent = srcFresh.placedPieces.some(p => movingIdsSet.has(p.id));
            if (!stillPresent) return clearDrag();

            // Snap magnético del anchor — busca el spot válido más cercano al
            // cursor. Si lo encuentra, recalcular todo el grupo manteniendo
            // offsets relativos.
            const anchorIdx = ctx.anchorIndex;
            const anchorProposed = proposed[anchorIdx];
            const tolerance = Math.max(anchorProposed.piece.width, anchorProposed.piece.height) * 1.5;
            const snapped = magneticSnap(
                anchorProposed.newX, anchorProposed.newY,
                anchorProposed.piece.width, anchorProposed.piece.height,
                tgtFresh, new Set(), tolerance
            );
            if (snapped) {
                const ax = snapped.x, ay = snapped.y;
                for (let i = 0; i < proposed.length; i++) {
                    proposed[i] = {
                        piece: proposed[i].piece,
                        newX: ax + ctx.relativeOffsets[i].dx,
                        newY: ay + ctx.relativeOffsets[i].dy
                    };
                }
            }

            // Bordes con trimming
            for (const { piece, newX, newY } of proposed) {
                if (!fitsInBounds(newX, newY, piece.width, piece.height, bw, bh)) {
                    showError("Alguna pieza queda fuera del refilado del tablero.");
                    return clearDrag();
                }
            }
            const offender = findCollisionOn(tgtFresh, proposed);
            if (offender) {
                showError(`La pieza choca con "${offender.code}" (mín. ${kerf}mm de sierra).`);
                return clearDrag();
            }

            const movedTotalArea = ctx.pieces.reduce((acc, p) => acc + p.width * p.height, 0);
            const tsTag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const newPiecesForTarget: PlacedPiece[] = proposed.map(({ piece, newX, newY }, i) => {
                const np: PlacedPiece = JSON.parse(JSON.stringify(piece));
                np.id = `${piece.pieceTemplateId}-mv-${tsTag}-${i}`;
                np.x = newX;
                np.y = newY;
                return np;
            });

            const next = fresh.map(board => {
                if (board.id === sourceBoardId) {
                    return {
                        ...board,
                        placedPieces: board.placedPieces.filter(p => !movingIdsSet.has(p.id)),
                        usedArea: Math.max(0, board.usedArea - movedTotalArea)
                    };
                }
                if (board.id === targetBoard.id) {
                    return {
                        ...board,
                        placedPieces: [...board.placedPieces, ...newPiecesForTarget],
                        usedArea: board.usedArea + newPiecesForTarget.reduce((a, p) => a + p.width * p.height, 0)
                    };
                }
                return board;
            });
            latestBoardsRef.current = next;
            setLocalBoards(next);

            for (const np of newPiecesForTarget) {
                setNewBoardPieceIds(prev => new Set(prev).add(np.id));
                setTimeout(() => setNewBoardPieceIds(prev => { const s = new Set(prev); s.delete(np.id); return s; }), 450);
            }

            setSelectionBoardId(targetBoard.id);
            setSelectedIds(new Set(newPiecesForTarget.map(p => p.id)));
        }

        clearDrag();
    };

    // Mueve la selección activa por (dx,dy) mm en el tablero. Validado contra
    // bordes (con refilado/trimming) y colisiones con el resto (respetando el
    // grosor de la sierra/kerf — las piezas no pueden quedar a menos de ese
    // valor entre sí). Flechas = 1mm, Shift = 10mm, Ctrl = 50mm; con
    // aceleración por sostener pueden llegar a 25mm.
    //
    // Comportamiento "deslizar hasta el tope": si el paso solicitado choca
    // con el refilado o con el kerf de otra pieza, en vez de abortar el
    // movimiento se reduce el desplazamiento al máximo válido en esa
    // dirección. Esto evita el escenario en el que con flechas aceleradas el
    // primer pulso aborta sin moverse y el usuario tiene que volver a apretar
    // la flecha varias veces hasta pegar la pieza al tope.
    const moveSelectionBy = (dx: number, dy: number) => {
        if (!selectionBoardId || selectedIds.size === 0) return;
        const fresh = latestBoardsRef.current;
        const board = fresh.find(b => b.id === selectionBoardId);
        if (!board) return;
        const bw = board.width || fallbackW;
        const bh = board.height || fallbackH;

        const sel = board.placedPieces.filter(p => selectedIds.has(p.id));
        if (sel.length === 0) return;
        const selIds = selectedIds;
        const others = board.placedPieces.filter(p => !selIds.has(p.id));

        // ¿La selección entera sería válida con un offset (ox, oy)?
        const offsetIsValid = (ox: number, oy: number): boolean => {
            for (const p of sel) {
                const nx = p.x + ox;
                const ny = p.y + oy;
                if (!fitsInBounds(nx, ny, p.width, p.height, bw, bh)) return false;
                for (const other of others) {
                    if (hitsWithKerf(nx, ny, p.width, p.height, other.x, other.y, other.width, other.height)) {
                        return false;
                    }
                }
            }
            return true;
        };

        // Si el paso completo es válido, aplicar directo.
        let finalDx = dx;
        let finalDy = dy;
        if (!offsetIsValid(dx, dy)) {
            // Búsqueda binaria del mayor desplazamiento válido en la dirección
            // pedida. Mantenemos la dirección original y escalamos magnitud.
            const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);
            const sx = sign(dx);
            const sy = sign(dy);
            const maxMag = Math.max(Math.abs(dx), Math.abs(dy));
            // Si ni 1mm en esa dirección es válido, aviso y aborta.
            if (!offsetIsValid(sx, sy)) {
                showError(`Quedaría a menos de ${kerf}mm de otra pieza o invadiría el refilado.`);
                return;
            }
            // Binario sobre magnitud entera entre [1, maxMag] buscando el último válido.
            let lo = 1;
            let hi = maxMag;
            let best = 1;
            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2);
                const tryDx = sx * Math.round((Math.abs(dx) / maxMag) * mid);
                const tryDy = sy * Math.round((Math.abs(dy) / maxMag) * mid);
                if (offsetIsValid(tryDx, tryDy)) {
                    best = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            finalDx = sx * Math.round((Math.abs(dx) / maxMag) * best);
            finalDy = sy * Math.round((Math.abs(dy) / maxMag) * best);
        }

        if (finalDx === 0 && finalDy === 0) return;

        const next = fresh.map(b => {
            if (b.id !== selectionBoardId) return b;
            return {
                ...b,
                placedPieces: b.placedPieces.map(p => selIds.has(p.id) ? { ...p, x: p.x + finalDx, y: p.y + finalDy } : p)
            };
        });
        latestBoardsRef.current = next;
        setLocalBoards(next);
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

        // Bordes con trimming: el bbox rotado debe caber dentro del rect útil.
        for (const p of selectedPieces) {
            const nd = rotatedDims.get(p.id)!;
            if (!fitsInBounds(p.x, p.y, nd.w, nd.h, bw, bh)) {
                showError(`"${p.code}" no cabe rotada (refilado del tablero).`);
                return;
            }
        }

        // Colisiones con kerf: cada pieza seleccionada (con sus nuevas dims)
        // contra todas las demás. Las seleccionadas usan sus dims rotadas.
        for (const p of selectedPieces) {
            const nd = rotatedDims.get(p.id)!;
            for (const other of board.placedPieces) {
                if (other.id === p.id) continue;
                const otherDims = rotatedDims.get(other.id);
                const ow = otherDims ? otherDims.w : other.width;
                const oh = otherDims ? otherDims.h : other.height;
                if (hitsWithKerf(p.x, p.y, nd.w, nd.h, other.x, other.y, ow, oh)) {
                    showError(`"${p.code}" rotada quedaría a menos de ${kerf}mm de "${other.code}".`);
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

    // Listener global de teclado en modo manual:
    //   - 'R'           → rotar selección 90°
    //   - flechas       → mover selección 1 mm
    //   - Shift+flecha  → mover selección 10 mm
    //   - Ctrl+flecha   → mover selección 50 mm
    // Aceleración progresiva al sostener una flecha (sin modificadores):
    //   - 0–700ms       → 1 mm/evento
    //   - 700–1500ms    → 5 mm/evento
    //   - >1500ms       → 25 mm/evento
    // El SO sigue generando autorepeats a ~30Hz; aumentar el paso multiplica la
    // velocidad efectiva sin necesidad de un timer propio. Modificadores tienen
    // prioridad y su paso es fijo (no acelera). Se ignora si el foco está en un
    // input/textarea/contenteditable.
    useEffect(() => {
        if (!isManual) return;
        let arrowHold: { key: string; startTime: number } | null = null;

        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
            if (!selectionBoardId || selectedIds.size === 0) return;

            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                rotateSelection();
                return;
            }

            const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
            if (!arrowKeys.includes(e.key)) return;
            e.preventDefault();

            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            // Reiniciar el cronómetro al cambiar de flecha (cada eje es independiente).
            if (!arrowHold || arrowHold.key !== e.key) {
                arrowHold = { key: e.key, startTime: now };
            }
            const heldMs = now - arrowHold.startTime;

            let step: number;
            if (e.ctrlKey || e.metaKey) step = 50;
            else if (e.shiftKey) step = 10;
            else if (heldMs > 1500) step = 25;
            else if (heldMs > 700) step = 5;
            else step = 1;

            let dx = 0, dy = 0;
            switch (e.key) {
                case 'ArrowLeft':  dx = -step; break;
                case 'ArrowRight': dx =  step; break;
                case 'ArrowUp':    dy = -step; break;
                case 'ArrowDown':  dy =  step; break;
            }
            moveSelectionBy(dx, dy);
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (arrowHold && arrowHold.key === e.key) arrowHold = null;
        };
        // Si el usuario sale de la pestaña/ventana mientras sostiene una flecha,
        // los eventos keyup pueden no llegar — limpiar al perder foco evita
        // que el siguiente keydown crea estar "ya sostenido" desde antes.
        const onBlur = () => { arrowHold = null; };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
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
                            <span className="material-icons-round text-[14px] text-[#4A90E2]/70">tune</span>
                            <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#cbd5e1] text-[#1c3547] font-mono text-[10px] shadow-sm">R</kbd>
                            <span>rotar</span>
                            <span className="opacity-30">·</span>
                            <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#cbd5e1] text-[#1c3547] font-mono text-[10px] shadow-sm">←↑↓→</kbd>
                            <span>1mm</span>
                            <span className="opacity-40 normal-case">(sostener acelera)</span>
                            <span className="opacity-30">·</span>
                            <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#cbd5e1] text-[#1c3547] font-mono text-[10px] shadow-sm">⇧</kbd>
                            <span>10mm</span>
                            <span className="opacity-30">·</span>
                            <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#cbd5e1] text-[#1c3547] font-mono text-[10px] shadow-sm">Ctrl</kbd>
                            <span>50mm</span>
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
