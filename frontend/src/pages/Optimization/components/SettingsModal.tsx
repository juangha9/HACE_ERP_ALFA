import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { useScrollLock } from '../../../hooks/useScrollLock';
import type { OptimizationConfig } from '../types';

interface SettingsModalProps {
    config: OptimizationConfig;
    setConfig: React.Dispatch<React.SetStateAction<OptimizationConfig>>;
    onClose: () => void;
    isOpen: boolean;
    viewMode: 'VISUAL' | 'COMMANDS';
    setViewMode: (val: 'VISUAL' | 'COMMANDS') => void;
    onPrintLabels?: () => void;
    initialCustomBoards?: {id: string, label: string, w: number, h: number, number?: number, name: string}[];
}

const COMMON_BOARD_SIZES = [
    { label: 'Blanco 18mm (2440 × 1830)', w: 2440, h: 1830 },
    { label: 'MDF 18mm (2750 × 1830)', w: 2750, h: 1830 },
    { label: 'Aglomerado 15mm (2500 × 1830)', w: 2500, h: 1830 },
    { label: 'Especial (3200 × 2100)', w: 3200, h: 2100 }
];

const SettingsModalComponent: React.FC<SettingsModalProps> = ({ config, setConfig, onClose, isOpen, viewMode, setViewMode, onPrintLabels, initialCustomBoards }) => {
    const [customBoards, setCustomBoards] = useState<{id: string, label: string, w: number, h: number, number?: number, name: string}[]>(initialCustomBoards || []);
    const [isCustomMode, setIsCustomMode] = useState(false);
    const [boardNumber, setBoardNumber] = useState<string>('');
    const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

    useScrollLock(isOpen);

    useEffect(() => {
        if (initialCustomBoards && initialCustomBoards.length > 0) {
            setCustomBoards(initialCustomBoards);
        }
    }, [initialCustomBoards]);

    const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (['e', 'E', '+', '-', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
        }
    };

    const ALL_BOARDS = [...COMMON_BOARD_SIZES.map(b => ({ ...b, id: `std-${b.w}x${b.h}` })), ...customBoards];
    
    // Check if current config differs from the selected board (if any)
    const currentSelectedBoard = ALL_BOARDS.find(b => b.id === selectedBoardId);
    const hasChanges = !currentSelectedBoard || 
        currentSelectedBoard.w !== config.boardWidth || 
        currentSelectedBoard.h !== config.boardHeight || 
        (currentSelectedBoard.name || currentSelectedBoard.label.split(' (')[0]) !== config.material ||
        (currentSelectedBoard.number?.toString() || '') !== boardNumber;

    const isStandard = !isCustomMode && !hasChanges && !!currentSelectedBoard && currentSelectedBoard.id.startsWith('std-');
    const selectValue = selectedBoardId || (isCustomMode ? 'custom' : '');

    const handleSaveCustomBoard = async () => {
        if (!config.material) return;
        try {
            if (selectedBoardId && !selectedBoardId.startsWith('std-')) {
                // Update existing
                await api.updateCustomBoard(selectedBoardId, {
                    name: config.material,
                    width: config.boardWidth,
                    height: config.boardHeight,
                    material: config.material,
                    number: boardNumber ? parseInt(boardNumber) : undefined
                });
            } else {
                // Add new
                await api.addCustomBoard({
                    name: config.material,
                    width: config.boardWidth,
                    height: config.boardHeight,
                    material: config.material,
                    number: boardNumber ? parseInt(boardNumber) : undefined
                });
            }
            // Refresh list
            const updated = await api.getCustomBoards();
            setCustomBoards(updated);
            setIsCustomMode(false); 
            // setBoardNumber(''); // Keep it or clear it? User might want to keep it.
            // Find the board we just saved/updated to keep it selected
            const justSaved = updated.find(b => b.name === config.material && b.w === config.boardWidth && b.h === config.boardHeight);
            if (justSaved) setSelectedBoardId(justSaved.id);
        } catch (error) {
            console.error("Error saving custom board", error);
        }
    };

    if (!isOpen) return null;

    // Help handle deep state updates for trimming
    const handleTrimmingChange = (side: keyof typeof config.trimming, value: number) => {
        setConfig(prev => ({
            ...prev,
            trimming: {
                ...prev.trimming,
                [side]: value
            }
        }));
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/20 print:hidden" style={{ backdropFilter: 'blur(6px)' }}>
            <div className="bg-white/90 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-4xl overflow-hidden border border-white/50 flex flex-col max-h-[90vh] relative">
                {/* Subtle top highlight for depth */}
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200/30 flex items-center justify-between">
                    <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <span className="material-icons-round text-[32px] text-slate-800 dark:text-white drop-shadow-sm">settings</span>
                        Configuración de Optimización
                    </h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-[#e9efee]/60 flex items-center justify-center transition-colors">
                        <span className="material-icons-round text-lg">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex flex-col gap-8">
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Section 1: Tablero Base */}
                        <section className="flex flex-col gap-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                                <span className="material-icons-round text-[16px] text-indigo-500">dashboard</span>
                                1. Tableros
                            </h3>
                            
                            <div className="bg-[#e9efee]/40 p-4 rounded-2xl border border-slate-200/20 flex flex-col gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Tamaño de Tablero</label>
                                    <select
                                        className="w-full text-sm px-3 py-2 rounded-xl border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-indigo-500/20 outline-none mb-3 font-semibold text-slate-700"
                                        value={selectValue}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === 'custom') {
                                                setIsCustomMode(true);
                                                setSelectedBoardId(null);
                                                setBoardNumber('');
                                                return;
                                            }
                                            setIsCustomMode(false);
                                            setSelectedBoardId(val);
                                            
                                            const selected = ALL_BOARDS.find(b => b.id === val);
                                            if (selected) {
                                                setConfig(prev => ({ 
                                                    ...prev, 
                                                    boardWidth: selected.w, 
                                                    boardHeight: selected.h,
                                                    material: selected.name || selected.label.split(' (')[0]
                                                }));
                                                setBoardNumber(selected.number?.toString() || '');
                                            }
                                        }}
                                    >
                                        <option value="" disabled>Seleccione un tablero...</option>
                                        <optgroup label="Comunes">
                                            {COMMON_BOARD_SIZES.map((size, idx) => (
                                                <option key={idx} value={`std-${size.w}x${size.h}`}>{size.label}</option>
                                            ))}
                                        </optgroup>
                                        {customBoards.length > 0 && (
                                            <optgroup label="Personalizados Guardados">
                                                {customBoards.map((board) => (
                                                    <option key={board.id} value={board.id}>{board.label}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        <option value="custom" className="font-bold text-indigo-500">➕ Crear Personalizado...</option>
                                    </select>
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <input 
                                                type="number" 
                                                value={config.boardWidth} 
                                                onKeyDown={handleNumberKeyDown}
                                                onWheel={(e) => e.currentTarget.blur()}
                                                onChange={e => setConfig(prev => ({ ...prev, boardWidth: Number(e.target.value) }))} 
                                                className="w-full text-sm font-bold px-3 py-2 rounded-lg border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-indigo-500/20 outline-none" 
                                            />
                                            <span className="absolute right-3 top-2 text-[10px] text-slate-400 font-bold uppercase">Ancho (mm)</span>
                                        </div>
                                        <span className="text-slate-400 font-bold">×</span>
                                        <div className="relative flex-1">
                                            <input 
                                                type="number" 
                                                value={config.boardHeight} 
                                                onKeyDown={handleNumberKeyDown}
                                                onWheel={(e) => e.currentTarget.blur()}
                                                onChange={e => setConfig(prev => ({ ...prev, boardHeight: Number(e.target.value) }))} 
                                                className="w-full text-sm font-bold px-3 py-2 rounded-lg border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-indigo-500/20 outline-none" 
                                            />
                                            <span className="absolute right-3 top-2 text-[10px] text-slate-400 font-bold uppercase">Alto (mm)</span>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Nombre / Material del Tablero</label>
                                    <div className="flex gap-2">
                                        <div className="relative w-24">
                                            <input 
                                                type="number" 
                                                value={boardNumber}
                                                onKeyDown={handleNumberKeyDown}
                                                onChange={e => setBoardNumber(e.target.value)}
                                                className="w-full text-sm px-3 py-2 rounded-xl border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                                placeholder="N°"
                                            />
                                            <span className="absolute -top-1.5 left-2 px-1 bg-white/80 text-[8px] font-black text-slate-400 uppercase leading-none">N° Único</span>
                                        </div>
                                        <input 
                                            type="text" 
                                            value={config.material} 
                                            onChange={e => setConfig(prev => ({ ...prev, material: e.target.value }))}
                                            className="flex-1 text-sm px-3 py-2 rounded-xl border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white/80 transition-all outline-none"
                                            placeholder="Ej: Melamina 18mm Blanco"
                                        />
                                        {hasChanges && !isStandard && (
                                            <button 
                                                onClick={handleSaveCustomBoard}
                                                className="px-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-xl border border-indigo-200 dark:border-indigo-800/60 transition-colors flex items-center justify-center"
                                                title={selectedBoardId ? "Actualizar tablero" : "Guardar como tablero personalizado"}
                                            >
                                                <span className="material-icons-round text-lg">{selectedBoardId && !selectedBoardId.startsWith('std-') ? 'update' : 'save'}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Sentido de la Veta</label>
                                    <button 
                                        type="button"
                                        onClick={() => setConfig(prev => ({ ...prev, grainDirection: prev.grainDirection === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL' }))}
                                        className="w-full flex items-center justify-between px-4 py-2 bg-[#e9efee]/50 border-none rounded-xl hover:bg-[#e9efee]/70 transition-all group"
                                    >
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{config.grainDirection === 'HORIZONTAL' ? 'Horizontal' : 'Vertical'}</p>
                                            <p className="text-[10px] text-slate-400 font-medium tracking-tight">Clic para rotar</p>
                                        </div>
                                        <div className="w-10 h-10 border-2 border-slate-200/40 rounded-lg flex items-center justify-center text-slate-600 bg-white/30 overflow-hidden">
                                            <span className={`material-icons-round text-2xl transition-transform duration-300 ${config.grainDirection === 'VERTICAL' ? 'rotate-90' : ''}`}>
                                                arrow_forward
                                            </span>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Section 2: Técnica de Corte */}
                        <section className="flex flex-col gap-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                                <span className="material-icons-round text-[16px] text-amber-500">content_cut</span>
                                2. Técnica de Corte
                            </h3>
                            
                            <div className="bg-slate-100/40 backdrop-blur-md p-4 rounded-2xl border border-white/30 flex flex-col gap-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Grosor de Sierra (Kerf)</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                step="0.5" 
                                                value={config.sawKerf} 
                                                onKeyDown={handleNumberKeyDown}
                                                onWheel={(e) => e.currentTarget.blur()}
                                                onChange={e => setConfig(prev => ({ ...prev, sawKerf: Number(e.target.value) }))} 
                                                className="w-full text-sm font-black text-indigo-600 px-3 py-2 rounded-xl border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-indigo-500/20 outline-none" 
                                            />
                                            <span className="absolute right-3 top-2 text-[10px] text-indigo-400 font-bold">mm</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Pre-fresado</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                step="0.5" 
                                                value={config.preFresado} 
                                                onKeyDown={handleNumberKeyDown}
                                                onWheel={(e) => e.currentTarget.blur()}
                                                onChange={e => setConfig(prev => ({ ...prev, preFresado: Number(e.target.value) }))} 
                                                className="w-full text-sm font-black text-amber-600 px-3 py-2 rounded-xl border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-amber-500/20 outline-none" 
                                            />
                                            <span className="absolute right-3 top-2 text-[10px] text-amber-400 font-bold">mm</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Refilado (Limpieza de bordes)</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {['top', 'bottom', 'left', 'right'].map((side) => {
                                            const labels: Record<string, string> = { top: 'Sup', bottom: 'Inf', left: 'Izq', right: 'Der' };
                                            return (
                                                <div key={side} className="flex flex-col gap-1">
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            value={config.trimming[side as keyof typeof config.trimming]}
                                                            onChange={(e) => handleTrimmingChange(side as keyof typeof config.trimming, Number(e.target.value))}
                                                        className="w-full text-center text-xs font-bold px-1 py-2 rounded-lg border-none bg-[#e9efee]/50 focus:ring-1 focus:ring-indigo-500/20 outline-none"
                                                        />
                                                        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1 bg-white/80 text-[8px] font-black text-slate-400 uppercase leading-none">{labels[side]}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Estrategia</label>
                                        <select
                                            className="w-full text-xs px-2 py-2 rounded-lg border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-indigo-500/20 outline-none font-bold"
                                            value={config.strategy}
                                            onChange={(e) => setConfig(prev => ({ ...prev, strategy: e.target.value as 'MAX_SAVINGS' | 'SIMPLE_CUTS' }))}
                                        >
                                            <option value="MAX_SAVINGS">Ahorro Máx</option>
                                            <option value="SIMPLE_CUTS">Simples</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Prioridad</label>
                                        <select
                                            className="w-full text-xs px-2 py-2 rounded-lg border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-indigo-500/20 outline-none font-bold"
                                            value={config.cutDirection}
                                            onChange={(e) => setConfig(prev => ({ ...prev, cutDirection: e.target.value as 'OPTIMAL' | 'HORIZONTAL' | 'VERTICAL' }))}
                                        >
                                            <option value="OPTIMAL">Auto</option>
                                            <option value="HORIZONTAL">Horiz</option>
                                            <option value="VERTICAL">Vert</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Section 3: Bordes y Cantos */}
                        <section className="flex flex-col gap-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                                <span className="material-icons-round text-[16px] text-emerald-500">edgesensor_low</span>
                                3. Bordes y Cantos (Tapacantos)
                            </h3>
                            
                            <div className="bg-slate-100/40 backdrop-blur-md p-4 rounded-2xl border border-white/30 flex flex-col gap-4">
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Tipo 1 */}
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white shadow-md shadow-emerald-500/20">1</span>
                                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">Canto Tipo 1</label>
                                        </div>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                step="0.1" 
                                                value={config.edgeThickness1} 
                                                onChange={e => setConfig(prev => ({ ...prev, edgeThickness1: Number(e.target.value) }))}
                                                className="w-full text-base font-black px-4 py-2.5 rounded-xl border-none bg-[#e9efee]/50 text-emerald-700 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                                            />
                                            <span className="absolute right-4 top-3 text-[11px] font-bold text-emerald-500/70">mm</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-medium">Espesor a descontar perimetralmente</p>
                                    </div>

                                    {/* Tipo 2 */}
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow-md shadow-indigo-500/20">2</span>
                                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">Canto Tipo 2</label>
                                        </div>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                step="0.1" 
                                                value={config.edgeThickness2} 
                                                onChange={e => setConfig(prev => ({ ...prev, edgeThickness2: Number(e.target.value) }))}
                                                className="w-full text-base font-black px-4 py-2.5 rounded-xl border-none bg-[#e9efee]/50 text-indigo-700 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                            />
                                            <span className="absolute right-4 top-3 text-[11px] font-bold text-indigo-500/70">mm</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-medium">Espesor a descontar perimetralmente</p>
                                    </div>
                                </div>
                                <div className="mt-2 p-3 bg-white/40 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/40 text-[10px] text-blue-600 dark:text-blue-400 leading-relaxed italic">
                                    * El sistema descontará automáticamente estos espesores de las piezas finales para asegurar que la medida terminada sea la solicitada.
                                </div>
                            </div>
                        </section>

                        {/* Section 4: Documentación */}
                        <section className="flex flex-col gap-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                                <span className="material-icons-round text-[16px] text-rose-500">description</span>
                                4. Documentación
                            </h3>
                            
                            <div className="bg-slate-100/40 backdrop-blur-md p-4 rounded-2xl border border-white/30 flex flex-col gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Datos del Cliente</label>
                                    <input 
                                        type="text" 
                                        value={config.clientName} 
                                        onChange={e => setConfig(prev => ({ ...prev, clientName: e.target.value }))}
                                        className="w-full text-sm px-3 py-2 rounded-xl border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                        placeholder="Nombre o ID del cliente"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Orden de Trabajo (OT)</label>
                                    <div className="flex items-center gap-3 px-3 py-2 bg-white/20 rounded-xl border border-white/20 text-slate-600 font-mono text-sm">
                                        <span className="material-icons-round text-sm">tag</span>
                                        {config.workOrder}
                                        <span className="ml-auto text-[8px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded uppercase font-black tracking-widest">Auto</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Info de Etiquetas</label>
                                    <textarea 
                                        value={config.labelInfo} 
                                        onChange={e => setConfig(prev => ({ ...prev, labelInfo: e.target.value }))}
                                        rows={2}
                                        className="w-full text-sm px-3 py-2 rounded-xl border-none bg-[#e9efee]/50 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none mb-3"
                                        placeholder="Notas adicionales para las etiquetas de corte..."
                                    />
                                    {onPrintLabels && (
                                        <button
                                            onClick={onPrintLabels}
                                            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-[#e9efee]/50 hover:bg-[#e9efee]/70 text-slate-700 font-bold rounded-lg transition-colors text-xs"
                                        >
                                            <span className="material-icons-round text-[16px]">label</span>
                                            Imprimir Etiquetas de Piezas
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>
                        {/* Section 5: Interfaz de Usuario */}
                        <section className="flex flex-col gap-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                                <span className="material-icons-round text-[16px] text-indigo-500">laptop</span>
                                5. Interfaz de Usuario
                            </h3>
                            
                            <div className="bg-[#e9efee]/40 p-4 rounded-2xl border border-slate-200/20 flex flex-col gap-4">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Modo de Visualización</label>
                                <div className="flex bg-[#e9efee]/60 p-1 rounded-xl border-none shadow-inner shadow-slate-200/30">
                                    <button 
                                        onClick={() => setViewMode('COMMANDS')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${viewMode === 'COMMANDS' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md transform scale-105' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                                    >
                                        <span className="material-icons-round text-sm">terminal</span>
                                        COMANDOS
                                    </button>
                                    <button 
                                        onClick={() => setViewMode('VISUAL')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${viewMode === 'VISUAL' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md transform scale-105' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                                    >
                                        <span className="material-icons-round text-sm">visibility</span>
                                        VISUAL
                                    </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium italic mt-1">
                                    * Selecciona el modo de trabajo preferido para el ingreso de piezas.
                                </p>
                            </div>
                        </section>
                    </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200/20 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-indigo-600 text-white font-black text-sm rounded-xl hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 transition-all active:scale-[0.98] uppercase tracking-widest"
                    >
                        Confirmar Configuración
                    </button>
                </div>
            </div>
        </div>
    );
};

export const SettingsModal = React.memo(SettingsModalComponent);
