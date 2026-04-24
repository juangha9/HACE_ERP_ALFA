import React, { useState } from 'react';
import type { Piece } from '../types';

interface PiecePanelProps {
    pieces: Piece[];
    setPieces: React.Dispatch<React.SetStateAction<Piece[]>>;
    onPiecesChanged?: () => void; // Called when pieces are removed to allow parent to clear boards
}

export const PieceInputPanel: React.FC<PiecePanelProps> = ({ pieces, setPieces, onPiecesChanged }) => {

    const [newPiece, setNewPiece] = useState<Partial<Piece>>({
        description: '', code: '', width: 0, height: 0, quantity: 1, matchGrain: false,
        edgeBanding: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (['e', 'E', '+', '-', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
        }
    };



    const handleAdd = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!newPiece.width || !newPiece.height) return;

        const pieceId = `p-${Date.now()}`;
        const finalDesc = newPiece.description?.trim() || `Pieza ${pieces.length + 1}`;
        setPieces(prev => [...prev, { ...(newPiece as Piece), description: finalDesc, id: pieceId }]);
        onPiecesChanged?.();

        // Reset form but keep some defaults
        setNewPiece({
            description: '', code: '', width: 0, height: 0, quantity: 1, matchGrain: false,
            edgeBanding: { top: 0, bottom: 0, left: 0, right: 0 }
        });
    };

    const toggleBanding = (side: 'top' | 'bottom' | 'left' | 'right', type: number) => {
        setNewPiece(prev => {
            const currentType = prev.edgeBanding![side];
            return {
                ...prev,
                edgeBanding: {
                    ...prev.edgeBanding!,
                    [side]: currentType === type ? 0 : type
                }
            };
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/40 border-r border-slate-200 dark:border-slate-800">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800/60 flex items-center justify-between bg-slate-50/50 dark:bg-transparent">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#f0f5f4] flex items-center justify-center text-[#4A90E2]">
                        <span className="material-icons-round text-[20px]">add_box</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">Ingresar Pieza</h2>
                </div>
            </div>

            {/* Input Form */}
            <form onSubmit={handleAdd} className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto">
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Descripción / Nombre</label>
                    <input 
                        autoFocus 
                        type="text" 
                        placeholder="Ej: Puerta Izquierda" 
                        value={newPiece.description} 
                        onChange={e => setNewPiece({ ...newPiece, description: e.target.value })} 
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none w-full font-semibold" 
                    />
                </div>



                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Largo (mm)</label>
                        <input 
                            type="number" 
                            placeholder="0" 
                            value={newPiece.width || ''} 
                            onKeyDown={handleNumberKeyDown}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={e => setNewPiece({ ...newPiece, width: Number(e.target.value) })} 
                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none w-full font-bold" 
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Ancho (mm)</label>
                        <input 
                            type="number" 
                            placeholder="0" 
                            value={newPiece.height || ''} 
                            onKeyDown={handleNumberKeyDown}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={e => setNewPiece({ ...newPiece, height: Number(e.target.value) })} 
                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none w-full font-bold" 
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Cantidad</label>
                        <input 
                            type="number" 
                            min="1" 
                            value={newPiece.quantity} 
                            onKeyDown={handleNumberKeyDown}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={e => setNewPiece({ ...newPiece, quantity: Number(e.target.value) })} 
                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none w-full font-bold text-center" 
                        />
                    </div>
                    <div className="flex flex-col gap-2 items-center justify-center">
                        <label className="text-xs font-bold text-slate-500 uppercase w-full">Veta</label>
                        <button
                            type="button"
                            onClick={() => setNewPiece({ ...newPiece, matchGrain: !newPiece.matchGrain })}
                            className={`w-full py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border ${newPiece.matchGrain ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/40 dark:border-indigo-700/50' : 'bg-white border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'}`}
                        >
                            <span className="material-icons-round text-[18px]">{newPiece.matchGrain ? 'lock' : 'sync'}</span>
                            {newPiece.matchGrain ? 'Bloqueada' : 'Libre'}
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                    <label className="text-xs font-bold text-slate-500 uppercase text-center flex items-center justify-center gap-2">
                        <span className="material-icons-round text-sm">edgesensor_high</span>
                        Configuración de Tapacantos
                    </label>
                    <div className="flex justify-center py-6">
                        <div className="relative w-40 h-40 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center shadow-inner group">
                            <span className="text-slate-300 dark:text-slate-600 font-black text-[10px] uppercase tracking-widest pointer-events-none">Pieza</span>

                            {/* Center Visual Rectangle (Non-clickable) */}
                            <div className="absolute inset-4 border border-slate-100 dark:border-slate-700 rounded-lg pointer-events-none" />

                            {/* Top Side Control */}
                            <div className="absolute -top-4 left-0 right-0 flex flex-col items-center gap-1">
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => toggleBanding('top', 1)} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all border ${newPiece.edgeBanding?.top === 1 ? 'bg-emerald-500 border-emerald-600 text-white scale-110 shadow-lg shadow-emerald-500/30' : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-400 hover:bg-slate-200'}`}>1</button>
                                    <button type="button" onClick={() => toggleBanding('top', 2)} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all border ${newPiece.edgeBanding?.top === 2 ? 'bg-[#4A90E2] border-[#357ABD] text-white scale-110 shadow-lg shadow-blue-500/30' : 'bg-[#f7faf9] border-[#d3dcdb] text-[#366480]/40 hover:bg-[#f0f5f4]'}`}>2</button>
                                </div>
                                <div className={`w-16 h-[3px] rounded-full transition-all ${newPiece.edgeBanding?.top === 1 ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20' : newPiece.edgeBanding?.top === 2 ? 'bg-[repeating-linear-gradient(to_right,#6366f1_0,#6366f1_8px,transparent_8px,transparent_12px)]' : 'bg-slate-200 dark:bg-slate-700'}`} />
                            </div>

                            {/* Bottom Side Control */}
                            <div className="absolute -bottom-4 left-0 right-0 flex flex-col-reverse items-center gap-1">
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => toggleBanding('bottom', 1)} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all border ${newPiece.edgeBanding?.bottom === 1 ? 'bg-emerald-500 border-emerald-600 text-white scale-110 shadow-lg shadow-emerald-500/30' : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-400 hover:bg-slate-200'}`}>1</button>
                                    <button type="button" onClick={() => toggleBanding('bottom', 2)} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all border ${newPiece.edgeBanding?.bottom === 2 ? 'bg-[#4A90E2] border-[#357ABD] text-white scale-110 shadow-lg shadow-blue-500/30' : 'bg-[#f7faf9] border-[#d3dcdb] text-[#366480]/40 hover:bg-[#f0f5f4]'}`}>2</button>
                                </div>
                                <div className={`w-16 h-[3px] rounded-full transition-all ${newPiece.edgeBanding?.bottom === 1 ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20' : newPiece.edgeBanding?.bottom === 2 ? 'bg-[repeating-linear-gradient(to_right,#6366f1_0,#6366f1_8px,transparent_8px,transparent_12px)]' : 'bg-slate-200 dark:bg-slate-700'}`} />
                            </div>

                            {/* Left Side Control */}
                            <div className="absolute -left-4 top-0 bottom-0 flex items-center gap-1">
                                <div className="flex flex-col gap-2">
                                    <button type="button" onClick={() => toggleBanding('left', 1)} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all border ${newPiece.edgeBanding?.left === 1 ? 'bg-emerald-500 border-emerald-600 text-white scale-110 shadow-lg shadow-emerald-500/30' : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-400 hover:bg-slate-200'}`}>1</button>
                                    <button type="button" onClick={() => toggleBanding('left', 2)} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all border ${newPiece.edgeBanding?.left === 2 ? 'bg-[#4A90E2] border-[#357ABD] text-white scale-110 shadow-lg shadow-blue-500/30' : 'bg-[#f7faf9] border-[#d3dcdb] text-[#366480]/40 hover:bg-[#f0f5f4]'}`}>2</button>
                                </div>
                                <div className={`h-16 w-[3px] rounded-full transition-all ${newPiece.edgeBanding?.left === 1 ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20' : newPiece.edgeBanding?.left === 2 ? 'bg-[repeating-linear-gradient(to_bottom,#6366f1_0,#6366f1_8px,transparent_8px,transparent_12px)]' : 'bg-slate-200 dark:bg-slate-700'}`} />
                            </div>

                            {/* Right Side Control */}
                            <div className="absolute -right-4 top-0 bottom-0 flex items-center flex-row-reverse gap-1">
                                <div className="flex flex-col gap-2">
                                    <button type="button" onClick={() => toggleBanding('right', 1)} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all border ${newPiece.edgeBanding?.right === 1 ? 'bg-emerald-500 border-emerald-600 text-white scale-110 shadow-lg shadow-emerald-500/30' : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-400 hover:bg-slate-200'}`}>1</button>
                                    <button type="button" onClick={() => toggleBanding('right', 2)} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all border ${newPiece.edgeBanding?.right === 2 ? 'bg-[#4A90E2] border-[#357ABD] text-white scale-110 shadow-lg shadow-blue-500/30' : 'bg-[#f7faf9] border-[#d3dcdb] text-[#366480]/40 hover:bg-[#f0f5f4]'}`}>2</button>
                                </div>
                                <div className={`h-16 w-[3px] rounded-full transition-all ${newPiece.edgeBanding?.right === 1 ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20' : newPiece.edgeBanding?.right === 2 ? 'bg-[repeating-linear-gradient(to_bottom,#6366f1_0,#6366f1_8px,transparent_8px,transparent_12px)]' : 'bg-slate-200 dark:bg-slate-700'}`} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-6">
                    <button
                        type="submit"
                        disabled={!newPiece.width || !newPiece.height}
                        className="w-full py-4 rounded-[12px] bg-[#4A90E2] text-white font-[800] text-sm flex items-center justify-center gap-2 hover:bg-[#357ABD] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20 uppercase tracking-widest"
                    >
                        <span className="material-icons-round text-lg">add_circle</span>
                        Añadir Pieza
                    </button>
                </div>
            </form>
        </div>
    );
};

export const PieceListPanel: React.FC<PiecePanelProps> = ({ pieces, setPieces, onPiecesChanged }) => {

    const [masterGrain, setMasterGrain] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const handleRemove = (id: string) => {
        setPieces(prev => prev.filter(p => p.id !== id));
        onPiecesChanged?.();
    };

    const handleClearAll = () => {
        if (confirmClear) {
            setPieces([]);
            setConfirmClear(false);
            onPiecesChanged?.();
        } else {
            setConfirmClear(true);
            setTimeout(() => setConfirmClear(false), 3000); // reset after 3s
        }
    };

    const toggleMasterGrain = () => {
        const newValue = !masterGrain;
        setMasterGrain(newValue);
        setPieces(prev => prev.map(p => ({ ...p, matchGrain: newValue })));
    };

    const togglePieceGrain = (id: string) => {
        setPieces(prev => prev.map(p => p.id === id ? { ...p, matchGrain: !p.matchGrain } : p));
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between bg-white dark:bg-transparent">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <span className="material-icons-round text-[20px]">list_alt</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">Listado Actual</h2>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleClearAll}
                        disabled={pieces.length === 0}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all disabled:opacity-50 ${confirmClear ? 'bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-500/20 scale-105' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20'}`}
                        title="Limpiar todas las piezas"
                    >
                        <span className="material-icons-round text-[16px]">delete_sweep</span>
                        {confirmClear ? '¿Seguro?' : 'Borrar Todo'}
                    </button>
                </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[3fr_2fr_1fr_2fr_1fr_1fr] gap-4 px-6 py-3 bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800/60 text-[10px] font-bold text-slate-500 uppercase tracking-widest items-center">
                <div>Descripción</div>
                <div className="text-center">Dim. (MM)</div>
                <div className="text-center">Cant.</div>
                <div className="text-center" title="Superior, Inferior, Izquierda, Derecha">Canto</div>
                <div className="flex justify-center">
                    <button onClick={toggleMasterGrain} className={`flex items-center gap-1 hover:text-[#4A90E2] transition-colors ${masterGrain ? 'text-[#4A90E2]' : ''}`} title="Aplicar a todas">
                        <span className="material-icons-round text-[14px]">{masterGrain ? 'lock' : 'sync'}</span>
                        VETA
                    </button>
                </div>
                <div className="text-center">Quitar</div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2">
                {pieces.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                        <span className="material-icons-round text-4xl mb-3 opacity-30">inventory_2</span>
                        <p>No hay piezas ingresadas aún.</p>
                        <p className="text-xs opacity-70">Usa el panel izquierdo para añadir.</p>
                    </div>
                ) : pieces.map((piece) => (
                    <div
                        key={piece.id}
                        className="grid grid-cols-[3fr_2fr_1fr_2fr_1fr_1fr] gap-4 px-4 py-3 items-center border border-slate-100 dark:border-slate-800/60 rounded-xl mb-2 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors bg-white dark:bg-slate-800/50"
                    >
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{piece.description}</p>
                            <p className="text-[10px] font-medium text-slate-400 mt-0.5 truncate">{piece.code || 'Sin código'}</p>
                        </div>
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-300 text-center">
                            {piece.width} <span className="text-slate-400 mx-0.5">×</span> {piece.height}
                        </div>
                        <div className="flex justify-center">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold">
                                {piece.quantity}
                            </span>
                        </div>
                        <div className="flex justify-center gap-0.5 text-[9px] font-mono text-slate-500">
                            {/* Visual representation of edge banding T, B, L, R with Types 1 and 2 */}
                            <div className="w-6 h-6 relative border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 rounded-sm" title="Cantos aplicados">
                                {piece.edgeBanding.top === 1 && <div className="absolute top-0 left-0 right-0 h-[3px] bg-emerald-500 rounded-t-sm" />}
                                {piece.edgeBanding.top === 2 && <div className="absolute top-0 left-0 right-0 h-[3px] bg-[repeating-linear-gradient(to_right,#6366f1_0,#6366f1_6px,transparent_6px,transparent_10px)] rounded-t-sm" />}
                                
                                {piece.edgeBanding.bottom === 1 && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-emerald-500 rounded-b-sm" />}
                                {piece.edgeBanding.bottom === 2 && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[repeating-linear-gradient(to_right,#6366f1_0,#6366f1_6px,transparent_6px,transparent_10px)] rounded-b-sm" />}
                                
                                {piece.edgeBanding.left === 1 && <div className="absolute top-0 bottom-0 left-0 w-[3px] bg-emerald-500 rounded-l-sm" />}
                                {piece.edgeBanding.left === 2 && <div className="absolute top-0 bottom-0 left-0 w-[3px] bg-[repeating-linear-gradient(to_bottom,#6366f1_0,#6366f1_6px,transparent_6px,transparent_10px)] rounded-l-sm" />}
                                
                                {piece.edgeBanding.right === 1 && <div className="absolute top-0 bottom-0 right-0 w-[3px] bg-emerald-500 rounded-r-sm" />}
                                {piece.edgeBanding.right === 2 && <div className="absolute top-0 bottom-0 right-0 w-[3px] bg-[repeating-linear-gradient(to_bottom,#6366f1_0,#6366f1_6px,transparent_6px,transparent_10px)] rounded-r-sm" />}
                            </div>
                        </div>
                        <div className="flex justify-center">
                            <button onClick={() => togglePieceGrain(piece.id)} className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
                                {piece.matchGrain ? (
                                    <span className="material-icons-round text-[#4A90E2] text-[18px]" title="Veta bloqueada">lock</span>
                                ) : (
                                    <span className="material-icons-round text-slate-300 dark:text-slate-600 text-[18px]" title="Rotación libre">sync</span>
                                )}
                            </button>
                        </div>
                        <div className="flex justify-center">
                            <button onClick={() => handleRemove(piece.id)} className="w-8 h-8 rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center group" title="Eliminar fila">
                                <span className="material-icons-round text-[18px] group-hover:scale-110 transition-transform">delete</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-[#0f172a] flex justify-between items-center text-xs font-bold text-slate-500">
                <span>Total piezas: {pieces.reduce((sum, p) => sum + p.quantity, 0)}</span>
                <span>Subtotal m²: {(pieces.reduce((sum, p) => sum + ((p.width * p.height) / 1000000) * p.quantity, 0)).toFixed(2)} m²</span>
            </div>
        </div>
    );
};
