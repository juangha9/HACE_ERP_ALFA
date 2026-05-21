import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    X, ArrowRight, Camera, RefreshCw, TrendingDown, Calendar, ChevronDown
} from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { api } from '../services/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { RangeDatePicker } from './RangeDatePicker';
import type { VentaCabecera, NodrizaTesoreria } from '../services/types';

const BANK_ACCOUNTS = ['2049/YAPE', '4071', '9001', '8059', 'DETRACCIONES'];
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
    const [showDatePicker, setShowDatePicker] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const datePickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showDatePicker && datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
                setShowDatePicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showDatePicker]);

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
        <div className={`treasury-ui fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden ${isClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`} style={{ backdropFilter: 'blur(6px)' }}>
            <div className={`bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-5xl border border-white/50 flex flex-col max-h-[95vh] relative overflow-hidden ${isClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                {/* ── Header ─────────────────────────────────────────── */}
                <div className="sticky top-0 z-[100] bg-white/40 px-8 py-5 border-b border-[#d3dcdb]/30 shrink-0 flex justify-between items-end relative">
                    <button onClick={handleClose} className="absolute top-5 right-5 w-8 h-8 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all z-20"><X className="w-5 h-5" /></button>
                    {/* Left: Title + Filters + Action */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <ArrowRight className="w-8 h-8 text-[#4A90E2] drop-shadow-sm" />
                            <h3 className="text-2xl font-black text-[#2c3434] uppercase tracking-tighter whitespace-nowrap">Transferencia Interna</h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                            {/* Date range */}
                            <div className="relative" ref={datePickerRef}>
                                <button
                                    onClick={() => {
                                        if (quickFilter !== 'PERSONALIZADO') {
                                            handleApplyQuickFilter('PERSONALIZADO');
                                        }
                                        setShowDatePicker(p => !p);
                                    }}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#f8faf9] text-[#366480] rounded-full text-[11px] font-bold hover:bg-[#e8eded] transition-all"
                                >
                                    <Calendar className="w-4 h-4 text-[#4A90E2]" />
                                    {tempStart && tempEnd
                                        ? `${format(new Date(tempStart + 'T12:00:00'), "dd MMM", { locale: es })} — ${format(new Date(tempEnd + 'T12:00:00'), "dd MMM yyyy", { locale: es })}`
                                        : 'Todas las fechas'}
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
                                </button>
                                <RangeDatePicker
                                    isOpen={showDatePicker}
                                    startDate={tempStart || format(new Date(), 'yyyy-MM-dd')}
                                    endDate={tempEnd || format(new Date(), 'yyyy-MM-dd')}
                                    onApply={(s, e) => { setTempStart(s); setTempEnd(e); setModalStartDate(s); setModalEndDate(e); handleApplyQuickFilter('PERSONALIZADO'); setShowDatePicker(false); }}
                                    onCancel={() => setShowDatePicker(false)}
                                    align="left"
                                />
                            </div>

                            {/* Quick filter */}
                            <div className="relative">
                                <select
                                    value={quickFilter}
                                    onChange={(e) => {
                                        handleApplyQuickFilter(e.target.value);
                                        setShowDatePicker(false);
                                    }}
                                    className="appearance-none bg-[#f8faf9] text-[#244c66] pl-5 pr-10 py-2.5 rounded-full text-[11px] font-bold outline-none cursor-pointer hover:bg-[#e8eded] transition-all"
                                >
                                    <option value="PERSONALIZADO">Personalizado</option>
                                    <option value="HOY">Hoy</option>
                                    <option value="ESTA_SEMANA">Última Semana</option>
                                    <option value="MES_ACTUAL">Mes Actual</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                            </div>

                            <button
                                onClick={() => { setModalStartDate(''); setModalEndDate(''); setTempStart(''); setTempEnd(''); handleApplyQuickFilter('PERSONALIZADO'); }}
                                className="p-2.5 bg-[#f8faf9] text-[#8b9ba5] hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>

                            <div className="w-px h-8 bg-slate-200/60 mx-1" />

                            <button onClick={handleConfirm} disabled={isSubmitting || Object.keys(selectedItems).length === 0 || totalSelected > globalBalOrigen} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[11px] font-black uppercase shadow-md hover:bg-indigo-700 transition-all disabled:opacity-30 tracking-widest active:scale-[0.98]">
                                {isSubmitting ? 'PROCESANDO...' : 'EJECUTAR TRANSFERENCIA'}
                            </button>
                        </div>
                    </div>

                    {/* Right: Totals */}
                    <div className="flex flex-col items-end pt-2">
                        <div className="flex items-center gap-6 bg-slate-50/50 dark:bg-slate-800/30 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <div className="text-center">
                                <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-0.5 flex justify-center">TOTAL A TRANSFERIR</p>
                                <div className={`flex items-baseline justify-center gap-1 whitespace-nowrap transition-all ${totalSelected > globalBalOrigen ? 'text-rose-600 animate-pulse' : 'text-indigo-600'}`}>
                                    <span className="text-xl font-black">S/</span>
                                    <span className="text-3xl font-black tabular-nums tracking-tight">{formatCurrency(totalSelected)}</span>
                                </div>
                            </div>
                            <div className="h-10 w-px bg-slate-200 dark:bg-slate-700" />
                            <div className="text-center">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Disponible Real ({transferData.origen})</p>
                                <div className="flex items-baseline justify-center gap-1 whitespace-nowrap text-slate-900 dark:text-white">
                                    <span className="text-base font-black">S/</span>
                                    <span className="text-2xl font-black tabular-nums tracking-tight">{formatCurrency(globalBalOrigen)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Account selections (collapses on scroll) */}
                <div className={`transition-all duration-500 ease-in-out shrink-0 ${isScrolled ? 'max-h-0 opacity-0 -translate-y-4 overflow-hidden' : 'max-h-[600px] opacity-100 translate-y-0'}`}>
                    <div className="px-8 pt-6 pb-4 border-t border-[#d3dcdb]/20">

                        {/* Card-style account selectors */}
                        <div className="flex items-start gap-4 mb-5">
                            {/* Origen */}
                            <div className="flex-1 flex flex-col gap-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Origen</label>
                                <div className="relative">
                                    <select
                                        value={transferData.origen}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setTransferData(d => ({ ...d, origen: val, destino: d.destino === val ? (val === 'Efectivo' ? '4071' : 'Efectivo') : d.destino }));
                                            setSelectedItems({});
                                        }}
                                        className="appearance-none w-full bg-white/80 border border-[#d3dcdb]/50 text-[#2c3434] pl-5 pr-12 py-4 rounded-2xl text-[13px] font-black outline-none cursor-pointer hover:bg-[#f0f5f4] transition-all shadow-sm"
                                    >
                                        {ALL_ACCOUNTS.map(acc => (
                                            <option key={acc} value={acc}>{acc}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#366480] pointer-events-none" />
                                </div>
                                <p className="text-[10px] font-bold text-[#8b9ba5] pl-1">
                                    Saldo disponible: <span className="font-black text-[#244c66]">S/ {formatCurrency(globalBalOrigen)}</span>
                                </p>
                            </div>

                            {/* Arrow */}
                            <div className="flex items-center justify-center pt-8">
                                <div className="w-10 h-10 rounded-full bg-[#f0f5f4] border border-[#d3dcdb]/30 flex items-center justify-center shadow-sm">
                                    <ArrowRight className="w-4 h-4 text-[#4A90E2]" />
                                </div>
                            </div>

                            {/* Destino */}
                            <div className="flex-1 flex flex-col gap-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Destino</label>
                                <div className="relative">
                                    <select
                                        value={transferData.destino}
                                        onChange={(e) => { setTransferData(d => ({ ...d, destino: e.target.value })); setShowError(false); }}
                                        className="appearance-none w-full bg-white/80 border border-[#d3dcdb]/50 text-[#2c3434] pl-5 pr-12 py-4 rounded-2xl text-[13px] font-black outline-none cursor-pointer hover:bg-[#f0f5f4] transition-all shadow-sm"
                                    >
                                        {ALL_ACCOUNTS.filter(acc => acc !== transferData.origen).map(acc => (
                                            <option key={acc} value={acc}>{acc}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#366480] pointer-events-none" />
                                </div>
                                <p className="text-[10px] font-bold text-[#8b9ba5] pl-1">Se abonará inmediatamente</p>
                            </div>
                        </div>

                        {/* Voucher & Op Number (conditional) */}
                        {(isVoucherMandatory || isMotivoMandatory) && (
                            <div className="flex gap-4 pt-4 border-t border-[#d3dcdb]/20">
                                {isVoucherMandatory && (
                                    <>
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">Vóucher de Operación</label>
                                            <div onClick={() => fileInputRef.current?.click()} className={`h-20 w-full border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden bg-[#f8faf9] relative group ${showError && !voucherFile ? 'border-rose-400 bg-rose-50/50' : 'border-[#d3dcdb]/50 hover:border-emerald-400'}`}>
                                                {voucherPreview ? (
                                                    <div className="relative w-full h-full">
                                                        <img src={voucherPreview} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                                        <button onClick={(e) => { e.stopPropagation(); setVoucherFile(null); setVoucherPreview(null); }} className="absolute top-2 right-2 p-1.5 bg-rose-500/90 text-white rounded-full shadow-lg hover:bg-rose-600 transition-all z-10 flex items-center justify-center"><X className="w-3 h-3" /></button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <Camera className={`w-5 h-5 mb-1 ${showError && !voucherFile ? 'text-rose-400' : 'text-slate-300'}`} />
                                                        <span className={`text-[8px] font-black uppercase ${showError && !voucherFile ? 'text-rose-500' : 'text-slate-400'}`}>Adjuntar</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">N° Operación</label>
                                            <input
                                                type="text"
                                                placeholder="TRANS-XXXX"
                                                value={numOp}
                                                onChange={(e) => { setNumOp(e.target.value.toUpperCase()); setShowError(false); }}
                                                className={`w-full h-20 bg-[#f8faf9] border-2 rounded-2xl px-6 font-black text-center text-sm outline-none transition-all ${showError && !numOp ? 'border-rose-400 bg-rose-50' : 'border-[#d3dcdb]/50 focus:border-[#4A90E2]'}`}
                                            />
                                        </div>
                                    </>
                                )}
                                {isMotivoMandatory && (
                                    <div className="flex-[2] space-y-2">
                                        <label className="text-[9px] font-black text-[#4A90E2] uppercase tracking-widest block pl-1">Motivo de la Transferencia (Obligatorio)</label>
                                        <textarea
                                            placeholder="Describa el motivo detallado de esta transferencia..."
                                            value={motivo}
                                            onChange={(e) => { setMotivo(e.target.value); setShowError(false); }}
                                            className={`w-full h-20 bg-[#f8faf9] border-2 rounded-2xl px-6 py-3 font-bold text-sm outline-none transition-all resize-none ${showError && !motivo.trim() ? 'border-rose-400 bg-rose-50' : 'border-[#d3dcdb]/50 focus:border-[#4A90E2]'}`}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>



                {/* Scrollable table */}
                <div
                    className="flex-1 overflow-y-auto px-8 custom-scrollbar mb-4"
                    onScroll={(e) => {
                        const st = e.currentTarget.scrollTop;
                        if (st > 100 && !isScrolled) setIsScrolled(true);
                        if (st < 20 && isScrolled) setIsScrolled(false);
                    }}
                >
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-[#f8faf9]/95 backdrop-blur-md dark:bg-slate-900/95 z-10 shadow-sm">
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

                <div className="py-2.5 px-6 bg-slate-500/5 rounded-2xl border border-slate-100 dark:border-slate-800 text-[8.5px] font-black text-slate-400 uppercase text-center tracking-[0.2em] mx-8 mb-4">
                    SELECCIONA LOS ELEMENTOS DE LA LISTA SUPERIOR PARA CALCULAR EL MOVIMIENTO
                </div>

                {/* Adjustment warning (moved to bottom) */}
                {showAdjustmentWarning && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 px-8 py-4 border-t border-amber-100 dark:border-amber-900/40 flex items-center justify-between shrink-0 rounded-b-3xl">
                        <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500">
                            <TrendingDown className="w-4 h-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Ajuste por Gastos Genéricos Aplicado</p>
                        </div>
                        <p className="text-[9px] font-bold text-amber-700/70 dark:text-amber-400/70 uppercase">
                            El saldo por venta ha sido reducido proporcionalmente porque hay S/ {formatCurrency(totalSaleFunds - globalBalOrigen)} de la caja gastados sin asociar a ventas.
                        </p>
                    </div>
                )}

                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </div>
        </div>
    );
};
