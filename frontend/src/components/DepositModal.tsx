import React, { useState, useEffect, useRef } from 'react';
import { X, Banknote, Camera, RefreshCw } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { api } from '../services/api';
import type { VentaCabecera } from '../services/types';

interface DepositModalProps {
    venta: VentaCabecera;
    onClose: () => void;
    onRefresh: () => Promise<void>;
}

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
    const fileInputRef = useRef<HTMLInputElement>(null);

    useScrollLock(true);

    // Listen for Paste events (Ctrl+V)
    useEffect(() => {
        const handlePaste = async (event: ClipboardEvent) => {
            // Only process paste if we are in a bank account mode (not cash)
            if (cuentaDestino === 'Efectivo') return;

            const items = event.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        setError(null);
                        try {
                            const webpFile = await convertToWebP(file);
                            setVoucherFile(webpFile);
                            setVoucherPreview(URL.createObjectURL(webpFile));
                        } catch (err) {
                            setVoucherFile(file);
                            setVoucherPreview(URL.createObjectURL(file));
                        }
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [cuentaDestino]); // Re-bind if account changes, though most importantly avoids stale closures

    const BANK_ACCOUNTS = ['2049/YAPE', '4071', '9001', '8059'];

    // Validaciones visuales
    const missingMonto = touched && (!cobroMonto || Number(cobroMonto) <= 0);
    const missingOp = touched && cuentaDestino !== 'Efectivo' && !numOperacion;
    const missingVoucher = touched && cuentaDestino !== 'Efectivo' && !voucherFile;
    const missingMotivo = touched && Number(cobroMonto) > Number(venta.saldo_pendiente) && !motivoExcedente;

    const convertToWebP = (file: File): Promise<File> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const MAX_SIZE = 1200;
                    if (width > MAX_SIZE || height > MAX_SIZE) {
                        if (width > height) {
                            height = (height / width) * MAX_SIZE;
                            width = MAX_SIZE;
                        } else {
                            width = (width / height) * MAX_SIZE;
                            height = MAX_SIZE;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' });
                            resolve(newFile);
                        } else {
                            reject(new Error("Error al convertir"));
                        }
                    }, 'image/webp', 0.85);
                };
            };
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setError(null);
            try {
                const webpFile = await convertToWebP(file);
                setVoucherFile(webpFile);
                setVoucherPreview(URL.createObjectURL(webpFile));
            } catch (err) {
                setVoucherFile(file);
                setVoucherPreview(URL.createObjectURL(file));
            }
        }
    };

    const handleConfirmCobro = async () => {
        setTouched(true);
        setError(null);

        if (!cobroMonto || Number(cobroMonto) <= 0) {
            setError("Por favor indique el monto del depósito");
            return;
        }

        if (cuentaDestino !== 'Efectivo') {
            if (!numOperacion && !voucherFile) {
                setError("Debe incluir el N° de operación y el Voucher");
                return;
            }
            if (!numOperacion) {
                setError("Falta el N° de operación");
                return;
            }
            if (!voucherFile) {
                setError("Falta adjuntar el Voucher");
                return;
            }
        }

        if (Number(cobroMonto) > Number(venta.saldo_pendiente) && !motivoExcedente) {
            setError("Debe justificar el pago de excedente");
            return;
        }

        setIsSubmitting(true);
        try {
            await api.registrarCobro(venta.id, Number(cobroMonto), cuentaDestino, motivoExcedente, numOperacion, voucherFile || undefined);
            await onRefresh();
            onClose();
        } catch (error: any) {
            setError(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden animate-in fade-in duration-300" style={{ backdropFilter: 'blur(6px)' }}>
            <div className="bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-md border border-white/50 flex flex-col max-h-[95vh] relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>
                
                <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40">
                    <div className="flex items-center gap-4">
                        <Banknote className="w-8 h-8 text-[#4A90E2] drop-shadow-sm" />
                        <div>
                            <h2 className="text-xl font-black text-[#2c3434] uppercase tracking-tight">Registrar Depósito</h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-5 custom-scrollbar">
                    <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-[#8b9ba5] uppercase tracking-widest">Saldo Deuda:</span>
                            <span className="text-xs font-black text-[#4A90E2] tabular-nums">S/ {Number(venta.saldo_pendiente).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-[#8b9ba5] uppercase tracking-widest">Saldo Final:</span>
                            <span className={`text-xs font-black tabular-nums transition-colors ${Number(cobroMonto) > 0 ? 'text-[#166534]' : 'text-[#8b9ba5]'}`}>
                                S/ {Math.max(0, Number(venta.saldo_pendiente) - Number(cobroMonto)).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                    {error && (
                        <div className="bg-rose-50 dark:bg-rose-900/10 p-4 rounded-2xl border-2 border-rose-100 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase text-center animate-in shake duration-300 tracking-wider">
                           ⚠️ {error}
                        </div>
                    )}

                    <div className={`p-6 rounded-3xl border-2 transition-all ${missingMonto ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>
                        <label className={`text-[9px] font-black uppercase tracking-[0.2em] block mb-2 ${missingMonto ? 'text-rose-500' : 'text-slate-400'}`}>Importe a Cobrar (S/)</label>
                        <input 
                            type="number" 
                            value={cobroMonto} 
                            onChange={(e) => {setCobroMonto(e.target.value); if(touched) setTouched(false); setError(null);}} 
                            onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
                            className="w-full bg-transparent border-none p-0 text-3xl font-black outline-none tabular-nums text-indigo-600 placeholder:text-slate-200" 
                            placeholder="0.00"
                            autoFocus 
                        />
                    </div>

                    {Number(cobroMonto) > Number(venta.saldo_pendiente) && (
                        <div className={`p-5 rounded-2xl border-2 animate-in slide-in-from-top-2 transition-all ${missingMotivo ? 'bg-rose-50 border-rose-300' : 'bg-rose-50/50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30'}`}>
                            <div className="flex items-center gap-2 mb-3">
                                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${missingMotivo ? 'bg-rose-600' : 'bg-rose-500'}`}></div>
                                <label className={`text-[10px] font-black uppercase tracking-widest leading-none ${missingMotivo ? 'text-rose-600' : 'text-rose-600'}`}>Justificación de Excedente (Obligatorio)</label>
                            </div>
                            <textarea 
                                value={motivoExcedente}
                                onChange={(e) => {setMotivoExcedente(e.target.value); if(touched) setTouched(false); setError(null);}}
                                placeholder="Indique por qué el cliente está abonando más de lo adeudado..."
                                className="w-full bg-white/50 dark:bg-slate-900/50 border-none p-4 rounded-xl text-[11px] font-black text-slate-700 dark:text-rose-200 placeholder:text-rose-300 h-20 outline-none focus:ring-2 ring-rose-200 dark:ring-rose-500/20 transition-all resize-none uppercase"
                            />
                        </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => {setCuentaDestino('Efectivo'); if(touched) setTouched(false); setError(null);}} className={`px-4 py-4 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-3 ${cuentaDestino === 'Efectivo' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 dark:border-slate-800 text-slate-600 opacity-90 hover:border-slate-200'}`}><Banknote className="w-4 h-4" /> Efectivo</button>
                        <div className="grid grid-cols-2 gap-2">
                            {BANK_ACCOUNTS.slice(0, 2).map(acc => (
                                <button key={acc} onClick={() => {setCuentaDestino(acc); if(touched) setTouched(false); setError(null);}} className={`px-2 py-4 rounded-xl border-2 font-black text-[10px] uppercase transition-all truncate ${cuentaDestino === acc ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-slate-100 dark:border-slate-800 text-slate-600 opacity-90 hover:border-slate-200'}`}>{acc}</button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2 col-span-2">
                            {BANK_ACCOUNTS.slice(2).map(acc => (
                                <button key={acc} onClick={() => {setCuentaDestino(acc); if(touched) setTouched(false); setError(null);}} className={`px-2 py-4 rounded-xl border-2 font-black text-[10px] uppercase transition-all truncate ${cuentaDestino === acc ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-slate-100 dark:border-slate-800 text-slate-600 opacity-90 hover:border-slate-200'}`}>{acc}</button>
                            ))}
                        </div>
                    </div>

                    {cuentaDestino !== 'Efectivo' && (
                        <div className="space-y-3 animate-in fade-in duration-300">
                            <input 
                                type="text" 
                                value={numOperacion} 
                                onChange={(e) => {setNumOperacion(e.target.value); if(touched) setTouched(false); setError(null);}} 
                                className={`w-full p-4 rounded-xl text-sm font-black outline-none border-2 transition-all uppercase placeholder:text-[9px] placeholder:text-slate-300 ${missingOp ? 'bg-rose-50 border-rose-300 text-rose-600' : 'bg-slate-50 dark:bg-slate-800 border-transparent focus:border-emerald-400'}`} 
                                placeholder="NÚMERO DE OPERACIÓN BANCARIA" 
                            />
                            
                            <div 
                                onClick={() => fileInputRef.current?.click()} 
                                className={`group w-full h-28 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all relative ${missingVoucher ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-emerald-400'}`}
                            >
                                {voucherPreview ? (
                                    <div className="relative w-full h-full group">
                                        <img src={voucherPreview} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setVoucherFile(null);
                                                setVoucherPreview(null);
                                            }}
                                            className="absolute top-2 right-2 p-2 bg-rose-500/90 text-white rounded-full shadow-lg hover:bg-rose-600 transition-all z-10 hover:scale-110 active:scale-95 flex items-center justify-center backdrop-blur-sm border border-rose-400/50"
                                            title="Eliminar imagen"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <Camera className={`w-7 h-7 mb-1 transition-transform group-hover:scale-110 ${missingVoucher ? 'text-rose-400' : 'text-slate-300'}`} />
                                        <span className={`text-[8px] font-black uppercase tracking-widest ${missingVoucher ? 'text-rose-500' : 'text-slate-400'}`}>ADJUNTAR VOUCHER</span>
                                    </>
                                )}
                                {isSubmitting && <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 flex items-center justify-center backdrop-blur-sm"><RefreshCw className="w-6 h-6 animate-spin text-indigo-600" /></div>}
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                        </div>
                    )}
                    
                    <div className="pt-4">
                        <button 
                            onClick={handleConfirmCobro} 
                            disabled={isSubmitting} 
                            className="w-full py-5 bg-[#4A90E2] text-white rounded-2xl text-[11px] font-black uppercase shadow-xl shadow-[#4A90E2]/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-30 tracking-[0.2em] border-b-4 border-[#366480]"
                        >
                            {isSubmitting ? 'PROCESANDO...' : 'CONFIRMAR DEPÓSITO'}
                        </button>
                        <button onClick={onClose} className="w-full mt-3 py-1 text-[8px] font-black text-slate-300 uppercase tracking-widest hover:text-rose-500 transition-colors">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
