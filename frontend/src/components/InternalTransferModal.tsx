import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    X, ArrowRightLeft, Camera, Filter, RefreshCw, TrendingDown
} from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { api } from '../services/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import type { VentaCabecera, NodrizaTesoreria } from '../services/types';

const BANK_ACCOUNTS = ['2049/YAPE', '4071', '9001', '8059'];
const ALL_ACCOUNTS = ['Efectivo', ...BANK_ACCOUNTS];

interface InternalTransferModalProps {
    ventas: VentaCabecera[];
    movements: NodrizaTesoreria[];
    onClose: () => void;
    onSuccess: () => Promise<void>;
    onZoom: (src: string) => void;
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

export const InternalTransferModal: React.FC<InternalTransferModalProps> = ({
    ventas, movements, onClose, onSuccess, formatCurrency
}) => {
    const defaultWeekStart = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const defaultToday = format(new Date(), 'yyyy-MM-dd');

    // --- ALL state is LOCAL — completely isolated from parent ---
    const [numOp, setNumOp] = useState('');
    const [voucherFile, setVoucherFile] = useState<File | null>(null);
    const [voucherPreview, setVoucherPreview] = useState<string | null>(null);
    const [showError, setShowError] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
    const [motivo, setMotivo] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    useScrollLock(true);

    const [transferData, setTransferData] = useState({ origen: 'Efectivo', destino: '2049/YAPE' });

    // Filter state
    const [modalStartDate, setModalStartDate] = useState(defaultWeekStart);
    const [modalEndDate, setModalEndDate] = useState(defaultToday);
    const [tempStart, setTempStart] = useState(defaultWeekStart);
    const [tempEnd, setTempEnd] = useState(defaultToday);
    const [quickFilter, setQuickFilter] = useState<'PERSONALIZADO' | 'HOY' | 'ESTA_SEMANA' | 'MES_ACTUAL'>('ESTA_SEMANA');
    const [filterMode, setFilterMode] = useState<'RANGE' | 'DAY'>('RANGE');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Paste handler for voucher
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
                            setVoucherFile(webp); setVoucherPreview(URL.createObjectURL(webp));
                        } catch {
                            setVoucherFile(file); setVoucherPreview(URL.createObjectURL(file));
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
            setVoucherFile(webp); setVoucherPreview(URL.createObjectURL(webp));
        } catch {
            setVoucherFile(file); setVoucherPreview(URL.createObjectURL(file));
        }
    };

    // O(1) balance map — isolated from parent
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

    const salesList = useMemo(() => {
        const globalBal = getGlobal(transferData.origen);
        const withFunds = ventas.filter(v => getSaleFunds(v.id, transferData.origen) > 0);
        const totalFunds = withFunds.reduce((acc, v) => acc + getSaleFunds(v.id, transferData.origen), 0);
        const factor = (totalFunds > globalBal && globalBal > 0) ? (globalBal / totalFunds) : (totalFunds > globalBal && globalBal <= 0 ? 0 : 1);
        return withFunds
            .filter(v => {
                const f = new Date(v.created_at);
                return (!modalStartDate || f >= new Date(modalStartDate)) && (!modalEndDate || f <= new Date(modalEndDate + 'T23:59:59'));
            })
            .map(v => {
                const rawSaldo = getSaleFunds(v.id, transferData.origen);
                const saldoReal = rawSaldo * factor;
                const lastOp = transferData.origen !== 'Efectivo'
                    ? movements.find(m => m.referencia_id === v.id && m.cuenta_destino === transferData.origen)?.observaciones?.match(/Op: (\w+)/)?.[1]
                    : null;
                return { ...v, rawSaldo, saldoReal, factor, lastOp };
            });
    }, [ventas, balancesMap, modalStartDate, modalEndDate, transferData.origen, movements]);

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

    const totalSelected = Object.values(selectedItems).reduce((a, b) => a + b, 0);
    const globalBalOrigen = getGlobal(transferData.origen);

    const isVoucherMandatory = BANK_ACCOUNTS.includes(transferData.destino) || (BANK_ACCOUNTS.includes(transferData.origen) && BANK_ACCOUNTS.includes(transferData.destino));
    const isMotivoMandatory = (transferData.origen === 'Efectivo' || transferData.origen === '8059') && 
                              ['2049/YAPE', '4071', '9001'].includes(transferData.destino);

    const handleConfirm = async () => {
        const entries = Object.entries(selectedItems).filter(([_, qty]) => qty > 0);
        if (entries.length === 0 || isSubmitting) return;
        
        // Validation for mandatory fields
        if (isVoucherMandatory && (!numOp || !voucherFile)) { setShowError(true); return; }
        if (isMotivoMandatory && !motivo.trim()) { setShowError(true); return; }
        
        setIsSubmitting(true);
        try {
            let uploadedVoucherUrl: string | null = null;
            if (voucherFile) uploadedVoucherUrl = await api.uploadVoucher(voucherFile, `TRANSFER_${transferData.origen}_TO_${transferData.destino}`);
            for (const [ventaId, amount] of entries) {
                const v = ventas.find(v => v.id === ventaId);
                await api.createTesoreriaMovement({
                    monto: amount,
                    tipo_movimiento: 'TRANSFERENCIA',
                    cuenta_origen: transferData.origen,
                    cuenta_destino: transferData.destino,
                    categoria: 'Transferencia Interna',
                    referencia_id: ventaId,
                    numero_operacion: numOp || null,
                    voucher_url: uploadedVoucherUrl,
                    observaciones: `De ${transferData.origen} a ${transferData.destino}${v ? ` (Ref: ${v.codigo_cotizacion || v.id.slice(0, 8)})` : ''}${motivo ? ` - MOTIVO: ${motivo.toUpperCase()}` : ''}${numOp ? ` - Op: ${numOp}` : ''}`
                });
            }
            await onSuccess();
            handleClose();
        } catch {
            alert('Error al realizar la transferencia.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalSaleFunds = ventas.reduce((acc, v) => acc + getSaleFunds(v.id, transferData.origen), 0);
    const showAdjustmentWarning = totalSaleFunds > globalBalOrigen && globalBalOrigen >= 0;

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
        }, 300);
    };

    return (
        <div className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden ${isClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`} style={{ backdropFilter: 'blur(6px)' }}>
            <div className={`bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-7xl border border-white/50 flex flex-col max-h-[95vh] relative overflow-hidden ${isClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                {/* ── Header ─────────────────────────────────────────── */}
                <div className="sticky top-0 z-[100] bg-white/40 px-12 py-6 border-b border-[#d3dcdb]/30 shrink-0 flex justify-between items-start">
                    {/* Left: Title + Filters */}
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-4">
                            <ArrowRightLeft className="w-10 h-10 text-[#4A90E2] drop-shadow-sm" />
                            <h3 className="text-3xl font-black text-[#2c3434] uppercase tracking-tighter whitespace-nowrap">Transferencia Interna</h3>
                        </div>

                        <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800 px-6 py-4 rounded-3xl border border-slate-100/50 shadow-sm">
                            {/* Quick filter */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Rango</span>
                                <select value={quickFilter} onChange={(e) => handleApplyQuickFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl text-[11px] font-black outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300 w-44 uppercase shadow-sm cursor-pointer">
                                    <option value="PERSONALIZADO">Personalizado</option>
                                    <option value="HOY">Hoy</option>
                                    <option value="ESTA_SEMANA">Última Semana</option>
                                    <option value="MES_ACTUAL">Mes Actual</option>
                                </select>
                            </div>
                            <div className="h-14 w-px bg-slate-200 dark:bg-slate-700 mx-3" />
                            {/* Mode switch + dates */}
                            <div className="flex flex-col items-center">
                                <div className={`flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 h-9 mb-3 transition-all ${quickFilter !== 'PERSONALIZADO' ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                                    <button onClick={() => setFilterMode('RANGE')} className={`px-6 flex items-center justify-center text-[9px] font-black uppercase rounded-lg transition-all ${filterMode === 'RANGE' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-md transform scale-105' : 'text-slate-400 hover:text-slate-600'}`}>Rango</button>
                                    <button onClick={() => { setFilterMode('DAY'); setTempEnd(tempStart); }} className={`px-6 flex items-center justify-center text-[9px] font-black uppercase rounded-lg transition-all ${filterMode === 'DAY' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-md transform scale-105' : 'text-slate-400 hover:text-slate-600'}`}>Día</button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col gap-1">
                                        <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 ${quickFilter !== 'PERSONALIZADO' ? 'text-slate-300' : 'text-slate-400'}`}>{filterMode === 'RANGE' ? 'Desde' : 'Fecha'}</span>
                                        <input type="date" value={tempStart} onChange={(e) => { setTempStart(e.target.value); if (filterMode === 'DAY') setTempEnd(e.target.value); }} disabled={quickFilter !== 'PERSONALIZADO'} className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl text-[11px] font-black outline-none focus:border-indigo-500 w-44 shadow-sm ${quickFilter !== 'PERSONALIZADO' ? 'opacity-50 cursor-not-allowed' : ''}`} />
                                    </div>
                                    {filterMode === 'RANGE' && (
                                        <div className="flex flex-col gap-1">
                                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 ${quickFilter !== 'PERSONALIZADO' ? 'text-slate-300' : 'text-slate-400'}`}>Hasta</span>
                                            <input type="date" value={tempEnd} onChange={(e) => setTempEnd(e.target.value)} disabled={quickFilter !== 'PERSONALIZADO'} className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl text-[11px] font-black outline-none focus:border-indigo-500 w-44 shadow-sm ${quickFilter !== 'PERSONALIZADO' ? 'opacity-50 cursor-not-allowed' : ''}`} />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="relative mt-8 ml-2">
                                <button onClick={() => { setModalStartDate(tempStart); setModalEndDate(tempEnd); }} disabled={quickFilter !== 'PERSONALIZADO'} className={`p-4 rounded-2xl border-2 shadow-md transition-all flex items-center justify-center ${quickFilter !== 'PERSONALIZADO' ? 'bg-slate-100 border-transparent text-slate-300 opacity-50 cursor-not-allowed' : (tempStart !== modalStartDate || (filterMode === 'RANGE' && tempEnd !== modalEndDate)) ? 'bg-indigo-600 border-indigo-700 text-white animate-pulse hover:bg-indigo-700' : 'bg-white dark:bg-slate-900 border-slate-200 text-slate-400'}`}>
                                    <Filter className="w-5 h-5" />
                                </button>
                                {quickFilter === 'PERSONALIZADO' && (tempStart !== modalStartDate || (filterMode === 'RANGE' && tempEnd !== modalEndDate)) && (
                                    <span className="absolute -top-2 -right-2 flex h-4 w-4"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 border-2 border-white dark:border-slate-900" /></span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Totals + CTA */}
                    <div className="flex flex-col items-end gap-6 justify-between h-full">
                        <button onClick={handleClose} className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all z-20 self-end -mt-2 -mr-2"><X className="w-6 h-6" /></button>
                        <div className="flex items-center gap-10 bg-slate-50/50 dark:bg-slate-800/30 p-6 rounded-3xl border border-slate-100 dark:border-slate-800">
                            <div className="text-center">
                                <p className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1 flex justify-center">TOTAL A TRANSFERIR</p>
                                <div className={`flex items-baseline justify-center gap-1.5 whitespace-nowrap transition-all ${totalSelected > globalBalOrigen ? 'text-rose-600 animate-pulse' : 'text-indigo-600'}`}>
                                    <span className="text-2xl font-black">S/</span>
                                    <span className="text-4xl font-black tabular-nums tracking-tighter">{formatCurrency(totalSelected)}</span>
                                </div>
                            </div>
                            <div className="h-14 w-px bg-slate-200 dark:bg-slate-700" />
                            <div className="text-center">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Disponible Real ({transferData.origen})</p>
                                <div className="flex items-baseline justify-center gap-1 whitespace-nowrap text-slate-900 dark:text-white">
                                    <span className="text-lg font-black">S/</span>
                                    <span className="text-3xl font-black tabular-nums tracking-tight">{formatCurrency(globalBalOrigen)}</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={handleConfirm} disabled={isSubmitting || Object.keys(selectedItems).length === 0 || totalSelected > globalBalOrigen} className="w-full py-5 bg-indigo-600 text-white rounded-2xl text-[12px] font-black uppercase shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-30 tracking-widest border-b-4 border-indigo-800 active:scale-[0.98]">
                            {isSubmitting ? 'PROCESANDO...' : 'EJECUTAR TRANSFERENCIA'}
                        </button>
                    </div>
                </div>

                {/* Account selections (collapses on scroll) */}
                <div className={`transition-all duration-500 ease-in-out ${isScrolled ? 'max-h-0 opacity-0 -translate-y-4 overflow-hidden' : 'max-h-[500px] opacity-100 translate-y-0 mt-8'}`}>
                    <div className="grid grid-cols-2 gap-8 pt-6 px-12 border-t border-slate-50 dark:border-slate-800/50">
                        <div className="space-y-6">
                            <div className="flex items-center gap-6">
                                <div className="min-w-[70px]"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Origen:</label></div>
                                <div className="flex flex-wrap gap-2">
                                    {ALL_ACCOUNTS.map(acc => (
                                        <button key={acc} onClick={() => { setTransferData(d => ({ ...d, origen: acc, destino: d.destino === acc ? (acc === 'Efectivo' ? '4071' : 'Efectivo') : d.destino })); setSelectedItems({}); }} className={`px-6 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all whitespace-nowrap ${transferData.origen === acc ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-md scale-[1.02]' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}>{acc}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="min-w-[70px]"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Destino:</label></div>
                                <div className="flex flex-wrap gap-2">
                                    {ALL_ACCOUNTS.map(acc => (
                                        <button key={acc} onClick={() => { setTransferData(d => ({ ...d, destino: acc })); setShowError(false); }} className={`px-6 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all whitespace-nowrap ${transferData.destino === acc ? 'border-emerald-600 bg-emerald-50 text-emerald-600 shadow-md scale-[1.02]' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`} disabled={transferData.origen === acc}>{acc}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Voucher & Op Number */}
                        <div className="flex gap-4 animate-in slide-in-from-right-4 duration-500">
                            {isVoucherMandatory && (
                                <>
                                    <div className="flex-1 space-y-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">Váucher de Operación</label>
                                        <div onClick={() => fileInputRef.current?.click()} className={`h-24 w-full border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden bg-slate-50 dark:bg-slate-800 relative group ${showError && !voucherFile ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200 hover:border-emerald-400'}`}>
                                            {voucherPreview ? (
                                                <div className="relative w-full h-full">
                                                    <img src={voucherPreview} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                                    <button onClick={(e) => { e.stopPropagation(); setVoucherFile(null); setVoucherPreview(null); }} className="absolute top-2 right-2 p-1.5 bg-rose-500/90 text-white rounded-full shadow-lg hover:bg-rose-600 transition-all z-10 hover:scale-110 flex items-center justify-center border border-rose-400/50" title="Eliminar imagen"><X className="w-3 h-3" /></button>
                                                </div>
                                            ) : (
                                                <>
                                                    <Camera className={`w-6 h-6 mb-1 ${showError && !voucherFile ? 'text-rose-400' : 'text-slate-300'}`} />
                                                    <span className={`text-[8px] font-black uppercase ${showError && !voucherFile ? 'text-rose-500' : 'text-slate-400'}`}>Adjuntar</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">N° Operación</label>
                                        {/* Input is LOCAL — no parent re-render on keystroke */}
                                        <input
                                            type="text"
                                            placeholder="TRANS-XXXX"
                                            value={numOp}
                                            onChange={(e) => { setNumOp(e.target.value.toUpperCase()); setShowError(false); }}
                                            className={`w-full h-24 bg-slate-50 dark:bg-slate-800 border-2 rounded-2xl px-6 font-black text-center text-sm outline-none transition-all ${showError && !numOp ? 'border-rose-400 bg-rose-50' : 'border-slate-100 focus:border-indigo-400'}`}
                                        />
                                    </div>
                                </>
                            )}
                            
                            {isMotivoMandatory && (
                                <div className="flex-[2] space-y-3">
                                    <label className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block pl-1">Motivo de la Transferencia (Obligatorio)</label>
                                    <textarea
                                        placeholder="Describa el motivo detallado de esta transferencia..."
                                        value={motivo}
                                        onChange={(e) => { setMotivo(e.target.value); setShowError(false); }}
                                        className={`w-full h-24 bg-indigo-50/10 dark:bg-indigo-900/10 border-2 rounded-2xl px-6 py-4 font-bold text-sm outline-none transition-all resize-none ${showError && !motivo.trim() ? 'border-rose-400 bg-rose-50' : 'border-indigo-100 dark:border-indigo-800 focus:border-indigo-400'}`}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Adjustment warning */}
                {showAdjustmentWarning && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 px-12 py-3 border-y border-amber-100 dark:border-amber-900/40 flex items-center justify-between z-[90]">
                        <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500">
                            <TrendingDown className="w-4 h-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Ajuste por Gastos Genéricos Aplicado</p>
                        </div>
                        <p className="text-[9px] font-bold text-amber-700/70 dark:text-amber-400/70 uppercase">
                            El saldo por venta ha sido reducido proporcionalmente porque hay S/ {formatCurrency(totalSaleFunds - globalBalOrigen)} de la caja gastados sin asociar a ventas.
                        </p>
                    </div>
                )}

                {/* Scrollable table */}
                <div
                    className="flex-1 overflow-y-auto px-12 custom-scrollbar mb-8 pt-4"
                    onScroll={(e) => {
                        const st = e.currentTarget.scrollTop;
                        if (st > 100 && !isScrolled) setIsScrolled(true);
                        if (st < 20 && isScrolled) setIsScrolled(false);
                    }}
                >
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 transition-all duration-500">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                                <th className="py-6 px-4">Selección</th>
                                <th className="py-6 px-4">Venta</th>
                                <th className="py-6 px-4">Fecha</th>
                                <th className="py-6 px-4">Saldo Disponible</th>
                                <th className="py-6 px-4 text-right">Monto a Transferir</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {salesList.map(v => {
                                const montoMovido = selectedItems[v.id] || 0;
                                const isSelected = selectedItems[v.id] !== undefined;
                                return (
                                    <tr key={v.id} className={`${isSelected ? 'bg-indigo-50/40' : 'hover:bg-slate-50/50'} transition-colors`}>
                                        <td className="py-6 px-4 text-center">
                                            <input type="checkbox" className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={isSelected}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedItems(s => ({ ...s, [v.id]: v.saldoReal }));
                                                    else setSelectedItems(s => { const n = { ...s }; delete n[v.id]; return n; });
                                                }}
                                                disabled={v.saldoReal <= 0}
                                            />
                                        </td>
                                        <td className="py-6 px-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[13px] font-black uppercase text-indigo-900 dark:text-white tracking-tight">#{v.codigo_cotizacion || v.id.slice(0, 8)}</span>
                                                    {v.lastOp && <span className="text-[8px] font-black bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 text-slate-400 uppercase tracking-tighter">Op: {v.lastOp}</span>}
                                                </div>
                                                <span className="text-[11px] font-bold text-slate-500 uppercase leading-tight">{v.cliente_nombre}</span>
                                            </div>
                                        </td>
                                        <td className="py-6 px-4 text-[12px] font-bold text-slate-400">{format(new Date(v.created_at), 'dd/MM/yyyy')}</td>
                                        <td className="py-6 px-4">
                                            <div className="flex flex-col">
                                                <span className="text-[13px] font-black text-indigo-600 tabular-nums">S/ {(v.saldoReal - montoMovido).toFixed(2)}</span>
                                                {v.factor < 1 && <span className="text-[8px] font-black text-amber-500 uppercase italic line-through">Ingreso Total: S/ {v.rawSaldo.toFixed(2)}</span>}
                                            </div>
                                        </td>
                                        <td className="py-6 px-4 text-right">
                                            <input type="number" value={selectedItems[v.id] || ''} onChange={(e) => setSelectedItems(s => ({ ...s, [v.id]: Math.min(Number(e.target.value), v.saldoReal) }))}
                                                className="w-32 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 px-6 py-3 rounded-2xl text-right font-black text-sm outline-none focus:border-indigo-400 transition-all tabular-nums"
                                                disabled={!isSelected || v.saldoReal <= 0}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div className={`transition-all duration-500 w-full flex-shrink-0 ${isScrolled ? 'h-[224px]' : 'h-0'}`} />
                </div>

                <div className="py-4 px-8 bg-slate-500/5 rounded-[2rem] border border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase text-center tracking-[0.3em] mx-8 mb-8">
                    SELECCIONA LOS ELEMENTOS DE LA LISTA SUPERIOR PARA CALCULAR EL MOVIMIENTO
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </div>
        </div>
    );
};
