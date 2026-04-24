import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, ArrowRightLeft, Camera, Search, Filter, RefreshCw, TrendingDown } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { api } from '../services/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import type { VentaCabecera, NodrizaTesoreria } from '../services/types';

interface Deposit8059ModalProps {
    ventas: VentaCabecera[];
    movements: NodrizaTesoreria[];
    onClose: () => void;
    onSuccess: () => Promise<void>;
    onZoom: (src: string | null) => void;
    formatCurrency: (n: number | string) => string;
}

const convertToWebP = (file: File): Promise<File> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                const MAX = 1200;
                if (width > MAX || height > MAX) {
                    if (width > height) { height = (height / width) * MAX; width = MAX; }
                    else { width = (width / height) * MAX; height = MAX; }
                }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => {
                    if (blob) resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.webp', { type: 'image/webp' }));
                    else reject(new Error('Conversion error'));
                }, 'image/webp', 0.85);
            };
        };
    });

export const Deposit8059Modal: React.FC<Deposit8059ModalProps> = ({
    ventas, movements, onClose, onSuccess, onZoom, formatCurrency
}) => {
    const defaultWeekStart = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const defaultToday = format(new Date(), 'yyyy-MM-dd');

    // All state is LOCAL — completely isolated from parent re-renders
    const [numOp, setNumOp] = useState('');
    const [voucherFile, setVoucherFile] = useState<File | null>(null);
    const [voucherPreview, setVoucherPreview] = useState<string | null>(null);
    const [showError, setShowError] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);

    useScrollLock(true);

    // Filter state — also local
    const [modalStartDate, setModalStartDate] = useState(defaultWeekStart);
    const [modalEndDate, setModalEndDate] = useState(defaultToday);
    const [tempStart, setTempStart] = useState(defaultWeekStart);
    const [tempEnd, setTempEnd] = useState(defaultToday);
    const [quickFilter, setQuickFilter] = useState<'PERSONALIZADO' | 'HOY' | 'ESTA_SEMANA' | 'MES_ACTUAL'>('ESTA_SEMANA');
    const [filterMode, setFilterMode] = useState<'RANGE' | 'DAY'>('RANGE');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Listen for paste events (Ctrl+V)
    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        try {
                            const webp = await convertToWebP(file);
                            setVoucherFile(webp);
                            setVoucherPreview(URL.createObjectURL(webp));
                        } catch {
                            setVoucherFile(file);
                            setVoucherPreview(URL.createObjectURL(file));
                        }
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const webp = await convertToWebP(file);
            setVoucherFile(webp);
            setVoucherPreview(URL.createObjectURL(webp));
        } catch {
            setVoucherFile(file);
            setVoucherPreview(URL.createObjectURL(file));
        }
    };

    // O(N) single-pass balance map (isolated from parent's balances)
    const balancesMap = useMemo(() => {
        const global: Record<string, number> = {};
        const perSale: Record<string, Record<string, number>> = {};
        movements.forEach(m => {
            const amount = Number(m.monto);
            const refId = m.referencia_id;
            if (m.tipo_movimiento === 'INGRESO' || m.tipo_movimiento === 'TRANSFERENCIA') {
                const dest = m.cuenta_destino;
                if (dest) {
                    global[dest] = (global[dest] || 0) + amount;
                    if (refId) { if (!perSale[refId]) perSale[refId] = {}; perSale[refId][dest] = (perSale[refId][dest] || 0) + amount; }
                }
            }
            if (m.tipo_movimiento === 'EGRESO' || m.tipo_movimiento === 'TRANSFERENCIA') {
                const orig = m.cuenta_origen;
                if (orig) {
                    global[orig] = (global[orig] || 0) - amount;
                    if (refId) { if (!perSale[refId]) perSale[refId] = {}; perSale[refId][orig] = (perSale[refId][orig] || 0) - amount; }
                }
            }
        });
        return { global, perSale };
    }, [movements]);

    const getGlobal = (acc: string) => balancesMap.global[acc] || 0;
    const getSaleFunds = (id: string, acc: string) => balancesMap.perSale[id]?.[acc] || 0;

    // Pre-computed sales list — only recalculates when data or filters change, NOT on keystroke
    const salesList = useMemo(() => {
        const globalBal = getGlobal('Efectivo');
        const withFunds = ventas.filter(v => getSaleFunds(v.id, 'Efectivo') > 0);
        const totalFunds = withFunds.reduce((acc, v) => acc + getSaleFunds(v.id, 'Efectivo'), 0);
        const factor = (totalFunds > globalBal && globalBal > 0) ? (globalBal / totalFunds) : (totalFunds > globalBal && globalBal <= 0 ? 0 : 1);
        return withFunds
            .filter(v => {
                const f = new Date(v.created_at);
                return (!modalStartDate || f >= new Date(modalStartDate)) && (!modalEndDate || f <= new Date(modalEndDate + 'T23:59:59'));
            })
            .map(v => ({ ...v, saldoReal: getSaleFunds(v.id, 'Efectivo') * factor, factor }));
    }, [ventas, balancesMap, modalStartDate, modalEndDate]);

    const totalSelected = Object.values(selectedItems).reduce((a, b) => a + Number(b), 0);
    const globalEfectivo = getGlobal('Efectivo');

    const handleApplyQuickFilter = (val: string) => {
        setQuickFilter(val as any);
        if (val !== 'PERSONALIZADO') {
            const now = new Date();
            let start = format(now, 'yyyy-MM-dd');
            let end = format(now, 'yyyy-MM-dd');
            if (val === 'ESTA_SEMANA') { start = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'); }
            else if (val === 'MES_ACTUAL') { start = format(startOfMonth(now), 'yyyy-MM-dd'); end = format(endOfMonth(now), 'yyyy-MM-dd'); }
            setTempStart(start); setTempEnd(end); setModalStartDate(start); setModalEndDate(end);
        }
    };

    const handleConfirm = async () => {
        if (!numOp || !voucherFile) { setShowError(true); return; }
        const entries = Object.entries(selectedItems).filter(([_, qty]) => qty > 0);
        if (entries.length === 0 || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const uploadedVoucherUrl = await api.uploadVoucher(voucherFile, `DEPOSIT_8059`);
            for (const [ventaId, amount] of entries) {
                const v = ventas.find(v => v.id === ventaId);
                await api.createTesoreriaMovement({
                    monto: amount,
                    tipo_movimiento: 'TRANSFERENCIA',
                    cuenta_origen: 'Efectivo',
                    cuenta_destino: '8059',
                    categoria: 'Depósito a 8059',
                    referencia_id: ventaId,
                    numero_operacion: numOp,
                    voucher_url: uploadedVoucherUrl,
                    observaciones: `Depósito directo a 8059${v ? ` (Ref: ${v.codigo_cotizacion || v.id.slice(0, 8)})` : ''} - Op: ${numOp}`
                });
            }
            await onSuccess();
            onClose();
        } catch {
            alert('Error al realizar el depósito.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden animate-in fade-in duration-300" style={{ backdropFilter: 'blur(6px)' }}>
            <div className="bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-6xl flex flex-col h-[90vh] border border-white/50 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>
                
                <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40 shrink-0">
                    <div className="flex items-center gap-4">
                        <TrendingDown className="w-8 h-8 text-[#4A90E2] drop-shadow-sm" />
                        <div className="flex items-center gap-4">
                            <h2 className="text-2xl font-black text-[#2c3434] uppercase tracking-tight">Depósito a 8059</h2>
                            <div className="flex items-center gap-2.5 bg-white px-3 py-1.5 rounded-xl border border-[#d3dcdb]/30 shadow-sm">
                                <span className="px-3 py-1 bg-[#f0f5f4] text-[#366480] text-[9px] font-black rounded-lg border border-[#d3dcdb]/30 uppercase tracking-widest leading-none">EFECTIVO</span>
                                <ArrowRightLeft className="w-3 h-3 text-[#8b9ba5]" />
                                <span className="px-3 py-1 bg-[#dcfce7] text-[#166534] text-[9px] font-black rounded-lg border border-[#bbf7d0] uppercase tracking-widest leading-none">CUENTA 8059</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all z-20">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="px-12 py-8 flex flex-col gap-6 shrink-0 bg-white/20">
                    <div className="flex items-center gap-4 w-full bg-white dark:bg-slate-900 p-3 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-lg overflow-hidden">
                        {/* Filters */}
                        <div className="flex items-center gap-2 bg-slate-50/80 dark:bg-slate-800/50 p-2 rounded-[1.2rem] border border-slate-100/50 shrink-0">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-[0.1em] px-1 italic">Rango</span>
                                <select value={quickFilter} onChange={(e) => handleApplyQuickFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg text-[9px] font-black outline-none w-28 uppercase cursor-pointer">
                                    <option value="PERSONALIZADO">Personalizado</option>
                                    <option value="HOY">Hoy</option>
                                    <option value="ESTA_SEMANA">Semana</option>
                                    <option value="MES_ACTUAL">Mes</option>
                                </select>
                            </div>
                            <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />
                            <div className="flex flex-col items-center">
                                <div className={`flex p-0.5 bg-slate-100 dark:bg-slate-900 rounded-lg border h-6 mb-1 transition-all ${quickFilter !== 'PERSONALIZADO' ? 'opacity-40 pointer-events-none' : ''}`}>
                                    <button onClick={() => setFilterMode('RANGE')} className={`px-2 text-[7px] font-black uppercase rounded-md ${filterMode === 'RANGE' ? 'bg-white dark:bg-slate-700 text-emerald-600' : 'text-slate-400'}`}>Rango</button>
                                    <button onClick={() => { setFilterMode('DAY'); setTempEnd(tempStart); }} className={`px-2 text-[7px] font-black uppercase rounded-md ${filterMode === 'DAY' ? 'bg-white dark:bg-slate-700 text-emerald-600' : 'text-slate-400'}`}>Día</button>
                                </div>
                                <div className="flex items-center gap-1">
                                    <input type="date" value={tempStart} onChange={(e) => { setTempStart(e.target.value); if (filterMode === 'DAY') setTempEnd(e.target.value); }} disabled={quickFilter !== 'PERSONALIZADO'} className={`bg-white dark:bg-slate-900 border border-slate-200 px-2 py-1 rounded-lg text-[9px] font-black w-24 ${quickFilter !== 'PERSONALIZADO' ? 'opacity-50' : ''}`} />
                                    {filterMode === 'RANGE' && <input type="date" value={tempEnd} onChange={(e) => setTempEnd(e.target.value)} disabled={quickFilter !== 'PERSONALIZADO'} className={`bg-white dark:bg-slate-900 border border-slate-200 px-2 py-1 rounded-lg text-[9px] font-black w-24 ${quickFilter !== 'PERSONALIZADO' ? 'opacity-50' : ''}`} />}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 ml-1">
                                <button onClick={() => { setModalStartDate(tempStart); setModalEndDate(tempEnd); }} disabled={quickFilter !== 'PERSONALIZADO'} className={`p-2 rounded-lg border shadow-sm transition-all ${quickFilter !== 'PERSONALIZADO' ? 'opacity-50' : (tempStart !== modalStartDate || tempEnd !== modalEndDate) ? 'bg-emerald-600 text-white animate-pulse' : 'bg-white text-slate-400'}`}><Filter className="w-3.5 h-3.5" /></button>
                                <button onClick={() => { setModalStartDate(''); setModalEndDate(''); setTempStart(''); setTempEnd(''); setQuickFilter('PERSONALIZADO'); }} className="p-2 bg-slate-100 rounded-lg hover:text-rose-500 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
                            </div>
                        </div>

                        <div className="h-10 w-px bg-slate-100 dark:bg-slate-800 shrink-0 mx-0.5" />

                        {/* Voucher + NumOp */}
                        <div className="flex items-center gap-3 shrink-0">
                            <div
                                onClick={() => { if (voucherPreview) { onZoom(voucherPreview); } else { fileInputRef.current?.click(); } }}
                                className={`w-32 h-10 border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer bg-slate-50 dark:bg-slate-800/20 group overflow-hidden transition-all ${showError && !voucherFile ? 'border-rose-400' : 'border-slate-100 hover:border-emerald-400'}`}
                                title={voucherPreview ? 'Click para ampliar' : 'Adjuntar váucher'}
                            >
                                {voucherPreview ? (
                                    <div className="relative w-full h-full">
                                        <img src={voucherPreview} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><Search className="w-4 h-4 text-white" /></div>
                                        <button onClick={(e) => { e.stopPropagation(); setVoucherFile(null); setVoucherPreview(null); }} className="absolute top-0.5 right-0.5 p-1 bg-rose-500 text-white rounded-full shadow-lg hover:scale-110 transition-all z-20"><X className="w-2.5 h-2.5" /></button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Camera className={`w-4 h-4 ${showError && !voucherFile ? 'text-rose-400' : 'text-slate-300'}`} />
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Adjuntar</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[7.5px] font-black text-slate-400 uppercase italic pl-1">Op:</span>
                                {/* Input is LOCAL to this component — no parent re-render on keystroke */}
                                <input
                                    type="text"
                                    placeholder="N° XXXX"
                                    value={numOp}
                                    onChange={(e) => { setNumOp(e.target.value.toUpperCase()); setShowError(false); }}
                                    className={`w-24 h-10 bg-slate-50 dark:bg-slate-800/20 border-2 rounded-xl px-2 font-black text-center text-[10px] outline-none ${showError && !numOp ? 'border-rose-400 text-rose-600' : 'border-slate-100 focus:border-emerald-400'}`}
                                />
                            </div>
                        </div>

                        <div className="h-10 w-px bg-slate-100 dark:bg-slate-800 shrink-0 mx-0.5" />

                        {/* Total + CTA */}
                        <div className="flex-1 flex items-center justify-end gap-4 px-1">
                            <div className="flex flex-col items-end">
                                <p className="text-[8px] font-black text-emerald-500 uppercase mb-0.5">TOTAL</p>
                                <div className="flex items-baseline gap-0.5 text-emerald-600 dark:text-emerald-400">
                                    <span className="text-sm font-black">S/</span>
                                    <span className="text-xl font-black tabular-nums leading-none">{formatCurrency(totalSelected)}</span>
                                </div>
                            </div>
                            <button
                                onClick={handleConfirm}
                                disabled={isSubmitting || Object.keys(selectedItems).length === 0 || totalSelected > globalEfectivo}
                                className="h-12 px-5 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase shadow-lg hover:bg-emerald-700 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-30 border-b-2 border-emerald-800"
                            >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>{isSubmitting ? 'PROCESANDO...' : 'DEPOSITAR'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sales table */}
                <div className="flex-1 overflow-y-auto px-12 pt-8 custom-scrollbar mb-8">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 border-b border-slate-100 dark:border-slate-800">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="py-6 px-4">Selección</th>
                                <th className="py-6 px-4">Venta</th>
                                <th className="py-6 px-4">Fecha</th>
                                <th className="py-6 px-4">Ef. Disponible</th>
                                <th className="py-6 px-4 text-right">Monto a Depositar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {salesList.map(v => {
                                const isSelected = selectedItems[v.id] !== undefined;
                                return (
                                    <tr key={v.id} className={`${isSelected ? 'bg-emerald-50/20' : 'hover:bg-slate-50/50'} transition-all`}>
                                        <td className="py-6 px-4 text-center">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => {
                                                    const next = { ...selectedItems };
                                                    if (isSelected) delete next[v.id];
                                                    else next[v.id] = Number(v.saldoReal.toFixed(2));
                                                    setSelectedItems(next);
                                                }}
                                                className="w-6 h-6 rounded-xl border-2 border-slate-200 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="py-6 px-4">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tighter italic">#{v.codigo_cotizacion || v.id.slice(0, 8)}</span>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{v.cliente_nombre?.slice(0, 20)}...</span>
                                            </div>
                                        </td>
                                        <td className="py-6 px-4 text-[10px] font-bold text-slate-400 tabular-nums">{v.created_at.split('T')[0]}</td>
                                        <td className="py-6 px-4">
                                            <div className="flex flex-col">
                                                <span className="text-[12px] font-black text-slate-600 dark:text-slate-400 tabular-nums">S/ {v.saldoReal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                                                {v.factor < 1 && <span className="text-[7px] font-black text-amber-500 uppercase italic">REAJUSTADO</span>}
                                            </div>
                                        </td>
                                        <td className="py-6 px-4 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <span className="text-[10px] font-black text-slate-300 opacity-50">S/</span>
                                                <input
                                                    type="text"
                                                    value={selectedItems[v.id] || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/[^0-9.]/g, '');
                                                        const num = Number(val);
                                                        if (num <= (v.saldoReal + 0.01)) setSelectedItems({ ...selectedItems, [v.id]: num });
                                                    }}
                                                    placeholder="0.00"
                                                    className="w-32 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 p-4 rounded-2xl text-[14px] font-black text-right outline-none focus:border-emerald-500 tabular-nums shadow-sm transition-all text-emerald-600 dark:text-emerald-400"
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </div>
        </div>
    );
};
