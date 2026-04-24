import React, { useState, useEffect, useRef, memo } from 'react';
import type { Board, PlacedPiece } from '../lib/optimizationAlgorithm';

interface CuttingMapProps {
    boards: Board[];
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
    sourceBoardId: string;
}

// Per-board repository: boardId → pieceCode → RepositoryItem
type Repository = Record<string, Record<string, RepositoryItem>>;

interface DragCtx {
    sourceType: 'BOARD' | 'REPO';
    sourceBoardId: string;
    piece: PlacedPiece;
    pieceCode: string;
}

export const CuttingMap = memo(({ boards }: CuttingMapProps) => {
    const [isManual, setIsManual] = useState(false);
    const [localBoards, setLocalBoards] = useState<Board[]>([]);
    const [repository, setRepository] = useState<Repository>({});

    // Drag visual feedback — only for UI; actual drag data lives in dragCtxRef
    const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null);

    // Animations
    const [newBoardPieceIds, setNewBoardPieceIds] = useState<Set<string>>(new Set());
    const [newRepoCodes, setNewRepoCodes] = useState<Set<string>>(new Set());

    // Reliable drag context stored in ref — always current, no stale closure issues
    const dragCtxRef = useRef<DragCtx | null>(null);

    useEffect(() => {
        setLocalBoards(JSON.parse(JSON.stringify(boards)));
        setRepository({});
    }, [boards]);

    const fallbackW = 2440;
    const fallbackH = 2140;

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
        setDraggingBoardId(null);
    };

    const handleDragStartFromBoard = (e: React.DragEvent, piece: PlacedPiece, boardId: string) => {
        // text/plain is required by Firefox for drag to activate
        e.dataTransfer.setData('text/plain', piece.id);
        e.dataTransfer.effectAllowed = 'move';
        dragCtxRef.current = { sourceType: 'BOARD', sourceBoardId: boardId, piece, pieceCode: piece.code };
        setDraggingBoardId(boardId);
    };

    const handleDragStartFromRepo = (e: React.DragEvent, item: RepositoryItem) => {
        e.dataTransfer.setData('text/plain', item.code);
        e.dataTransfer.effectAllowed = 'move';
        dragCtxRef.current = { sourceType: 'REPO', sourceBoardId: item.sourceBoardId, piece: item.piece, pieceCode: item.code };
        setDraggingBoardId(item.sourceBoardId);
    };

    // Repository only accepts pieces dragged from its own adjacent board
    const handleDropOnRepo = (e: React.DragEvent, targetBoardId: string) => {
        e.preventDefault();
        const ctx = dragCtxRef.current;
        if (!ctx || ctx.sourceType !== 'BOARD') return clearDrag();
        if (ctx.sourceBoardId !== targetBoardId) return clearDrag();

        const { piece } = ctx;

        setLocalBoards(prev => prev.map(board => {
            if (board.id !== targetBoardId) return board;
            return {
                ...board,
                placedPieces: board.placedPieces.filter(p => p.id !== piece.id),
                usedArea: board.usedArea - piece.width * piece.height
            };
        }));

        setRepository(prev => {
            const boardRepo = prev[targetBoardId] || {};
            const existing = boardRepo[piece.code];
            return {
                ...prev,
                [targetBoardId]: {
                    ...boardRepo,
                    [piece.code]: {
                        code: piece.code,
                        piece: { ...piece },
                        count: (existing?.count ?? 0) + 1,
                        color: getCodeColor(piece.code),
                        sourceBoardId: targetBoardId
                    }
                }
            };
        });

        // Trigger shrink-in animation for the repo item
        const animKey = `${targetBoardId}:${piece.code}`;
        setNewRepoCodes(prev => new Set(prev).add(animKey));
        setTimeout(() => setNewRepoCodes(prev => { const s = new Set(prev); s.delete(animKey); return s; }), 400);

        clearDrag();
    };

    // Board only accepts pieces that originated from its own repository
    const handleDropOnBoard = (e: React.DragEvent, targetBoardId: string) => {
        e.preventDefault();
        const ctx = dragCtxRef.current;
        if (!ctx || ctx.sourceType !== 'REPO') return clearDrag();
        if (ctx.sourceBoardId !== targetBoardId) return clearDrag();

        const boardRepo = repository[targetBoardId];
        const repoItem = boardRepo?.[ctx.pieceCode];
        if (!repoItem) return clearDrag();

        const newPieceId = `${repoItem.piece.pieceTemplateId}-repo-${Date.now()}`;
        const newPiece: PlacedPiece = { ...repoItem.piece, id: newPieceId };

        setLocalBoards(prev => prev.map(board => {
            if (board.id !== targetBoardId) return board;
            return {
                ...board,
                placedPieces: [...board.placedPieces, newPiece],
                usedArea: board.usedArea + newPiece.width * newPiece.height
            };
        }));

        setRepository(prev => {
            const boardRepo = prev[targetBoardId] || {};
            const existing = boardRepo[ctx.pieceCode];
            if (!existing || existing.count <= 1) {
                const next = { ...boardRepo };
                delete next[ctx.pieceCode];
                return { ...prev, [targetBoardId]: next };
            }
            return {
                ...prev,
                [targetBoardId]: { ...boardRepo, [ctx.pieceCode]: { ...existing, count: existing.count - 1 } }
            };
        });

        // Trigger grow-in animation for the newly placed piece
        setNewBoardPieceIds(prev => new Set(prev).add(newPieceId));
        setTimeout(() => setNewBoardPieceIds(prev => { const s = new Set(prev); s.delete(newPieceId); return s; }), 450);

        clearDrag();
    };

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
                                    const boardRepo = repository[board.id] || {};
                                    const repoItems = Object.values(boardRepo);
                                    const repoCount = repoItems.reduce((acc, i) => acc + i.count, 0);
                                    // Only this board's pair highlights during drag
                                    const isPair = draggingBoardId === board.id;

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
                                                    onDrop={e => handleDropOnBoard(e, board.id)}
                                                    className={`relative w-full bg-[#f8f9fc] shadow-[0_30px_70px_rgba(0,0,0,0.08)] mx-auto overflow-hidden border-[8px] border-white ring-1 ring-black/5 transition-all duration-300 ${isManual && isPair && dragCtxRef.current?.sourceType === 'REPO' ? 'ring-2 ring-[#4A90E2] ring-offset-4 ring-offset-[#edf0f5]' : ''}`}
                                                    style={{ aspectRatio: `${bw} / ${bh}` }}
                                                >
                                                    <div
                                                        className="absolute inset-0 pointer-events-none"
                                                        style={{
                                                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 15px, rgba(28,53,71,0.04) 15px, rgba(28,53,71,0.04) 16px)',
                                                            backgroundColor: '#f8f9fc'
                                                        }}
                                                    />
                                                    <div className="absolute inset-0">
                                                        {board.placedPieces.map((piece, index) => {
                                                            const left  = (piece.x / bw) * 100 + '%';
                                                            const top   = (piece.y / bh) * 100 + '%';
                                                            const w     = (piece.width / bw) * 100 + '%';
                                                            const h     = (piece.height / bh) * 100 + '%';
                                                            const isSmall = piece.width < 275 && piece.height < 275;
                                                            const pieceColor = getCodeColor(piece.code || '');
                                                            const isDragging = dragCtxRef.current?.piece.id === piece.id && dragCtxRef.current?.sourceType === 'BOARD';
                                                            const isNew = newBoardPieceIds.has(piece.id);

                                                            return (
                                                                <div
                                                                    key={piece.id}
                                                                    draggable={isManual}
                                                                    onDragStart={e => handleDragStartFromBoard(e, piece, board.id)}
                                                                    onDragEnd={clearDrag}
                                                                    className={`absolute flex flex-col items-center justify-center ${isManual ? 'cursor-grab active:cursor-grabbing hover:brightness-90' : ''} ${isNew ? 'anim-piece-grow' : ''}`}
                                                                    style={{
                                                                        left, top, width: w, height: h,
                                                                        backgroundColor: pieceColor,
                                                                        border: '1px solid #cbd5e1',
                                                                        opacity: isDragging ? 0.35 : 1,
                                                                        transform: isDragging ? 'scale(0.88) rotate(2deg)' : undefined,
                                                                        transition: isDragging ? 'none' : 'opacity 0.2s ease',
                                                                        zIndex: isDragging ? 100 : 1
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
                                                        onDrop={e => handleDropOnRepo(e, board.id)}
                                                        className={`relative w-full aspect-square bg-white/40 border-2 border-dashed rounded-[40px] flex flex-wrap content-start p-8 gap-6 transition-all duration-300 overflow-auto custom-scrollbar ${isManual && isPair && dragCtxRef.current?.sourceType === 'BOARD' ? 'border-[#4A90E2] bg-[#4A90E2]/5 shadow-inner' : 'border-[#cbd5e1] hover:border-[#1c3547]/20'}`}
                                                    >
                                                        {repoItems.length === 0 ? (
                                                            <div className="w-full h-full flex flex-col items-center justify-center text-[#1c3547]/20 pointer-events-none">
                                                                <span className="material-icons-round text-4xl mb-3">move_to_inbox</span>
                                                                <p className="text-[9px] font-black uppercase text-center leading-relaxed">Arrastre piezas aquí<br/>para removerlas</p>
                                                            </div>
                                                        ) : (
                                                            repoItems.map((item) => {
                                                                const animKey = `${board.id}:${item.code}`;
                                                                const isNewRepo = newRepoCodes.has(animKey);
                                                                return (
                                                                    <div
                                                                        key={item.code}
                                                                        draggable
                                                                        onDragStart={e => handleDragStartFromRepo(e, item)}
                                                                        onDragEnd={clearDrag}
                                                                        className={`relative cursor-grab active:cursor-grabbing ${isNewRepo ? 'anim-repo-shrink' : ''}`}
                                                                        style={{
                                                                            width: '80px',
                                                                            height: '80px',
                                                                            backgroundColor: item.color,
                                                                            border: '1px solid #cbd5e1',
                                                                            borderRadius: '16px',
                                                                            transition: isNewRepo ? 'none' : 'transform 0.15s ease'
                                                                        }}
                                                                        onMouseEnter={e => { if (!isNewRepo) (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
                                                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                                                                    >
                                                                        {item.count > 1 && (
                                                                            <div className="absolute -top-3 -right-3 bg-[#e11d48] text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border-2 border-white z-20">
                                                                                x{item.count}
                                                                            </div>
                                                                        )}
                                                                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center pointer-events-none">
                                                                            <span className="text-[9px] font-black text-[#1c3547] truncate w-full text-center">{item.code}</span>
                                                                            <span className="text-[7px] font-bold text-[#1c3547]/40 mt-1 uppercase tracking-tighter">{item.piece.width}×{item.piece.height}</span>
                                                                        </div>
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
