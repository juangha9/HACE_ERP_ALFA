import React, { useState, useEffect, useRef } from 'react';
import { X, Banknote, Camera, RefreshCw, ChevronDown } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { api } from '../services/api';
import type { VentaCabecera } from '../services/types';

interface DepositModalProps {
    venta: VentaCabecera;
    onClose: () => void;
    onRefresh: () => Promise<void>;
}

const FONT = { fontFamily: "'Manrope', sans-serif" } as const;

export const DepositModal: React.FC<DepositModalProps> = ({ venta, onClose, onRefresh }) => {
    const [cobroMonto, setCobroMonto] = useState<string>('');
    const [motivoExcedente, setMotivoExcedente] = useState<string>('');
    const [cuentaDestino, setCuentaDestino] = useState<string>('2049/YAPE');
    const [numOperacion, setNumOperacion] = useState<string>('');
    const [voucherFile, setVoucherFile] = useState<File | null>(null);
    const [voucherPreview, setVoucherPreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [touched, setTouched] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => onClose(), 300);
    };

    useScrollLock(true);

    useEffect(() => {
        const handlePaste = async (event: ClipboardEvent) => {
            if (cuentaDestino === 'Efectivo') return;
            const items = event.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        setError(null);
                        try { const w = await convertToWebP(file); setVoucherFile(w); setVoucherPreview(URL.createObjectURL(w)); }
                        catch { setVoucherFile(file); setVoucherPreview(URL.createObjectURL(file)); }
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [cuentaDestino]);

    const ALL_ACCOUNTS = [
        { value: 'Efectivo',   label: 'Efectivo (Caja)' },
        { value: '2049/YAPE', label: '2049 / YAPE' },
        { value: '4071',      label: '4071' },
        { value: '9001',      label: '9001' },
        { value: '8059',      label: '8059' },
    ];

    const missingMonto   = touched && (!cobroMonto || Number(cobroMonto) <= 0);
    const missingOp      = touched && cuentaDestino !== 'Efectivo' && !numOperacion;
    const missingVoucher = touched && cuentaDestino !== 'Efectivo' && !voucherFile;
    const missingMotivo  = touched && Number(cobroMonto) > Number(venta.saldo_pendiente) && !motivoExcedente;

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
                        else reject(new Error('Error al convertir'));
                    }, 'image/webp', 0.85);
                };
            };
        });

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError(null);
        try { const w = await convertToWebP(file); setVoucherFile(w); setVoucherPreview(URL.createObjectURL(w)); }
        catch { setVoucherFile(file); setVoucherPreview(URL.createObjectURL(file)); }
    };

    const reset = () => { if (touched) setTouched(false); setError(null); };

    const handleConfirmCobro = async () => {
        setTouched(true); setError(null);
        if (!cobroMonto || Number(cobroMonto) <= 0)          { setError('Por favor indique el monto del depósito'); return; }
        if (cuentaDestino !== 'Efectivo') {
            if (!numOperacion && !voucherFile)               { setError('Debe incluir el N° de operación y el Voucher'); return; }
            if (!numOperacion)                               { setError('Falta el N° de operación'); return; }
            if (!voucherFile)                                { setError('Falta adjuntar el Voucher'); return; }
        }
        if (Number(cobroMonto) > Number(venta.saldo_pendiente) && !motivoExcedente) {
            setError('Debe justificar el pago de excedente'); return;
        }
        setIsSubmitting(true);
        try {
            await api.registrarCobro(venta.id, Number(cobroMonto), cuentaDestino, motivoExcedente, numOperacion, voucherFile || undefined);
            await onRefresh(); handleClose();
        } catch (err: any) { setError(`Error: ${err.message}`); }
        finally { setIsSubmitting(false); }
    };

    const fmt = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2 });

    return (
        <div
            className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/30 overflow-hidden ${isClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
            style={{ backdropFilter: 'blur(8px)', ...FONT }}
        >
            {/* Modal */}
            <div className={`bg-white/75 backdrop-blur-xl rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.15)] w-full max-w-xs border border-white/60 flex flex-col max-h-[95vh] relative overflow-hidden ${isClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/60 z-10" />

                {/* Header */}
                <div className="px-5 py-4 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[#4A90E2] flex items-center justify-center shadow-sm">
                            <Banknote className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-[#2c3434] uppercase tracking-tight">Registrar Depósito</h2>
                            <p className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-widest mt-0.5">{venta.cliente_nombre}</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="w-8 h-8 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 custom-scrollbar">

                    {/* Saldo info — legible, no bold excesivo */}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 px-1">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-wider">Saldo deuda</span>
                            <span className="text-base font-semibold text-[#366480] tabular-nums">S/ {fmt(Number(venta.saldo_pendiente))}</span>
                        </div>
                        <div className="w-px bg-[#e8eded] self-stretch hidden sm:block" />
                        <div className="flex flex-col">
                            <span className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-wider">Saldo final</span>
                            <span className={`text-base font-semibold tabular-nums transition-colors ${Number(cobroMonto) > 0 ? 'text-[#166534]' : 'text-[#8b9ba5]'}`}>
                                S/ {fmt(Math.max(0, Number(venta.saldo_pendiente) - Number(cobroMonto)))}
                            </span>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-rose-50/80 p-3 rounded-xl border border-rose-200 text-rose-600 text-[10px] font-semibold text-center tracking-wide">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Importe */}
                    <div className={`p-4 rounded-2xl border-2 transition-all ${missingMonto ? 'bg-rose-50 border-rose-200' : 'bg-[#f8faf9] border-[#e8eded]'}`}>
                        <label className={`text-[9px] font-semibold uppercase tracking-[0.2em] block mb-1 ${missingMonto ? 'text-rose-500' : 'text-[#8b9ba5]'}`}>Importe a Cobrar (S/)</label>
                        <input
                            type="number"
                            value={cobroMonto}
                            onChange={(e) => { setCobroMonto(e.target.value); reset(); }}
                            onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
                            className="w-full bg-transparent border-none p-0 text-2xl font-black outline-none tabular-nums text-[#4A90E2] placeholder:text-[#d3dcdb]"
                            style={FONT}
                            placeholder="0.00"
                            autoFocus
                        />
                    </div>

                    {/* Excedente */}
                    {Number(cobroMonto) > Number(venta.saldo_pendiente) && (
                        <div className={`p-3 rounded-xl border animate-in slide-in-from-top-2 transition-all ${missingMotivo ? 'bg-rose-50 border-rose-200' : 'bg-rose-50/60 border-rose-100'}`}>
                            <label className="text-[9px] font-semibold uppercase tracking-wider text-rose-500 block mb-1.5">Justificación de Excedente (obligatorio)</label>
                            <textarea
                                value={motivoExcedente}
                                onChange={(e) => { setMotivoExcedente(e.target.value); reset(); }}
                                placeholder="Indique por qué el cliente abona más de lo adeudado..."
                                className="w-full bg-white/70 border-none p-2.5 rounded-lg text-[11px] font-medium text-[#2c3434] placeholder:text-rose-300 h-14 outline-none focus:ring-1 ring-rose-200 transition-all resize-none"
                                style={FONT}
                            />
                        </div>
                    )}

                    {/* Origen de Fondos */}
                    <div>
                        <label className="text-[9px] font-semibold uppercase tracking-[0.2em] block mb-1.5 text-[#8b9ba5]">Origen de Fondos</label>
                        <div className="relative">
                            <select
                                value={cuentaDestino}
                                onChange={(e) => { setCuentaDestino(e.target.value); reset(); }}
                                className="w-full appearance-none px-3 py-2.5 pr-8 rounded-xl border border-[#e8eded] bg-[#f8faf9] text-[12px] font-semibold text-[#2c3434] outline-none focus:border-[#4A90E2] cursor-pointer transition-all"
                                style={FONT}
                            >
                                {ALL_ACCOUNTS.map(a => (
                                    <option key={a.value} value={a.value}>{a.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8b9ba5] pointer-events-none" />
                        </div>
                    </div>

                    {/* Voucher + N° Op */}
                    {cuentaDestino !== 'Efectivo' && (
                        <div className="space-y-2 animate-in fade-in duration-300">
                            <input
                                type="text"
                                value={numOperacion}
                                onChange={(e) => { setNumOperacion(e.target.value); reset(); }}
                                className={`w-full px-3 py-2 rounded-xl text-[11px] font-medium outline-none border transition-all placeholder:text-[#d3dcdb] ${missingOp ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-[#f8faf9] border-[#e8eded] text-[#2c3434] focus:border-[#4A90E2]'}`}
                                style={FONT}
                                placeholder="N° de Operación Bancaria"
                            />
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className={`group w-full h-16 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all relative ${missingVoucher ? 'bg-rose-50 border-rose-200' : 'bg-[#f8faf9] border-[#e8eded] hover:border-[#4A90E2]'}`}
                            >
                                {voucherPreview ? (
                                    <div className="relative w-full h-full group">
                                        <img src={voucherPreview} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setVoucherFile(null); setVoucherPreview(null); }}
                                            className="absolute top-1.5 right-1.5 p-1.5 bg-rose-500/90 text-white rounded-full shadow hover:bg-rose-600 transition-all z-10 flex items-center justify-center"
                                        >
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <Camera className={`w-4 h-4 mb-0.5 ${missingVoucher ? 'text-rose-400' : 'text-[#8b9ba5]'}`} />
                                        <span className={`text-[8px] font-semibold uppercase tracking-widest ${missingVoucher ? 'text-rose-500' : 'text-[#8b9ba5]'}`}>Adjuntar Voucher</span>
                                    </>
                                )}
                                {isSubmitting && (
                                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-sm">
                                        <RefreshCw className="w-5 h-5 animate-spin text-[#4A90E2]" />
                                    </div>
                                )}
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                        </div>
                    )}

                    {/* Acciones */}
                    <div className="pt-2">
                        <button
                            onClick={handleConfirmCobro}
                            disabled={isSubmitting}
                            className="w-full py-3.5 bg-[#4A90E2] text-white rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-[#4A90E2]/20 hover:bg-[#357ABD] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-30 tracking-[0.2em] border-b-4 border-[#366480]"
                            style={FONT}
                        >
                            {isSubmitting ? 'PROCESANDO...' : 'CONFIRMAR DEPÓSITO'}
                        </button>
                        <button onClick={handleClose} className="w-full mt-2 py-1 text-[8px] font-semibold text-[#8b9ba5] uppercase tracking-widest hover:text-rose-500 transition-colors" style={FONT}>
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
