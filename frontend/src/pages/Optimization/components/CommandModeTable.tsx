import React, { memo, useCallback, useRef, useEffect, useState, useMemo, startTransition } from 'react';
import { createPortal } from 'react-dom';
import type { Piece } from '../types';
import { api } from '../../../services/api';

interface CommandModeTableProps {
    pieces: Piece[];
    setPieces: React.Dispatch<React.SetStateAction<Piece[]>>;
    isLocked?: boolean;
}

// Modelo semántico del data:
//   eb.left/right = "cortos" (lados más cortos de la pieza)
//   eb.top/bottom = "largos" (lados más largos de la pieza)
// El render de la previsualización rota la vista cuando la pieza es portrait
// para que el usuario siempre vea cortos como los lados visualmente más cortos
// y largos como los más largos. Los datos quedan estables.
//
// Leyenda de comandos (fuente única — debe coincidir con el tooltip de CANTOS):
//   @1 = 2 cortos, @2 = 2 largos, @3 = 4 lados,
//   @4 = 1 corto + 1 largo, @5 = 2 largos + 1 corto, @6 = 2 cortos + 1 largo,
//   @7 = 1 corto, @8 = 1 largo
//
// Comportamiento aditivo: cada @N rellena los espacios que aún están en 0
// según su definición. Repetir un comando rellena el "siguiente" espacio que
// quedaba libre, en vez de bloquear (antes @4 solo se podía teclear una vez).
const parseEdgeCommand = (fullCommand: string) => {
    const banding: { top: number; bottom: number; left: number; right: number } =
        { top: 0, bottom: 0, left: 0, right: 0 };
    if (!fullCommand) return banding;
    const commands = fullCommand.trim().split(/\s+/);

    type Side = 'top' | 'bottom' | 'left' | 'right';
    const cortos: Side[] = ['left', 'right'];
    const largos: Side[] = ['top', 'bottom'];

    const fillFirst = (sides: Side[], type: number): boolean => {
        for (const s of sides) {
            if (banding[s] === 0) { banding[s] = type; return true; }
        }
        return false;
    };
    const fillAll = (sides: Side[], type: number) => {
        for (const s of sides) banding[s] = type;
    };

    commands.forEach(command => {
        if (!command.startsWith('@')) return;
        const isThick = command.toLowerCase().endsWith('g');
        const type = isThick ? 2 : 1;
        const code = command.replace('@', '').toLowerCase().replace('g', '');
        switch (code) {
            case '1': fillAll(cortos, type); break;                                  // 2 cortos
            case '2': fillAll(largos, type); break;                                  // 2 largos
            case '3': fillAll([...cortos, ...largos], type); break;                  // 4 lados
            case '4': fillFirst(cortos, type); fillFirst(largos, type); break;       // 1 corto + 1 largo
            case '5': fillAll(largos, type); fillFirst(cortos, type); break;         // 2 largos + 1 corto
            case '6': fillAll(cortos, type); fillFirst(largos, type); break;         // 2 cortos + 1 largo
            case '7': fillFirst(cortos, type); break;                                // 1 corto
            case '8': fillFirst(largos, type); break;                                // 1 largo
        }
    });
    return banding;
};

/**
 * Mueve el foco al siguiente input editable en orden de DOM. Útil tras copiar
 * un valor con ENTER — el cursor se desplaza a la columna siguiente como en
 * Excel. Recorre todos los inputs/selects/textareas no deshabilitados y
 * encuentra el siguiente al actual.
 */
const moveFocusToNextInput = (currentEl: HTMLElement) => {
    const focusables = Array.from(
        document.querySelectorAll<HTMLElement>(
            'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]), textarea:not([disabled]), select:not([disabled])'
        )
    );
    const idx = focusables.indexOf(currentEl);
    if (idx < 0 || idx + 1 >= focusables.length) return;
    const next = focusables[idx + 1];
    next.focus();
    if ('select' in next && typeof (next as HTMLInputElement).select === 'function') {
        (next as HTMLInputElement).select();
    }
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
    hasError = false,
    previousValue,
    onAddRowOnTab,
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
    hasError?: boolean,
    /** Valor de la celda inmediata superior. Si está definido y la celda actual
     *  está vacía, ENTER copia este valor en lugar de solo sincronizar. */
    previousValue?: string | number,
    /** Si está definido, TAB en esta celda crea una nueva fila (cuando es la última). */
    onAddRowOnTab?: () => void,
    /** Si está definido, ENTER en esta celda crea una nueva fila CUANDO no
     *  haya nada para copiar de la fila superior y esta sea la última fila.
     *  Replica el flujo "copy or create" de CANTOS para COMENTARIO. */
    onAddRowOnEnter?: () => void,
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
                        // "Pristine" = la celda no fue tocada por el usuario:
                        // o está vacía/cero, o sigue mostrando exactamente el
                        // valor inicial recibido del piece (ej.: CANTIDAD que
                        // arranca con default 1). El check anterior (solo
                        // empty/zero) fallaba para CANTIDAD porque 1 no es 0.
                        const isPristine =
                            localValue === '' ||
                            localValue === 0 ||
                            String(localValue) === String(initialValue);
                        const hasPrev = previousValue !== undefined && previousValue !== '' && previousValue !== 0;
                        if (isPristine && hasPrev) {
                            // Copia el valor de la celda superior y mueve el
                            // foco al siguiente input — flujo de "ENTER por
                            // columna" para replicar la fila de arriba.
                            e.preventDefault();
                            const v = String(previousValue);
                            setLocalValue(numericOnly ? v.replace(/\D/g, '') : v);
                            onRealTimeChange?.(v);
                            startTransition(() => onSync(v));
                            const currentEl = e.currentTarget;
                            setTimeout(() => moveFocusToNextInput(currentEl), 0);
                            return;
                        }
                        // Sin copia posible: si esta celda crea fila al final
                        // (típicamente COMENTARIO último), abrir nueva fila.
                        if (onAddRowOnEnter) {
                            e.preventDefault();
                            handleBlur();
                            onAddRowOnEnter();
                            return;
                        }
                        handleBlur();
                    }
                    if (e.key === 'Tab' && !e.shiftKey && onAddRowOnTab) {
                        // El TAB en COMENTARIOS de la última fila crea una fila
                        // nueva (replica el atajo de CANTOS). Si NO es la última
                        // fila, el caller no setea onAddRowOnTab, así que el
                        // tabulador conserva la navegación normal.
                        e.preventDefault();
                        handleBlur();
                        onAddRowOnTab();
                        return;
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
    liveHeight,
    previousValue,
}: {
    piece: Piece,
    onUpdate: (id: string, updates: Partial<Piece>) => void,
    onAddRow: () => void,
    isLast: boolean,
    liveWidth: number,
    liveHeight: number,
    /** Cantos en formato string ("@1 @2") de la fila inmediata superior. ENTER
     *  copia esto si esta celda está vacía. */
    previousValue?: string,
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
            const insertion = isNewCode ? `@${e.key}` : e.key;
            const newValue = value.substring(0, start) + insertion + value.substring(start);

            // Bloqueo solo cuando el comando no aporta NADA al estado actual
            // (todos los lados que tocaría ya están rellenos). Esto permite, por
            // ejemplo, teclear @4 dos veces: la primera rellena 1 corto + 1 largo
            // y la segunda rellena el corto y largo restantes — antes la segunda
            // pulsación se bloqueaba, dejando los otros dos lados sin tocar.
            if (isNewCode) {
                const before = parseEdgeCommand(value);
                const after  = parseEdgeCommand(newValue);
                const noChange = (['top', 'bottom', 'left', 'right'] as const)
                    .every(s => before[s] === after[s]);
                if (noChange) return;
            }

            applyValue(newValue);
        } else if (e.key === 'Enter') {
            // ENTER en CANTOS: si la celda está vacía Y la fila superior tiene
            // cantos definidos, copiar de arriba (no crear fila). Si NO hay
            // nada que copiar y es la última fila, crear nueva fila.
            const isEmpty = !localValue || localValue.trim() === '';
            const hasPrev = !!previousValue && previousValue.trim() !== '';
            if (isEmpty && hasPrev) {
                e.preventDefault();
                applyValue(previousValue!);
                handleSync(previousValue!);
                return;
            }
            handleSync(localValue);
            if (isLast) {
                e.preventDefault();
                onAddRow();
            }
        } else if (e.key === 'Tab' && isLast && !e.shiftKey) {
            handleSync(localValue);
            e.preventDefault();
            onAddRow();
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
    validMaterials,
    previousPiece,
    isSelected = false,
    onSelect,
}: {
    piece: Piece,
    onUpdate: (id: string, updates: Partial<Piece>) => void,
    onRemove: (id: string) => void,
    onAddRow: () => void,
    isLast: boolean,
    shouldFocusQuantity: boolean,
    rowIndex: number,
    validMaterials: { id: string, label: string, w: number, h: number, number?: number, name: string }[],
    /** Pieza de la fila inmediata superior. Permite copiar valores con ENTER
     *  cuando una celda está vacía — flujo "duplicar fila por columna". */
    previousPiece?: Piece,
    /** True cuando la fila está dentro del set de selección activo. Resalta
     *  la fila visualmente y muestra el checkbox marcado. */
    isSelected?: boolean,
    /** Callback al clickear el checkbox/celda de selección. Recibe el evento
     *  para detectar Ctrl/Shift y soportar selección múltiple/de rango. */
    onSelect?: (id: string, e: React.MouseEvent) => void,
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
    // Si la fila está seleccionada, fondo distintivo. El hover sigue siendo
    // verde claro pero el bg "estable" es un tinte azul.
    const rowBg = isSelected ? '#dbeafe' : (isEven ? '#ffffff' : '#f0f5f4');

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
                        title="Habilitar/deshabilitar pieza"
                    />
                </div>
            </td>
            <td
                className={`p-0 m-0 border-b border-r border-[#d3dcdb]/30 text-center font-normal w-12 cursor-pointer select-none ${isSelected ? 'bg-[#4A90E2]/20 text-[#1c3547] font-bold' : 'text-slate-400 bg-slate-50/10'}`}
                style={{ height: '18px', maxHeight: '18px', lineHeight: '13px', fontSize: '12px' }}
                onClick={(e) => onSelect?.(piece.id, e)}
                title="Click para seleccionar (Ctrl/Cmd=múltiple, Shift=rango)"
            >
                {piece.code}
            </td>
            <td className="p-0 m-0 border-b border-r border-[#d3dcdb]/30" style={{ height: '18px', maxHeight: '18px' }}>
                <CommandInput
                    inputRef={quantityRef}
                    initialValue={piece.quantity}
                    previousValue={previousPiece?.quantity}
                    onSync={(val) => onUpdate(piece.id, { quantity: Number(val) })}
                    type="number"
                    hasError={errors.quantity}
                    className="text-center text-slate-700 dark:text-slate-300"
                />
            </td>
            <td className="p-0 m-0 border-b border-r border-[#d3dcdb]/30" style={{ height: '18px', maxHeight: '18px' }}>
                <CommandInput
                    initialValue={piece.height}
                    previousValue={previousPiece?.height}
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
                    previousValue={previousPiece?.width}
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
                    previousValue={previousPiece?.material}
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
                    previousValue={previousPiece?.comment?.split('|')[0]}
                />
            </td>
            <td className="p-0 m-0 border-b border-r border-[#d3dcdb]/30" style={{ height: '15px' }}>
                <CommandInput
                    initialValue={piece.comment?.split('|')[1] || ''}
                    previousValue={previousPiece?.comment?.split('|')[1]}
                    onSync={(val) => onUpdate(piece.id, {
                        comment: (piece.comment?.split('|')[0] || '') + '|' + val
                    })}
                    placeholder="..."
                    className="text-left px-1 italic text-slate-400 dark:text-slate-500 text-[11px]"
                    onAddRowOnTab={isLast ? validateAndAdd : undefined}
                    onAddRowOnEnter={isLast ? validateAndAdd : undefined}
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

    // Selección múltiple de filas. Soporta click + Ctrl (toggle) + Shift (rango).
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastClickedRow, setLastClickedRow] = useState<string | null>(null);
    // Portapapeles interno — almacena pieces clonadas (sin mutar las originales).
    const clipboardRef = useRef<Piece[]>([]);
    // Sort cíclico por columna (asc → desc → none).
    const [sortKey, setSortKey] = useState<{ field: 'width' | 'height'; dir: 'asc' | 'desc' } | null>(null);
    // Dropdown "Opciones".
    const [showOptions, setShowOptions] = useState(false);
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

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
        setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, [setPieces]);

    /** Genera un ID único para una pieza pegada — IMPORTANTE: si reusáramos
     *  el id original, Supabase lanzaría error de PK duplicada al guardar. */
    const newPieceId = (suffix?: string | number) =>
        `p-${Date.now()}-${suffix ?? Math.random().toString(36).slice(2, 7)}`;

    const handleCopySelected = useCallback(() => {
        if (selectedIds.size === 0) return;
        const ordered = pieces.filter(p => selectedIds.has(p.id));
        clipboardRef.current = ordered.map(p => JSON.parse(JSON.stringify(p)));
    }, [pieces, selectedIds]);

    const handlePaste = useCallback(() => {
        if (clipboardRef.current.length === 0) return;
        // Genera IDs nuevos. Inserta justo después de la última fila seleccionada
        // (si hay selección) o al final.
        const cloned = clipboardRef.current.map((p, i) => ({
            ...JSON.parse(JSON.stringify(p)),
            id: newPieceId(i),
        }));
        setPieces(prev => {
            if (selectedIds.size === 0) {
                return [...prev, ...cloned];
            }
            const lastSelectedIdx = Math.max(...prev
                .map((p, idx) => selectedIds.has(p.id) ? idx : -1)
                .filter(i => i >= 0));
            if (lastSelectedIdx < 0) return [...prev, ...cloned];
            const next = [...prev];
            next.splice(lastSelectedIdx + 1, 0, ...cloned);
            return next;
        });
    }, [setPieces, selectedIds]);

    const handleDeleteSelected = useCallback(() => {
        if (selectedIds.size === 0) return;
        setPieces(prev => prev.filter(p => !selectedIds.has(p.id)));
        setSelectedIds(new Set());
        setShowOptions(false);
    }, [setPieces, selectedIds]);

    const handleDeleteAll = useCallback(() => {
        setPieces([]);
        setSelectedIds(new Set());
        setShowDeleteAllConfirm(false);
        setShowOptions(false);
    }, [setPieces]);

    /** Click sobre la celda de selección — soporta Ctrl (toggle) y Shift (rango). */
    const handleSelectRow = useCallback((id: string, e: React.MouseEvent) => {
        if (e.shiftKey && lastClickedRow) {
            const idxA = pieces.findIndex(p => p.id === lastClickedRow);
            const idxB = pieces.findIndex(p => p.id === id);
            if (idxA >= 0 && idxB >= 0) {
                const [from, to] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
                setSelectedIds(prev => {
                    const n = new Set(prev);
                    for (let i = from; i <= to; i++) n.add(pieces[i].id);
                    return n;
                });
                return;
            }
        }
        if (e.ctrlKey || e.metaKey) {
            setSelectedIds(prev => {
                const n = new Set(prev);
                if (n.has(id)) n.delete(id); else n.add(id);
                return n;
            });
        } else {
            setSelectedIds(prev => {
                if (prev.has(id) && prev.size === 1) return new Set();
                return new Set([id]);
            });
        }
        setLastClickedRow(id);
    }, [pieces, lastClickedRow]);

    // Atajos globales Ctrl+C / Ctrl+V (cuando el foco no está en un input).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            const inField = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
            if (inField) return;
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === 'c' || e.key === 'C') {
                if (selectedIds.size === 0) return;
                e.preventDefault();
                handleCopySelected();
            } else if (e.key === 'v' || e.key === 'V') {
                if (clipboardRef.current.length === 0) return;
                e.preventDefault();
                handlePaste();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedIds, handleCopySelected, handlePaste]);

    // Pieces ordenadas según sortKey. NO muta el array fuente — el orden de
    // IDs originales se preserva intacto. La vista solo refleja una versión
    // ordenada para visualización.
    const displayedPieces = useMemo(() => {
        if (!sortKey) return pieces;
        const sorted = [...pieces].sort((a, b) => {
            const va = a[sortKey.field] || 0;
            const vb = b[sortKey.field] || 0;
            return sortKey.dir === 'asc' ? va - vb : vb - va;
        });
        return sorted;
    }, [pieces, sortKey]);

    /** Sort cíclico: asc → desc → none. */
    const cycleSort = (field: 'width' | 'height') => {
        setSortKey(prev => {
            if (!prev || prev.field !== field) return { field, dir: 'asc' };
            if (prev.dir === 'asc') return { field, dir: 'desc' };
            return null;
        });
    };

    const sortIcon = (field: 'width' | 'height') => {
        if (!sortKey || sortKey.field !== field) return 'unfold_more';
        return sortKey.dir === 'asc' ? 'arrow_upward' : 'arrow_downward';
    };

    return (
        <div className="flex flex-col h-auto bg-white">
            <div className="relative">
                <table className="w-full border-collapse border-spacing-0 table-fixed">
                    <thead className="sticky top-0 z-30 bg-[#f0f5f4] text-[#366480] font-bold uppercase tracking-wider" style={{ fontSize: '11px', lineHeight: '11px' }}>
                        <tr style={{ height: '18px', maxHeight: '18px' }}>
                            <th className="p-0 border-b border-r border-l border-[#d3dcdb]/30 w-8 text-center bg-[#f0f5f4]" style={{ height: '18px' }}>M</th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-12 text-center bg-[#f0f5f4]" style={{ height: '18px' }}>
                                <div className="flex items-center justify-center gap-1">
                                    {/* Checkbox master en encabezado de CÓD: selecciona/deselecciona
                                        todas las filas. Click en CÓD de cada fila también selecciona. */}
                                    <input
                                        type="checkbox"
                                        checked={pieces.length > 0 && pieces.every(p => selectedIds.has(p.id))}
                                        ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < pieces.length; }}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedIds(new Set(pieces.map(p => p.id)));
                                            else setSelectedIds(new Set());
                                        }}
                                        className="w-3 h-3 cursor-pointer m-0 p-0"
                                        onClick={(e) => e.stopPropagation()}
                                        title="Seleccionar todo"
                                    />
                                    <span>CÓD.</span>
                                </div>
                            </th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-16 text-center bg-[#f0f5f4]" style={{ height: '18px' }}>CANT.</th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-20 text-center bg-[#f0f5f4]" style={{ height: '18px' }}>
                                <button
                                    onClick={() => cycleSort('height')}
                                    className="w-full h-full flex items-center justify-center gap-0.5 hover:bg-white/60 transition-colors"
                                    title="Ordenar Ancho"
                                >
                                    ANCHO
                                    <span className={`material-icons-round text-[12px] ${sortKey?.field === 'height' ? 'text-[#4A90E2]' : 'text-slate-400'}`}>{sortIcon('height')}</span>
                                </button>
                            </th>
                            <th className="p-0 border-b border-r border-[#d3dcdb]/30 w-20 text-center bg-[#f0f5f4]" style={{ height: '18px' }}>
                                <button
                                    onClick={() => cycleSort('width')}
                                    className="w-full h-full flex items-center justify-center gap-0.5 hover:bg-white/60 transition-colors"
                                    title="Ordenar Largo"
                                >
                                    LARGO
                                    <span className={`material-icons-round text-[12px] ${sortKey?.field === 'width' ? 'text-[#4A90E2]' : 'text-slate-400'}`}>{sortIcon('width')}</span>
                                </button>
                            </th>
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
                        {displayedPieces.map((piece, index) => (
                            <CommandRow
                                key={piece.id}
                                piece={piece}
                                previousPiece={index > 0 ? displayedPieces[index - 1] : undefined}
                                onUpdate={handleUpdatePiece}
                                onRemove={handleRemovePiece}
                                onAddRow={handleAddRow}
                                isLast={index === displayedPieces.length - 1}
                                shouldFocusQuantity={piece.id === lastAddedId}
                                rowIndex={index}
                                validMaterials={validMaterials}
                                isSelected={selectedIds.has(piece.id)}
                                onSelect={handleSelectRow}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-1 border-t dark:border-slate-800 bg-slate-50/50 dark:bg-transparent flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
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

                    {/* Dropdown OPCIONES — copiar / pegar / borrado inteligente. */}
                    <div className="relative">
                        <button
                            onClick={() => setShowOptions(s => !s)}
                            disabled={isLocked}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-[6px] text-[10px] font-[800] transition-all active:scale-95 shadow-sm uppercase tracking-wider border ${
                                isLocked
                                ? 'bg-[#f0f5f4] text-[#366480]/30 border-transparent cursor-not-allowed'
                                : 'bg-white text-[#366480] border-[#d3dcdb]/40 hover:bg-[#f0f5f4]'
                            }`}
                        >
                            <span className="material-icons-round text-xs">tune</span>
                            Opciones
                            <span className="material-icons-round text-xs">expand_more</span>
                        </button>
                        {showOptions && !isLocked && (
                            <>
                                {/* Backdrop transparente para cerrar al click-out */}
                                <div className="fixed inset-0 z-[200]" onClick={() => setShowOptions(false)} />
                                <div className="absolute left-0 bottom-full mb-1 z-[201] bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-white/60 min-w-[220px] p-1.5 flex flex-col gap-0.5">
                                    <button
                                        onClick={() => { handleCopySelected(); setShowOptions(false); }}
                                        disabled={selectedIds.size === 0}
                                        className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-bold text-[#1c3547] hover:bg-[#f0f5f4] disabled:opacity-30 disabled:cursor-not-allowed text-left"
                                    >
                                        <span className="flex items-center gap-2">
                                            <span className="material-icons-round text-[14px] text-[#4A90E2]">content_copy</span>
                                            Copiar selección
                                        </span>
                                        <kbd className="text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded">Ctrl+C</kbd>
                                    </button>
                                    <button
                                        onClick={() => { handlePaste(); setShowOptions(false); }}
                                        disabled={clipboardRef.current.length === 0}
                                        className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-bold text-[#1c3547] hover:bg-[#f0f5f4] disabled:opacity-30 disabled:cursor-not-allowed text-left"
                                    >
                                        <span className="flex items-center gap-2">
                                            <span className="material-icons-round text-[14px] text-[#4A90E2]">content_paste</span>
                                            Pegar
                                        </span>
                                        <kbd className="text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded">Ctrl+V</kbd>
                                    </button>
                                    <div className="h-px bg-slate-200 my-0.5" />
                                    {selectedIds.size > 0 ? (
                                        <button
                                            onClick={handleDeleteSelected}
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 text-left"
                                        >
                                            <span className="material-icons-round text-[14px]">delete</span>
                                            Borrar selección ({selectedIds.size})
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setShowDeleteAllConfirm(true); setShowOptions(false); }}
                                            disabled={pieces.length === 0}
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed text-left"
                                        >
                                            <span className="material-icons-round text-[14px]">delete_sweep</span>
                                            Borrar TODO
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {selectedIds.size > 0 && (
                        <span className="text-[10px] font-bold text-[#4A90E2] ml-1">
                            {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                <div className="flex gap-4 text-[9px] font-[800] text-[#366480]/50 uppercase tracking-[0.1em] overflow-hidden pr-2">
                    <span className="flex items-center gap-1.5 shrink-0"><div className="w-2 h-2 rounded-full bg-[#fb7185]"></div> Delgado</span>
                    <span className="flex items-center gap-1.5 shrink-0"><div className="w-2 h-2 rounded-full bg-[#4A90E2]"></div> Grueso</span>
                </div>
            </div>

            {/* Modal de confirmación de borrado total — usa createPortal y la
                misma paleta translúcida que los demás modals (Nueva Venta). */}
            {showDeleteAllConfirm && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-white/40 backdrop-blur-[16px] animate-premium-fade"
                    style={{ width: '100vw', height: '100vh' }}
                    onClick={() => setShowDeleteAllConfirm(false)}
                >
                    <div
                        className="bg-[#f8faf9]/95 backdrop-blur-[12px] rounded-[36px] shadow-[0_40px_120px_rgba(0,0,0,0.15)] w-full max-w-md overflow-hidden border border-white/90 p-10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col gap-3 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center">
                                <span className="material-icons-round text-rose-500 text-[28px]">warning</span>
                            </div>
                            <h3 className="text-[22px] font-[900] text-[#2c3434] tracking-tight leading-tight">
                                ¿Borrar TODAS las medidas?
                            </h3>
                            <p className="text-[13px] text-[#366480]/70 leading-relaxed">
                                Vas a perder las <strong className="text-rose-600">{pieces.length}</strong> filas de la tabla.
                                Esta acción no se puede deshacer.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteAllConfirm(false)}
                                className="flex-1 px-6 py-3 bg-white border border-[#d3dcdb]/60 text-[#366480] font-[900] text-[11px] rounded-[16px] hover:bg-[#f0f5f4] transition-all uppercase tracking-[0.15em]"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeleteAll}
                                className="flex-1 px-6 py-3 bg-rose-600 text-white font-[900] text-[11px] rounded-[16px] hover:bg-rose-700 transition-all uppercase tracking-[0.15em] shadow-md"
                            >
                                Sí, borrar todo
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
