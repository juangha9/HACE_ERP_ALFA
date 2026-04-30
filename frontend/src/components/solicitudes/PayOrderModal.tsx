import React, { useState, useRef, useEffect } from 'react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { api } from '../../services/api';
import type { OrdenPago } from '../../services/types';
import { format } from 'date-fns';
import { Camera, X, FileText } from 'lucide-react';

interface PayOrderModalProps {
    orden: OrdenPago;
    onClose: () => void;
    onSuccess: () => void;
    balances: Record<string, number>;
}

const ACCOUNTS = ['Efectivo', '2049/YAPE', '4071', '9001', '8059'];

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

export const PayOrderModal: React.FC<PayOrderModalProps> = ({ orden, onClose, onSuccess, balances }) => {
    const isPaid = orden.estado === 'pagado';
    const [selectedAccount, setSelectedAccount] = useState(orden.cuenta_pagadora || 'Efectivo');
    const [fechaPago, setFechaPago] = useState(
        orden.fecha_pago 
            ? format(new Date(orden.fecha_pago), 'yyyy-MM-dd') 
            : format(new Date(), 'yyyy-MM-dd')
    );
    const [submitting, setSubmitting] = useState(false);
    
    // New fields for Bank transfers
    const [numOp, setNumOp] = useState(orden.num_operacion || '');
    const [voucherFile, setVoucherFile] = useState<File | null>(null);
    const [voucherPreview, setVoucherPreview] = useState<string | null>(orden.voucher_url || null);
    const [showError, setShowError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isVoucherMandatory = selectedAccount !== 'Efectivo' && !isPaid;

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

    useScrollLock(true);

    // Global Paste handler for voucher image
    useEffect(() => {
        const handlePaste = async (event: ClipboardEvent) => {
            if (!isVoucherMandatory || isPaid) return; 
            const items = event.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        setShowError(false);
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
    }, [isVoucherMandatory, isPaid]);

    const handleConfirm = async () => {
        if (isPaid) return;
        if (isVoucherMandatory && (!numOp || !voucherFile)) {
            setShowError(true);
            return;
        }

        setSubmitting(true);
        try {
            let voucherUrl: string | undefined = undefined;
            if (voucherFile) {
                voucherUrl = await api.uploadVoucher(voucherFile, `PAGO_OP_${orden.codigo_orden}`);
            }

            await api.pagarOrdenPago(orden.id, selectedAccount, fechaPago, numOp, voucherUrl);
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Error al pagar orden:", error);
            alert("Error al procesar el pago");
        } finally {
            setSubmitting(false);
        }
    };

    const currentBalance = balances[selectedAccount] || 0;
    const remainingBalance = currentBalance - orden.monto_total;
    const isInsufficient = remainingBalance < 0 && !isPaid;

    const formatCurrency = (val: number) => {
        return val.toLocaleString('es-PE', { minimumFractionDigits: 2 });
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden animate-in fade-in duration-300" style={{ backdropFilter: 'blur(6px)' }}>
            <div className="bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-4xl border border-white/50 flex flex-col max-h-[95vh] relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>
                
                <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${isPaid ? 'bg-[#166534]' : 'bg-[#4A90E2]'} shadow-sm`}>
                            <span className="material-icons-round text-xl">{isPaid ? 'check_circle' : 'payments'}</span>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-[#2c3434] uppercase tracking-tight">
                                {isPaid ? 'Detalle de Orden Pagada' : 'Aprobar y Pagar'}
                            </h2>
                            <div className="flex items-center gap-3 mt-1">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${isPaid ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#e0f2fe] text-[#366480]'}`}>
                                    {orden.codigo_orden}
                                </span>
                                <span className="text-[#8b9ba5] font-bold text-[10px] uppercase">{orden.obra_nombre}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all z-20"><X className="w-6 h-6" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Side: Order Info */}
                    <div className="space-y-8">
                        <div className="bg-white p-8 rounded-[2rem] border border-[#e8eded] shadow-sm space-y-6">
                            <p className="text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest border-b border-[#e8eded] pb-2">Información del Requerimiento</p>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-[#8b9ba5] uppercase">Proveedor</span>
                                    <span className="text-[11px] font-black uppercase text-[#2c3434]">{orden.proveedor?.razon_social || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-[#8b9ba5] uppercase">Moneda</span>
                                    <span className="text-[11px] font-black uppercase text-[#2c3434]">{orden.moneda === 'PEN' ? 'Soles (S/)' : 'Dólares ($)'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="bg-white rounded-[2rem] border border-[#e8eded] shadow-sm overflow-hidden">
                            <p className="text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest px-8 pt-8 pb-4 border-b border-[#e8eded]">Conceptos / Detalles</p>
                            <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left">
                                    <tbody className="divide-y divide-[#e8eded]">
                                        {(orden.conceptos || []).map((c: any, i: number) => (
                                            <tr key={i} className="hover:bg-[#f8faf9] transition-colors">
                                                <td className="px-8 py-4">
                                                    <p className="text-[11px] font-black text-[#2c3434] uppercase">{c.descripcion}</p>
                                                    <p className="text-[9px] font-bold text-[#8b9ba5]">Cant: {c.cantidad}</p>
                                                </td>
                                                <td className="px-8 py-4 text-right pr-10">
                                                    <span className="text-sm font-black text-[#2c3434]">
                                                        {orden.moneda === 'PEN' ? 'S/' : '$'} {formatCurrency(c.subtotal_item)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-[#f8faf9] px-8 py-6 flex justify-between items-center">
                                <span className="text-xs font-black text-[#8b9ba5] uppercase">Total a Pagar</span>
                                <span className="text-2xl font-black text-[#366480]">
                                    {orden.moneda === 'PEN' ? 'S/' : '$'} {formatCurrency(orden.monto_total)}
                                </span>
                            </div>
                        </div>

                        {/* Reference Files */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-[#8b9ba5] uppercase tracking-widest ml-4">Factura / PDF</label>
                                {orden.url_factura ? (
                                    <a href={orden.url_factura} target="_blank" rel="noreferrer" className="block p-4 bg-white border-2 border-[#e8eded] rounded-2xl hover:border-[#4A90E2] transition-all text-center">
                                        <FileText className="w-6 h-6 mx-auto mb-1 text-[#4A90E2]" />
                                        <span className="text-[9px] font-black text-[#8b9ba5] uppercase">Ver Factura</span>
                                    </a>
                                ) : (
                                    <div className="p-4 bg-[#f8faf9] rounded-2xl text-center opacity-40">
                                        <span className="text-[9px] font-black text-[#8b9ba5] uppercase tracking-widest">Sin Factura</span>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4">
                                <label className="text-[9px] font-black text-[#8b9ba5] uppercase tracking-widest ml-4">Evidencia (Fotos)</label>
                                {orden.url_evidencia ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {orden.url_evidencia.split(/[|,]/).filter(Boolean).map((url, idx) => (
                                            <a 
                                                key={idx} 
                                                href={url} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className="block p-4 bg-white border-2 border-[#e8eded] rounded-2xl hover:border-[#4A90E2] transition-all text-center group relative h-20 overflow-hidden"
                                            >
                                                <img src={url} className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-40 transition-opacity" alt="" />
                                                <Camera className="w-5 h-5 mx-auto mb-1 text-[#166534] relative z-10" />
                                                <span className="text-[8px] font-black text-[#8b9ba5] uppercase relative z-10">Imagen {idx + 1}</span>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-4 bg-[#f8faf9] rounded-2xl text-center opacity-40">
                                        <span className="text-[9px] font-black text-[#8b9ba5] uppercase tracking-widest">Sin Evidencia</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Payment Logic */}
                    <div className="space-y-8">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-[#8b9ba5] uppercase tracking-widest ml-4">Fecha de {isPaid ? 'Pago' : 'Registro'}</label>
                                <input 
                                    type="date" 
                                    value={fechaPago} 
                                    onChange={(e) => !isPaid && setFechaPago(e.target.value)}
                                    disabled={isPaid}
                                    className={`w-full bg-[#f8faf9] border-2 p-4 rounded-2xl font-bold transition-all shadow-sm ${isPaid ? 'border-transparent text-[#8b9ba5]' : 'border-transparent focus:border-[#4A90E2] text-[#2c3434]'}`}
                                />
                            </div>

                            <div className="space-y-4">
                                <label className="text-xs font-black text-[#8b9ba5] uppercase tracking-widest ml-4">Origen de Fondos</label>
                                {isPaid ? (
                                    <div className="p-5 bg-white border border-[#e8eded] rounded-2xl flex items-center justify-between">
                                        <span className="text-sm font-black uppercase text-[#2c3434]">{selectedAccount}</span>
                                        <span className="material-icons-round text-[#166534]">verified</span>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        {ACCOUNTS.map(acc => {
                                            const accBalance = balances[acc] || 0;
                                            return (
                                                <button
                                                    key={acc}
                                                    onClick={() => { setSelectedAccount(acc); setShowError(false); }}
                                                    className={`flex items-center justify-between p-5 rounded-2xl border-2 transition-all font-black uppercase tracking-widest ${
                                                        selectedAccount === acc 
                                                        ? 'bg-[#366480] border-[#366480] text-white shadow-lg shadow-[#366480]/20' 
                                                        : 'bg-white border-[#e8eded] text-[#8b9ba5] hover:bg-[#f8faf9]'
                                                    }`}
                                                >
                                                    <div className="flex flex-col items-start text-left">
                                                        <span className="text-sm">{acc}</span>
                                                        <span className={`text-[10px] uppercase font-black tracking-widest ${selectedAccount === acc ? 'text-white/80' : 'text-[#8b9ba5]'}`}>
                                                            DISP: {formatCurrency(accBalance)}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4 animate-in slide-in-from-bottom-4 duration-500 pt-4 border-t border-[#e8eded]">
                                <div className="flex-1 space-y-3">
                                    <label className="text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest block pl-1">Váucher de Pago</label>
                                    <div onClick={() => !isPaid && fileInputRef.current?.click()} className={`h-40 w-full border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden bg-white relative group ${isPaid ? 'border-transparent' : (showError && !voucherFile ? 'border-rose-400 bg-rose-50/50' : 'border-[#d3dcdb] hover:border-[#4A90E2]')}`}>
                                        {voucherPreview ? (
                                            <div className="relative w-full h-full">
                                                <img src={voucherPreview} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                                {!isPaid && <button onClick={(e) => { e.stopPropagation(); setVoucherFile(null); setVoucherPreview(null); }} className="absolute top-2 right-2 p-1.5 bg-rose-500/90 text-white rounded-full shadow-lg hover:bg-rose-600 transition-all z-10 hover:scale-110 flex items-center justify-center border border-rose-400/50" title="Eliminar imagen"><X className="w-3 h-3" /></button>}
                                                {isPaid && <div className="absolute inset-0 bg-[#2c3434]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><a href={voucherPreview} target="_blank" rel="noreferrer" className="p-3 bg-white rounded-full text-[#2c3434] uppercase font-black text-[9px]">Ver Ampliado</a></div>}
                                            </div>
                                        ) : (
                                            <>
                                                <Camera className={`w-6 h-6 mb-1 ${showError && !voucherFile ? 'text-rose-400' : 'text-[#8b9ba5]'}`} />
                                                <span className={`text-[8px] font-black uppercase ${showError && !voucherFile ? 'text-rose-500' : 'text-[#8b9ba5]'}`}>{isPaid ? 'Sin Váucher' : 'Adjuntar'}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 space-y-3">
                                    <label className="text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest block pl-1">N° Operación</label>
                                    <input
                                        type="text"
                                        placeholder="N° XXXX"
                                        value={numOp}
                                        onChange={(e) => !isPaid && setNumOp(e.target.value.toUpperCase())}
                                        disabled={isPaid}
                                        className={`w-full h-40 bg-[#f8faf9] border-2 rounded-3xl px-6 font-black text-center text-lg outline-none transition-all ${isPaid ? 'border-transparent text-[#166534]' : (showError && !numOp ? 'border-rose-400 bg-rose-50' : 'border-transparent focus:border-[#4A90E2] text-[#2c3434]')}`}
                                    />
                                </div>
                            </div>
                        </div>

                        {!isPaid && (
                            <div className="flex flex-col gap-4 mt-10">
                                <div className={`p-6 rounded-2xl flex items-center justify-between border-2 ${isInsufficient ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-[#e0f2fe] border-[#bbf7d0] text-[#366480]'}`}>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black uppercase tracking-widest opacity-80">Saldo Resultante</span>
                                        <span className="text-xl font-black tabular-nums tracking-tighter">
                                            S/ {formatCurrency(remainingBalance)}
                                        </span>
                                    </div>
                                    {isInsufficient && (
                                        <div className="text-[9px] font-black uppercase bg-rose-100 text-rose-600 px-3 py-1.5 rounded-full tracking-widest">
                                            FONDOS INSUFICIENTES
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={handleConfirm}
                                    disabled={submitting || isInsufficient}
                                    className={`w-full text-white font-black py-5 px-10 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-sm border-b-4 flex items-center justify-center gap-2 ${
                                        submitting || isInsufficient 
                                        ? 'bg-[#e8eded] border-[#d3dcdb] shadow-none cursor-not-allowed text-[#8b9ba5]' 
                                        : 'bg-[#166534] border-[#14532d] hover:bg-[#14532d] shadow-[#166534]/20 active:translate-y-px'
                                    }`}
                                >
                                    {submitting ? 'PROCESANDO...' : 'CONFIRMAR Y REGISTRAR PAGO'}
                                </button>
                            </div>
                        )}

                        {isPaid && (
                            <button
                                onClick={onClose}
                                className="w-full bg-[#f8faf9] border-2 border-[#e8eded] text-[#8b9ba5] hover:bg-[#e8eded] font-black py-5 rounded-2xl uppercase tracking-widest text-sm active:scale-95 transition-transform"
                            >
                                CERRAR DETALLES
                            </button>
                        )}
                    </div>
                </div>
                </div>
                
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </div>
        </div>
    );
};

