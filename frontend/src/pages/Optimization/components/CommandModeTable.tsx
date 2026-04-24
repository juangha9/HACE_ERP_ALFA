import React, { memo, useCallback, useRef, useEffect, useState, startTransition } from 'react';
import type { Piece } from '../types';
import { api } from '../../../services/api';

interface CommandModeTableProps {
    pieces: Piece[];
    setPieces: React.Dispatch<React.SetStateAction<Piece[]>>;
    isLocked?: boolean;
}

const parseEdgeCommand = (fullCommand: string) => {
    const banding = { top: 0, bottom: 0, left: 0, right: 0 };
    if (!fullCommand) return banding;
    const commands = fullCommand.trim().split(/\s+/);
    commands.forEach(command => {
        if (!command.startsWith('@')) return;
        const isThick = command.toLowerCase().endsWith('g');
        const type = isThick ? 2 : 1;
        const code = command.replace('@', '').toLowerCase().replace('g', '');
        switch (code) {
            case '1': banding.left = type; banding.right = type; break;
            case '2': banding.top = type; banding.bottom = type; break;
            case '3': banding.top = type; banding.bottom = type; banding.left = type; banding.right = type; break;
            case '4': banding.left = type; banding.top = type; break;
            case '5': banding.left = type; banding.right = type; banding.top = type; break;
            case '6': banding.top = type; banding.bottom = type; banding.left = type; break;
            case '7': 
                if (banding.top === 0) banding.top = type;
                else if (banding.bottom === 0) banding.bottom = type;
                break;
            case '8': 
                if (banding.left === 0) banding.left = type;
                else if (banding.right === 0) banding.right = type;
                break;
        }
    });
    return banding;
};

const CommandInput = memo(({ 
    initialValue, 
    onSync,
    onRealTimeChange,
    type = 'text',
    className = "",
    onKeyDown,
    placeholder = "",
    numericOnly = false,
    maxDigits = 999,
    inputRef,
    hasError = false
}: { 
    initialValue: string | number, 
    onSync: (val: string) => void,
    onRealTimeChange?: (val: string) => void,
    type?: string,
    className?: string,
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void,
    placeholder?: string,
    numericOnly?: boolean,
    maxDigits?: number,
    inputRef?: React.RefObject<HTMLInputElement>,
    hasError?: boolean
}) => {
    const [localValue, setLocalValue] = useState(initialValue === 0 ? '' : initialValue);
    
    useEffect(() => { 
        setLocalValue(initialValue === 0 ? '' : initialValue); 
    }, [initialValue]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        if (numericOnly) val = val.replace(/\D/g, '').substring(0, maxDigits);
        setLocalValue(val);
        onRealTimeChange?.(val); // fire immediately for real-time consumers
    };

    const handleBlur = useCallback(() => {
        // Use startTransition: focusout returns immediately, React batches the update
        startTransition(() => {
            onSync(String(localValue === '' ? 0 : localValue));
        });
    }, [localValue, onSync]);

    return (
        <div className="relative w-full h-full flex items-center overflow-hidden">
            <input 
                ref={inputRef}
                type={type}
                value={localValue}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        handleBlur();
                    }
                    onKeyDown?.(e);
                }}
                placeholder={placeholder || (numericOnly ? '0' : '')}
                className={`${className} border-none outline-none focus:ring-0 p-0 m-0 w-full bg-transparent`}
                style={{ height: '18px', lineHeight: '13px', fontSize: '13px' }}
            />
            {hasError && (
                <div className="absolute top-0 right-0 bg-red-600 text-white text-[8px] px-1 rounded-bl z-50 pointer-events-none font-bold">
                    !
                </div>
            )}
        </div>
    );
});

// Local state Cantos component — rectangle preview is real-time via local state
const CantosInput = memo(({ 
    piece, 
    onUpdate, 
    onAddRow,
    isLast,
    liveWidth,
    liveHeight
}: { 
    piece: Piece, 
    onUpdate: (id: string, updates: Partial<Piece>) => void,
    onAddRow: () => void,
    isLast: boolean,
    liveWidth: number,
    liveHeight: number
}) => {
    const [localValue, setLocalValue] = useState(piece.comment?.split('|')[0] || '');
    // Real-time local edge banding for the preview rectangle
    const [localEdgeBanding, setLocalEdgeBanding] = useState(piece.edgeBanding);

    useEffect(() => {
        const stored = piece.comment?.split('|')[0] || '';
        setLocalValue(stored);
        setLocalEdgeBanding(piece.edgeBanding);
    }, [piece.comment, piece.edgeBanding]);

    const handleSync = (valToSync: string) => {
        const currentStored = piece.comment?.split('|')[0] || '';
        if (valToSync !== currentStored) {
            const parsed = parseEdgeCommand(valToSync);
            onUpdate(piece.id, { 
                comment: valToSync + (piece.comment?.includes('|') ? '|' + piece.comment.split('|')[1] : ''),
                edgeBanding: parsed
            });
        }
    };

    const applyValue = (newValue: string) => {
        const parsed = parseEdgeCommand(newValue);
        setLocalValue(newValue);
        setLocalEdgeBanding(parsed); // real-time preview update
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        if (/^[@1-8gG\s]*$/.test(val)) {
             // Si queda un '@' solo (por borrar el número), lo eliminamos
             if (val.trim() === '@') {
                 val = '';
             } else if (val.endsWith(' @')) {
                 val = val.slice(0, -2);
             }
             applyValue(val);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const isNumber1to8 = /^[1-8]$/.test(e.key);
        if (isNumber1to8) {
            e.preventDefault();
            const input = e.currentTarget;
            const start = input.selectionStart || 0;
            const value = input.value;
            const isNewCode = start === 0 || value[start - 1] === ' ';
            
            if (isNewCode) {
                // Validación preventiva en KeyDown solo al iniciar un nuevo código
                const currentParsed = parseEdgeCommand(value);
                const code = e.key;
                const newEdges = [];
                if (code === '1') newEdges.push('left', 'right');
                else if (code === '2') newEdges.push('top', 'bottom');
                else if (code === '3') newEdges.push('top', 'bottom', 'left', 'right');
                else if (code === '4') newEdges.push('left', 'top');
                else if (code === '5') newEdges.push('left', 'right', 'top');
                else if (code === '6') newEdges.push('top', 'bottom', 'left');
                else if (code === '7') {
                    if (currentParsed.top > 0 && currentParsed.bottom > 0) newEdges.push('top', 'bottom');
                }
                else if (code === '8') {
                    if (currentParsed.left > 0 && currentParsed.right > 0) newEdges.push('left', 'right');
                }

                const conflict = newEdges.length > 0 && newEdges.every(edge => (currentParsed as any)[edge] > 0);
                if (conflict) {
                    // Si el usuario presiona el mismo número que ya existe, no bloqueamos para permitir "re-escribir" o simplemente no hacer nada agresivo
                    // Pero si es un número diferente que choca, sí bloqueamos
                    return; 
                }
            }

            const insertion = isNewCode ? `@${e.key}` : e.key;
            const newValue = value.substring(0, start) + insertion + value.substring(start);
            applyValue(newValue);
        } else if (e.key === 'Enter' || (e.key === 'Tab' && isLast && !e.shiftKey)) {
            handleSync(localValue);
            if (isLast) {
                e.preventDefault();
                // Always call onAddRow — it is validateAndAdd from CommandRow
                // and will handle showing error badges if fields are missing
                onAddRow();
            }
        }
    };

    // Use live dimensions for real-time aspect ratio (updates as user types)
    const eb = localEdgeBanding;
    const mapColor = (type: number) => type === 2 ? '#4A90E2' : '#fb7185';
    const w = liveWidth || piece.width || 1;
    const h = liveHeight || piece.height || 1;
    // Normalize to a max of 22px on the longer side, min of 12px on the shorter
    const maxSide = 22;
    const minSide = 12;
    const ratio = w / h;
    let rectW: number, rectH: number;
    if (ratio >= 1) {
        // Landscape: width >= height
        rectW = maxSide;
        rectH = Math.max(minSide, Math.round(maxSide / ratio));
    } else {
        // Portrait: height > width
        rectH = maxSide;
        rectW = Math.max(minSide, Math.round(maxSide * ratio));
    }

    // Semantic edge mapping:
    // @1 = left+right = CORTOS (shorter dimension edges)
    // @2 = top+bottom = LARGOS (longer dimension edges)
    // In portrait rectangle (h > w): left/right are the LONG visual sides,
    // so we must SWAP: render cortos (left/right data) on top/bottom visually
    // and largos (top/bottom data) on left/right visually.
    const isPortrait = h > w;

    // Visual edge assignments
    const vTop    = isPortrait ? eb.left  : eb.top;     // short horizontal side
    const vBottom = isPortrait ? eb.right : eb.bottom;  // short horizontal side
    const vLeft   = isPortrait ? eb.top   : eb.left;    // vertical side
    const vRight  = isPortrait ? eb.bottom: eb.right;   // vertical side

    return (
        <div className="flex items-center h-full w-full">
            <div className="relative flex-1 h-full pl-1 pr-0">
                {!localValue && (
                    <div className="absolute inset-0 flex items-center pointer-events-none pl-0.5">
                        <span className="text-slate-500 dark:text-slate-400 font-bold opacity-30 select-none" style={{ fontSize: '13px' }}>@</span>
                    </div>
                )}
                <input 
                    type="text" 
                    value={localValue} 
                    onChange={handleChange}
                    onBlur={() => handleSync(localValue)}
                    onKeyDown={handleKeyDown}
                    className="relative z-10 w-full bg-transparent border-none outline-none focus:ring-0 text-left text-slate-700 dark:text-slate-300 p-0 m-0"
                    style={{ height: '18px', lineHeight: '13px', fontSize: '13px' }}
                />
            </div>
            {/* Proportional rectangle — cortos always on short sides, largos on long sides */}
            <div className="shrink-0 mr-1 flex items-center justify-center" style={{ width: '22px', height: '22px' }}>
                <div style={{
                    width: `${rectW}px`, height: `${rectH}px`,
                    border: '1.5px solid #94a3b8', borderRadius: '2px',
                    position: 'relative', background: '#f1f5f9',
                    overflow: 'hidden', flexShrink: 0
                }}>
                    {vTop    > 0 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: mapColor(vTop) }} />}
                    {vBottom > 0 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: mapColor(vBottom) }} />}
                    {vLeft   > 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '2px', background: mapColor(vLeft) }} />}
                    {vRight  > 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '2px', background: mapColor(vRight) }} />}
                </div>
            </div>
        </div>
    );
});


const CommandRow = memo(({ 
    piece, 
    onUpdate, 
    onRemove, 
    onAddRow, 
    isLast,
    shouldFocusQuantity,
    rowIndex,
    validMaterials
}: { 
    piece: Piece, 
    onUpdate: (id: string, updates: Partial<Piece>) => void, 
    onRemove: (id: string) => void,
    onAddRow: () => void,
    isLast: boolean,
    shouldFocusQuantity: boolean,
    rowIndex: number,
    validMaterials: { id: string, label: string, w: number, h: number, number?: number, name: string }[]
}) => {
    const [showMatTooltip, setShowMatTooltip] = useState(false);
    const quantityRef = useRef<HTMLInputElement>(null);
    const [errors, setErrors] = useState<{quantity?: boolean, width?: boolean, height?: boolean, material?: boolean}>({});
    // Live dimensions for real-time rectangle preview in CantosInput
    const [liveWidth, setLiveWidth] = useState(piece.width || 0);
    const [liveHeight, setLiveHeight] = useState(piece.height || 0);

    // Sync live dimensions when piece prop changes (e.g. loaded from history)
    useEffect(() => {
        setLiveWidth(piece.width || 0);
        setLiveHeight(piece.height || 0);
    }, [piece.width, piece.height]);

    const selectedMaterial = piece.material ? validMaterials.find(m => m.number?.toString() === piece.material) : null;

    useEffect(() => {
        if (shouldFocusQuantity && quantityRef.current) {
            const timer = setTimeout(() => {
                quantityRef.current?.focus();
                quantityRef.current?.select();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [shouldFocusQuantity]);

    const validateAndAdd = () => {
        const isValidMaterial = !piece.material || validMaterials.some(m => m.number?.toString() === piece.material);

        const newErrors = {
            quantity: !piece.quantity || piece.quantity <= 0,
            width: !piece.width || piece.width <= 0,
            height: !piece.height || piece.height <= 0,
            material: !isValidMaterial
        };
        setErrors(newErrors);

        if (!newErrors.quantity && !newErrors.width && !newErrors.height && !newErrors.material) {
            onAddRow();
        } else {
            setTimeout(() => setErrors({}), 1500);
        }
    };

    const isEven = rowIndex % 2 === 0;
    const rowBg = isEven ? '#ffffff' : '#f0f5f4'; // white vs Light Mint Mist

    return (
        <tr
            className="transition-colors group/row"
            style={{ height: '18px', maxHeight: '18px', lineHeight: '13px', background: rowBg }}
            onMouseEnter={e => (e.currentTarget.style.background = '#dcfce7')}  
            onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
        >
            <td className="p-0 m-0 border-b border-r border-l border-[#d3dcdb]/30 w-8" style={{ height: '18px', maxHeight: '18px' }}>
                <div className="flex items-center justify-center w-full h-full">
                    <input 
                        type="checkbox" 
                        checked={piece.enabled !== false} 
                        onChange={(e) => { e.stopPropagation(); onUpdate(piece.id, { enabled: e.target.checked }); }}
                        className="w-3 h-3 rounded border-[#d3dcdb] text-[#4A90E2] focus:ring-[#4A90E2] cursor-pointer m-0 p-0"
                    />
                </div>
            </td>
            <td className="p-0 m-0 border-b border-r border-[#d3dcdb]/30 text-center font-normal text-slate-400 bg-slate-50/10 w-12" style={{ height: '18px', maxHeight: '18px', lineHeight: '13px', fontSize: '12px' }}>
                {piece.code}
            </td>
            <td className="p-0 m-0 border-b border-r border-[#d3dcdb]/30" style={{ height: '18px', maxHeight: '18px' }}>
                <CommandInput 
                    inputRef={quantityRef}
                    initialValue={piece.quantity}
                    onSync={(val) => onUpdate(piece.id, { quantity: Number(val) })}
                    type="number"
                    hasError={errors.quantity}
                    className="text-center text-slate-700 dark:text-slate-300"
                />
            </td>
            <td className="p-0 m-0 border-b border-r border-[#d3dcdb]/30" style={{ height: '18px', maxHeight: '18px' }}>
                <CommandInput 
                    initialValue={piece.height}
                    onSync={(val) => onUpdate(piece.id, { height: Number(val) })}
                    onRealTimeChange={(val) => setLiveHeight(Number(val) || 0)}
                    numericOnly={true}
                    maxDigits={5}
                    hasError={errors.height}
                    className="text-center text-slate-700 dark:text-slate-300"
                />
            </td>
            <td className="p-0 m-0 border-b border-r border-[#d3dcdb]/30" style={{ height: '18px', maxHeight: '18px' }}>
                <CommandInput 
                    initialValue={piece.width}
                    onSync={(val) => onUpdate(piece.id, { width: Number(val) })}
                    onRealTimeChange={(val) => setLiveWidth(Number(val) || 0)}
                    numericOnly={true}
                    maxDigits={5}
                    hasError={errors.width}
                    className="text-center text-slate-700 dark:text-slate-300"
                />
            </td>
            <td
                className="p-0 m-0 border-b border-r border-[#d3dcdb]/30 relative"
                style={{ height: '18px', maxHeight: '18px' }}
                onMouseEnter={() => selectedMaterial && setShowMatTooltip(true)}
                onMouseLeave={() => setShowMatTooltip(false)}
            >
                <CommandInput 
                    initialValue={piece.material || ''}
                    onSync={(val) => {
                        const isValid = !val || val === '0' || validMaterials.some(m => m.number?.toString() === val);
                        startTransition(() => {
                            onUpdate(piece.id, { material: val });
                            setErrors(prev => ({ ...prev, material: !isValid }));
                        });
                    }}
                    numericOnly={true}
                    maxDigits={3}
                    placeholder="000"
                    hasError={errors.material}
                    className={`text-center font-bold ${errors.material ? 'text-rose-500' : 'text-[#4A90E2]/70'}`}
                />
                {errors.material && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[110] pointer-events-none">
                        <div className="bg-rose-600 text-white text-[9px] py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap border border-rose-400 font-black uppercase flex items-center gap-1.5">
                            <span className="material-icons-round text-sm">warning</span>
                            N° de tablero inexistente
                        </div>
                        <div className="w-2 h-2 bg-rose-600 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2 border-r border-b border-rose-400"></div>
                    </div>
                )}
                {showMatTooltip && selectedMaterial && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-[100] pointer-events-none">
                        <div className="bg-black text-white text-[11px] py-1 px-3 rounded shadow-lg whitespace-nowrap font-bold border border-white/10">
                            {selectedMaterial.name} ({selectedMaterial.w} x {selectedMaterial.h} mm)
                        </div>
                    </div>
                )}
            </td>
            <td className="p-0 m-0 border-b border-r border-[#d3dcdb]/30 overflow-hidden" style={{ height: '18px', maxHeight: '18px' }}>
                {/* CantosInput: receives live dimensions for real-time rectangle preview */}
                <CantosInput 
                    piece={piece}
                    onUpdate={onUpdate}
                    isLast={isLast}
                    onAddRow={validateAndAdd}
                    liveWidth={liveWidth}
                    liveHeight={liveHeight}
                />
            </td>
            <td className="p-0 m-0 border-b border-r border-[#d3dcdb]/30" style={{ height: '15px' }}>
                <CommandInput 
                    initialValue={piece.comment?.split('|')[1] || ''}
                    onSync={(val) => onUpdate(piece.id, { 
                        comment: (piece.comment?.split('|')[0] || '') + '|' + val 
                    })}
                    placeholder="..."
                    className="text-left px-1 italic text-slate-400 dark:text-slate-500 text-[11px]"
                />
            </td>
            <td className="p-0 m-0 border-b border-r border-[#d3dcdb]/30 text-center w-10" style={{ height: '18px', maxHeight: '18px' }}>
                <div className="flex items-center justify-center w-full h-full">
                    <button 
                        onClick={() => onRemove(piece.id)}
                        className="w-4 h-4 rounded text-slate-300 hover:text-red-500 transition-all flex items-center justify-center m-0 p-0"
                    >
                        <span className="material-icons-round text-[12px]">delete</span>
                    </button>
                </div>
            </td>
        </tr>
    );
});

export const CommandModeTable: React.FC<CommandModeTableProps> = ({ pieces, setPieces, isLocked = false }) => {
    const [validMaterials, setValidMaterials] = useState<{ id: string, label: string, w: number, h: number, number?: number, name: string }[]>([]);
    const [lastAddedId, setLastAddedId] = useState<string | null>(null);

    useEffect(() => {
        api.getCustomBoards().then(setValidMaterials);
    }, []);

    const handleAddRow = useCallback(() => {
        const id = `p-${Date.now()}`;
        setPieces(prev => {
            const newPiece: Piece = {
                id,
                description: '',
                code: String(prev.length + 1).padStart(3, '0'),
                width: 0,
                height: 0,
                quantity: 1,
                matchGrain: false,
                edgeBanding: { top: 0, bottom: 0, left: 0, right: 0 },
                enabled: true,
                comment: '', 
                material: ''
            };
            return [...prev, newPiece];
        });
        setLastAddedId(id);
    }, [setPieces]);

    const handleUpdatePiece = useCallback((id: string, updates: Partial<Piece>) => {
        // startTransition: marks this update as non-urgent so focusout returns immediately.
        // React will batch and process this after the browser has painted.
        startTransition(() => {
            setPieces(prev => {
                const idx = prev.findIndex(p => p.id === id);
                if (idx === -1) return prev;
                const next = [...prev];
                next[idx] = { ...next[idx], ...updates };
                return next;
            });
        });
    }, [setPieces]);

    const handleRemovePiece = useCallback((id: string) => {
        setPieces(prev => prev.filter(p => p.id !== id));
    }, [setPieces]);

    return (
        <div className="flex flex-col h-auto bg-white">
            <div className="relative">
                <table className="w-full border-collapse border-spacing-0 table-fixed">
                    <thead className="sticky top-0 z-30 bg-[#f0f5f4] text-[#366480] font-bold uppercase tracking-wider" style={{ fontSize: '11px', lineHeight: '11px' }}>
                        <tr style={{ height: '18px', maxHeight: '18px' }}>
                            <th className="p-0 border-b border-r border-l border-[#d3dcdb]/30 w-8 text-center bg-[#f0f5f4]" style={{ height: '18px' }}>M</th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-12 text-center bg-[#f0f5f4]" style={{ height: '18px' }}>CÓD.</th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-16 text-center bg-[#f0f5f4]" style={{ height: '18px' }}>CANT.</th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-20 text-center bg-[#f0f5f4]" style={{ height: '18px' }}>ANCHO</th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-20 text-center bg-[#f0f5f4]" style={{ height: '18px' }}>LARGO</th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-16 text-center bg-[#f0f5f4] relative group/mat-header" style={{ height: '18px' }}>
                                MAT.
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/mat-header:block z-[100] pointer-events-none">
                                    <div className="bg-black text-white text-[10px] py-2 px-3 rounded-xl shadow-2xl border border-white/20 flex flex-col gap-1 min-w-[220px] animate-premium-fade">
                                        <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                            {validMaterials.map(m => (
                                                <div key={m.id} className="flex items-center gap-2 text-left hover:bg-white/10 p-1 rounded transition-colors whitespace-nowrap">
                                                    <span className="w-5 h-5 flex items-center justify-center bg-white/20 text-white font-black rounded text-[9px] shrink-0">
                                                        {m.number}
                                                    </span>
                                                    <span className="font-bold text-white text-[11px]">{m.name}</span>
                                                    <span className="text-white text-[10px]">({m.w}x{m.h}mm)</span>
                                                </div>
                                            ))}
                                            {validMaterials.length === 0 && <p className="text-white/40 italic py-1">Sin materiales.</p>}
                                        </div>
                                    </div>
                                </div>
                            </th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-36 text-center bg-[#f0f5f4] relative group/canto-header" style={{ height: '18px' }}>
                                CANTOS
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/canto-header:block z-[100] pointer-events-none">
                                    <div className="bg-black text-white text-[10px] py-3 px-4 rounded-xl shadow-2xl border border-white/20 flex flex-col gap-2 min-w-[200px] animate-premium-fade">
                                        <div className="flex items-center gap-2 border-b border-white/10 pb-1.5 mb-0.5">
                                            <span className="material-icons-round text-rose-500 text-sm">edgesensor_high</span>
                                            <span className="font-black uppercase tracking-widest text-white">Leyenda de Cantos</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-white">@1</span>
                                                <span className="text-white">2 cortos</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-white">@2</span>
                                                <span className="text-white">2 largos</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-white">@3</span>
                                                <span className="text-white">4 lados</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-white">@4</span>
                                                <span className="text-white">1 largo 1 corto</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-white">@5</span>
                                                <span className="text-white">2 largos 1 corto</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-white">@6</span>
                                                <span className="text-white">2 cortos 1 largo</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-white">@7</span>
                                                <span className="text-white">1 corto</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-white">@8</span>
                                                <span className="text-white">1 largo</span>
                                            </div>
                                        </div>
                                        <div className="mt-2 pt-1.5 border-t border-white/10 text-[9px] flex flex-col gap-1">
                                            <p className="text-slate-300"><span className="text-rose-400 font-bold">Corto</span> = la medida más corta de la pieza (min entre ancho y largo).</p>
                                            <p className="text-slate-300"><span className="text-indigo-300 font-bold">Largo</span> = la medida más larga de la pieza (max entre ancho y largo).</p>
                                            <p className="text-slate-400 italic">Ej: en 200×400 → corto=200, largo=400. En 400×200 → corto=200, largo=400.</p>
                                            <p className="text-slate-400 mt-0.5">Añade <span className="text-white font-bold">"g"</span> para <span className="text-indigo-300 font-bold">Canto Grueso</span>. Ej: @3g</p>
                                        </div>
                                    </div>
                                </div>
                            </th>
                            <th className="p-0 px-1 border-b border-r border-[#d3dcdb]/30 text-left bg-[#f0f5f4]" style={{ height: '18px' }}>COMENTARIO</th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-10 bg-[#f0f5f4]" style={{ height: '18px' }}></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#d3dcdb]/20 bg-white">
                        {pieces.map((piece, index) => (
                            <CommandRow 
                                key={piece.id}
                                piece={piece}
                                onUpdate={handleUpdatePiece}
                                onRemove={handleRemovePiece}
                                onAddRow={handleAddRow}
                                isLast={index === pieces.length - 1}
                                shouldFocusQuantity={piece.id === lastAddedId}
                                rowIndex={index}
                                validMaterials={validMaterials}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-1 border-t dark:border-slate-800 bg-slate-50/50 dark:bg-transparent flex justify-between items-center shrink-0">
                <button 
                    onClick={isLocked ? undefined : handleAddRow}
                    disabled={isLocked}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-[6px] text-[10px] font-[800] transition-all active:scale-95 shadow-sm uppercase tracking-wider ${
                        isLocked
                        ? 'bg-[#f0f5f4] text-[#366480]/30 cursor-not-allowed shadow-none'
                        : 'bg-[#4A90E2] text-white hover:bg-[#357ABD] shadow-blue-500/10'
                    }`}
                    title={isLocked ? 'Optimización bloqueada — no se pueden agregar filas' : 'Agregar fila'}
                >
                    <span className="material-icons-round text-xs">{isLocked ? 'lock' : 'add'}</span>
                    Nueva Fila
                </button>
                <div className="flex gap-4 text-[9px] font-[800] text-[#366480]/50 uppercase tracking-[0.1em] overflow-hidden pr-2">
                    <span className="flex items-center gap-1.5 shrink-0"><div className="w-2 h-2 rounded-full bg-[#fb7185]"></div> Delgado</span>
                    <span className="flex items-center gap-1.5 shrink-0"><div className="w-2 h-2 rounded-full bg-[#4A90E2]"></div> Grueso</span>
                </div>
            </div>
        </div>
    );
};
