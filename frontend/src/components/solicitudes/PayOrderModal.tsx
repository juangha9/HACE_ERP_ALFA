import React, { useState, useRef, useEffect } from 'react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { api } from '../../services/api';
import type { OrdenPago } from '../../services/types';
import { format } from 'date-fns';
import { Camera, X, FileText, ChevronDown } from 'lucide-react';

interface PayOrderModalProps {
    orden: OrdenPago;
    onClose: () => void;
    onSuccess: () => void;
    balances: Record<string, number>;
}

const ACCOUNTS = ['Efectivo', '2049/YAPE', '4071', '9001', '8059'];
const FONT = { fontFamily: "'Manrope', sans-serif" } as const;

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

    // Payment form state
    const [selectedAccount, setSelectedAccount] = useState(orden.cuenta_pagadora || 'Efectivo');
    const [fechaPago, setFechaPago] = useState(
        orden.fecha_pago
            ? format(new Date(orden.fecha_pago), 'yyyy-MM-dd')
            : format(new Date(), 'yyyy-MM-dd')
    );
    const [submitting, setSubmitting] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [numOp, setNumOp] = useState(orden.num_operacion || '');

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => onClose(), 300);
    };
    const [voucherFile, setVoucherFile] = useState<File | null>(null);
    const [voucherPreview, setVoucherPreview] = useState<string | null>(orden.voucher_url || null);
    const [showError, setShowError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Lightbox image viewer
    const [viewerUrl, setViewerUrl] = useState<string | null>(null);

    // Comprobante de Pago (collect for submit when !isPaid; immediate save when isPaid)
    const [localFacturaUrl, setLocalFacturaUrl] = useState<string | null>(orden.url_factura || null);
    const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
    const [comprobantePreview, setComprobantePreview] = useState<string | null>(null);
    const [isAddingComprobante, setIsAddingComprobante] = useState(false);
    const comprobanteInputRef = useRef<HTMLInputElement>(null);

    // Evidencia — multi-file (collect for submit when !isPaid; immediate save when isPaid)
    const [localEvidenciaUrl, setLocalEvidenciaUrl] = useState<string | null>(orden.url_evidencia || null);
    const [evidenciaFiles, setEvidenciaFiles] = useState<File[]>([]);
    const [evidenciaPreviews, setEvidenciaPreviews] = useState<string[]>([]);
    const [isAddingEvidencia, setIsAddingEvidencia] = useState(false);
    const evidenciaInputRef = useRef<HTMLInputElement>(null);

    const isVoucherMandatory = selectedAccount !== 'Efectivo' && !isPaid;

    // Voucher block click: if image present → open viewer; else → open file browser
    const handleVoucherClick = () => {
        if (voucherPreview) {
            setViewerUrl(voucherPreview);
        } else if (!isPaid) {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try { const w = await convertToWebP(file); setVoucherFile(w); setVoucherPreview(URL.createObjectURL(w)); }
        catch { setVoucherFile(file); setVoucherPreview(URL.createObjectURL(file)); }
    };

    const handleComprobanteFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type.startsWith('image/')) {
            try { const w = await convertToWebP(file); setComprobanteFile(w); setComprobantePreview(URL.createObjectURL(w)); }
            catch { setComprobanteFile(file); setComprobantePreview(URL.createObjectURL(file)); }
        } else {
            setComprobanteFile(file);
            setComprobantePreview(null);
        }
        e.target.value = '';
    };

    const handleAddComprobante = async () => {
        if (!comprobanteFile) return;
        setIsAddingComprobante(true);
        try {
            const newUrl = await api.uploadOrdenFile(comprobanteFile, 'facturas');
            const updatedUrl = await api.actualizarComprobanteOrden(orden.id, newUrl);
            setLocalFacturaUrl(updatedUrl);
            setComprobanteFile(null);
            setComprobantePreview(null);
            onSuccess();
        } catch { alert('Error al guardar el comprobante'); }
        finally { setIsAddingComprobante(false); }
    };

    const handleEvidenciaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const newFiles: File[] = [];
        const newPreviews: string[] = [];
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                try {
                    const w = await convertToWebP(file);
                    newFiles.push(w);
                    newPreviews.push(URL.createObjectURL(w));
                } catch {
                    newFiles.push(file);
                    newPreviews.push(URL.createObjectURL(file));
                }
            } else {
                newFiles.push(file);
                newPreviews.push(URL.createObjectURL(file));
            }
        }
        setEvidenciaFiles(prev => [...prev, ...newFiles]);
        setEvidenciaPreviews(prev => [...prev, ...newPreviews]);
        e.target.value = '';
    };

    const handleAddEvidencia = async () => {
        if (evidenciaFiles.length === 0) return;
        setIsAddingEvidencia(true);
        try {
            let updatedUrl = '';
            for (const file of evidenciaFiles) {
                const newUrl = await api.uploadOrdenFile(file, 'evidencias');
                updatedUrl = await api.actualizarEvidenciaOrden(orden.id, newUrl);
            }
            setLocalEvidenciaUrl(updatedUrl);
            setEvidenciaFiles([]);
            setEvidenciaPreviews([]);
            onSuccess();
        } catch { alert('Error al guardar la evidencia'); }
        finally { setIsAddingEvidencia(false); }
    };

    const removeEvidenciaPending = (idx: number) => {
        setEvidenciaFiles(prev => prev.filter((_, i) => i !== idx));
        setEvidenciaPreviews(prev => prev.filter((_, i) => i !== idx));
    };

    useScrollLock(true);

    // Ctrl+V paste → voucher (only when modal is in editable state)
    useEffect(() => {
        const handlePaste = async (event: ClipboardEvent) => {
            if (isPaid) return;
            const items = event.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        setShowError(false);
                        try { const w = await convertToWebP(file); setVoucherFile(w); setVoucherPreview(URL.createObjectURL(w)); }
                        catch { setVoucherFile(file); setVoucherPreview(URL.createObjectURL(file)); }
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [isPaid]);

    const handleConfirm = async () => {
        if (isPaid) return;
        if (isVoucherMandatory && (!numOp || !voucherFile)) { setShowError(true); return; }
        setSubmitting(true);
        try {
            let voucherUrl: string | undefined;
            if (voucherFile) voucherUrl = await api.uploadVoucher(voucherFile, `PAGO_OP_${orden.codigo_orden}`);
            await api.pagarOrdenPago(orden.id, selectedAccount, fechaPago, numOp, voucherUrl);
            if (comprobanteFile) {
                const facturaUrl = await api.uploadOrdenFile(comprobanteFile, 'facturas');
                await api.actualizarComprobanteOrden(orden.id, facturaUrl);
            }
            for (const file of evidenciaFiles) {
                const evUrl = await api.uploadOrdenFile(file, 'evidencias');
                await api.actualizarEvidenciaOrden(orden.id, evUrl);
            }
            onSuccess(); handleClose();
        } catch { alert('Error al procesar el pago'); }
        finally { setSubmitting(false); }
    };

    const fmt = (val: number) => val.toLocaleString('es-PE', { minimumFractionDigits: 2 });
    const currentBalance   = balances[selectedAccount] || 0;
    const remainingBalance = currentBalance - orden.monto_total;
    const isInsufficient   = remainingBalance < 0 && !isPaid;

    const facturaLinks  = localFacturaUrl  ? localFacturaUrl.split('|').filter(Boolean)      : [];
    const evidenciaLinks = localEvidenciaUrl ? localEvidenciaUrl.split(/[|,]/).filter(Boolean) : [];

    type EvItem = { url: string; isPending: boolean; idx?: number };
    const allEvItems: EvItem[] = [
        ...evidenciaLinks.map(url => ({ url, isPending: false })),
        ...evidenciaPreviews.map((url, idx) => ({ url, isPending: true, idx })),
    ];

    return (
        <>
            {/* Lightbox viewer */}
            {viewerUrl && (
                <div
                    className="fixed inset-0 z-[3000] bg-[#2c3434]/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setViewerUrl(null)}
                >
                    <div className="relative max-w-2xl w-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                        <img src={viewerUrl} className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl" alt="Vista previa" />
                        <button
                            onClick={() => setViewerUrl(null)}
                            className="absolute top-2 right-2 w-8 h-8 bg-[#2c3434]/80 text-white rounded-full flex items-center justify-center hover:bg-rose-500 transition-all z-10"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            <div
                className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/30 overflow-hidden ${isClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
                style={{ backdropFilter: 'blur(8px)', ...FONT }}
            >
                <div className={`bg-white/75 backdrop-blur-xl rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.15)] w-full max-w-md border border-white/60 flex flex-col max-h-[95vh] relative overflow-hidden ${isClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/60 z-10" />

                    {/* Header */}
                    <div className="px-5 py-4 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white ${isPaid ? 'bg-[#166534]' : 'bg-[#4A90E2]'} shadow-sm`}>
                                <span className="material-icons-round text-base">{isPaid ? 'check_circle' : 'payments'}</span>
                            </div>
                            <div>
                                <h2 className="text-sm font-black text-[#2c3434] uppercase tracking-tight">
                                    {isPaid ? 'Detalle de Orden Pagada' : 'Aprobar y Pagar'}
                                </h2>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-widest ${isPaid ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#e0f2fe] text-[#366480]'}`}>
                                        {orden.codigo_orden}
                                    </span>
                                    <span className="text-[#8b9ba5] font-medium text-[9px] uppercase truncate max-w-[140px]">{orden.obra_nombre}</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={handleClose} className="w-8 h-8 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all z-20">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 custom-scrollbar">

                        {/* Info summary */}
                        <div className="bg-white/70 p-3 rounded-2xl border border-[#e8eded] shadow-sm space-y-2">
                            <p className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-widest border-b border-[#e8eded] pb-1.5">Información del Requerimiento</p>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-medium text-[#8b9ba5] uppercase">Proveedor</span>
                                <span className="text-[11px] font-semibold uppercase text-[#2c3434] truncate max-w-[55%] text-right">{orden.proveedor?.razon_social || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-medium text-[#8b9ba5] uppercase">Moneda</span>
                                <span className="text-[11px] font-semibold uppercase text-[#2c3434]">{orden.moneda === 'PEN' ? 'Soles (S/)' : 'Dólares ($)'}</span>
                            </div>
                        </div>

                        {/* Items table */}
                        <div className="bg-white/70 rounded-2xl border border-[#e8eded] shadow-sm overflow-hidden">
                            <p className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-widest px-4 pt-3 pb-2 border-b border-[#e8eded]">Conceptos / Detalles</p>
                            <div className="max-h-28 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left">
                                    <tbody className="divide-y divide-[#e8eded]">
                                        {(orden.conceptos || []).map((c: any, i: number) => (
                                            <tr key={i} className="hover:bg-[#f8faf9]/60 transition-colors">
                                                <td className="px-4 py-2">
                                                    <p className="text-[11px] font-semibold text-[#2c3434] uppercase">{c.descripcion}</p>
                                                    <p className="text-[9px] text-[#8b9ba5]">Cant: {c.cantidad}</p>
                                                </td>
                                                <td className="px-4 py-2 text-right whitespace-nowrap">
                                                    <span className="text-[12px] font-semibold text-[#2c3434]">
                                                        {orden.moneda === 'PEN' ? 'S/' : '$'} {fmt(c.subtotal_item)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-[#f8faf9]/60 px-4 py-2.5 flex justify-between items-center">
                                <span className="text-[10px] font-semibold text-[#8b9ba5] uppercase">Total a Pagar</span>
                                <span className="text-base font-black text-[#366480]">
                                    {orden.moneda === 'PEN' ? 'S/' : '$'} {fmt(orden.monto_total)}
                                </span>
                            </div>
                        </div>

                        {/* Comprobante de Pago + Evidencia — same row */}
                        <div className="grid grid-cols-2 gap-2">

                            {/* Left: Comprobante de Pago */}
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-widest block">Comprobante de Pago</label>

                                {/* Existing comprobante links — always read-only */}
                                {facturaLinks.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                        {facturaLinks.map((url, idx) => (
                                            <a key={idx} href={url} target="_blank" rel="noreferrer"
                                                className="flex items-center gap-1.5 px-2 py-1.5 bg-white/70 border border-[#e8eded] rounded-xl hover:border-[#4A90E2] transition-all w-full">
                                                <FileText className="w-3 h-3 text-[#4A90E2] shrink-0" />
                                                <span className="text-[8px] font-semibold text-[#8b9ba5] uppercase truncate">Comp. {idx + 1}</span>
                                            </a>
                                        ))}
                                    </div>
                                )}

                                {/* Add area — clickable in both isPaid and !isPaid contexts */}
                                {comprobantePreview ? (
                                    <div className="relative h-16 w-full rounded-xl overflow-hidden border border-[#e8eded]">
                                        <img src={comprobantePreview} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-[#2c3434]/50 flex items-center justify-center gap-1.5">
                                            {isPaid && (
                                                <button onClick={handleAddComprobante} disabled={isAddingComprobante}
                                                    className="px-2 py-1 bg-[#166534] text-white rounded-lg text-[7px] font-black uppercase tracking-widest shadow-sm disabled:opacity-60"
                                                    style={FONT}>
                                                    {isAddingComprobante ? '...' : 'GUARDAR'}
                                                </button>
                                            )}
                                            <button onClick={() => { setComprobanteFile(null); setComprobantePreview(null); }}
                                                className="p-1 bg-rose-500 text-white rounded-full flex items-center justify-center">
                                                <X className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    </div>
                                ) : comprobanteFile ? (
                                    <div className="h-14 w-full rounded-xl border border-[#e8eded] bg-[#f8faf9] flex items-center justify-between px-2">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <FileText className="w-3.5 h-3.5 text-[#4A90E2] shrink-0" />
                                            <span className="text-[9px] font-semibold text-[#2c3434] truncate">{comprobanteFile.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-1">
                                            {isPaid && (
                                                <button onClick={handleAddComprobante} disabled={isAddingComprobante}
                                                    className="px-1.5 py-0.5 bg-[#166534] text-white rounded text-[7px] font-black uppercase disabled:opacity-60"
                                                    style={FONT}>
                                                    {isAddingComprobante ? '...' : 'GUARDAR'}
                                                </button>
                                            )}
                                            <button onClick={() => { setComprobanteFile(null); setComprobantePreview(null); }}
                                                className="p-0.5 bg-rose-500/80 text-white rounded-full flex items-center justify-center">
                                                <X className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => comprobanteInputRef.current?.click()}
                                        className="h-14 w-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all bg-white/70 border-[#d3dcdb] hover:border-[#4A90E2]"
                                    >
                                        <Camera className="w-3.5 h-3.5 text-[#8b9ba5] mb-0.5" />
                                        <span className="text-[7px] font-semibold uppercase tracking-widest text-[#8b9ba5]">
                                            {facturaLinks.length > 0 ? 'Agregar otro' : 'Sin Comprobante'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Right: Evidencia — multi-file */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-widest">Evidencia</label>
                                    {allEvItems.length > 0 && (
                                        <button
                                            onClick={() => evidenciaInputRef.current?.click()}
                                            className="w-5 h-5 rounded-full bg-[#f0f5f4] border border-[#e8eded] flex items-center justify-center hover:border-[#4A90E2] transition-all"
                                        >
                                            <span className="text-[11px] font-bold text-[#8b9ba5] leading-none">+</span>
                                        </button>
                                    )}
                                </div>

                                {allEvItems.length > 0 ? (
                                    <>
                                        <div className="grid grid-cols-3 gap-1">
                                            {allEvItems.map((item, idx) => (
                                                <div
                                                    key={idx}
                                                    className="relative rounded-lg overflow-hidden border border-[#e8eded] group cursor-pointer"
                                                    style={{ aspectRatio: '1' }}
                                                    onClick={() => setViewerUrl(item.url)}
                                                >
                                                    <img src={item.url} className="w-full h-full object-cover" alt="" />
                                                    <div className="absolute inset-0 bg-[#2c3434]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    {item.isPending && (
                                                        <button
                                                            onClick={e => { e.stopPropagation(); removeEvidenciaPending(item.idx!); }}
                                                            className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-rose-500/90 text-white rounded-full flex items-center justify-center z-10"
                                                        >
                                                            <X className="w-2 h-2" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {/* GUARDAR button only when isPaid and there are pending files */}
                                        {isPaid && evidenciaFiles.length > 0 && (
                                            <button
                                                onClick={handleAddEvidencia}
                                                disabled={isAddingEvidencia}
                                                className="w-full py-1.5 bg-[#166534] text-white rounded-lg text-[7px] font-black uppercase tracking-widest shadow-sm disabled:opacity-60"
                                                style={FONT}
                                            >
                                                {isAddingEvidencia ? 'GUARDANDO...' : `GUARDAR ${evidenciaFiles.length} IMG${evidenciaFiles.length > 1 ? 'S' : ''}`}
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <div
                                        onClick={() => evidenciaInputRef.current?.click()}
                                        className="h-14 w-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all bg-white/70 border-[#d3dcdb] hover:border-[#4A90E2]"
                                    >
                                        <Camera className="w-3.5 h-3.5 text-[#8b9ba5] mb-0.5" />
                                        <span className="text-[7px] font-semibold uppercase tracking-widest text-[#8b9ba5]">Sin Evidencia</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Fecha */}
                        <div>
                            <label className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-widest block mb-1">
                                Fecha de {isPaid ? 'Pago' : 'Registro'}
                            </label>
                            <input
                                type="date"
                                value={fechaPago}
                                onChange={(e) => !isPaid && setFechaPago(e.target.value)}
                                disabled={isPaid}
                                className={`w-full bg-[#f8faf9] border px-3 py-2 rounded-xl font-medium text-sm transition-all ${isPaid ? 'border-transparent text-[#8b9ba5]' : 'border-[#e8eded] focus:border-[#4A90E2] text-[#2c3434] outline-none'}`}
                                style={FONT}
                            />
                        </div>

                        {/* Origen de Fondos */}
                        <div>
                            <label className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-widest block mb-1">Origen de Fondos</label>
                            {isPaid ? (
                                <div className="px-3 py-2 bg-white/70 border border-[#e8eded] rounded-xl flex items-center justify-between">
                                    <span className="text-[12px] font-semibold uppercase text-[#2c3434]">{selectedAccount}</span>
                                    <span className="material-icons-round text-[#166534] text-base">verified</span>
                                </div>
                            ) : (
                                <div className="relative">
                                    <select
                                        value={selectedAccount}
                                        onChange={(e) => { setSelectedAccount(e.target.value); setShowError(false); }}
                                        className="w-full appearance-none px-3 py-2.5 pr-8 rounded-xl border border-[#e8eded] bg-[#f8faf9] text-[12px] font-semibold text-[#2c3434] outline-none focus:border-[#4A90E2] cursor-pointer transition-all"
                                        style={FONT}
                                    >
                                        {ACCOUNTS.map(acc => (
                                            <option key={acc} value={acc}>
                                                {acc} — DISP: S/ {fmt(balances[acc] || 0)}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8b9ba5] pointer-events-none" />
                                </div>
                            )}
                        </div>

                        {/* Voucher + N° Op */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e8eded]">
                            <div className="space-y-1">
                                <label className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-widest block">
                                    Váucher de Pago
                                    {!isPaid && <span className="ml-1 text-[#4A90E2] font-normal normal-case tracking-normal">(o Ctrl+V)</span>}
                                </label>
                                <div
                                    onClick={handleVoucherClick}
                                    className={`h-20 w-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all overflow-hidden bg-white/70 relative group ${
                                        isPaid && !voucherPreview
                                            ? 'border-[#e8eded] cursor-default'
                                            : voucherPreview
                                                ? 'border-[#e8eded] cursor-pointer'
                                                : showError && !voucherFile
                                                    ? 'border-rose-300 bg-rose-50/50 cursor-pointer'
                                                    : 'border-[#d3dcdb] hover:border-[#4A90E2] cursor-pointer'
                                    }`}
                                >
                                    {voucherPreview ? (
                                        <div className="relative w-full h-full">
                                            <img src={voucherPreview} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                            {!isPaid && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setVoucherFile(null); setVoucherPreview(null); }}
                                                    className="absolute top-1 right-1 p-1 bg-rose-500/90 text-white rounded-full shadow hover:bg-rose-600 transition-all z-10 flex items-center justify-center"
                                                >
                                                    <X className="w-2.5 h-2.5" />
                                                </button>
                                            )}
                                            <div className="absolute inset-0 bg-[#2c3434]/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="text-white text-[8px] font-semibold uppercase tracking-widest bg-[#2c3434]/60 px-2 py-1 rounded-lg">Ver</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <Camera className={`w-4 h-4 mb-0.5 ${showError && !voucherFile ? 'text-rose-400' : 'text-[#8b9ba5]'}`} />
                                            <span className={`text-[8px] font-semibold uppercase tracking-widest ${showError && !voucherFile ? 'text-rose-500' : 'text-[#8b9ba5]'}`}>
                                                {isPaid ? 'Sin Váucher' : 'Adjuntar'}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-semibold text-[#8b9ba5] uppercase tracking-widest block">N° Operación</label>
                                <input
                                    type="text"
                                    placeholder="N° XXXX"
                                    value={numOp}
                                    onChange={(e) => !isPaid && setNumOp(e.target.value.toUpperCase())}
                                    disabled={isPaid}
                                    className={`w-full h-20 bg-[#f8faf9] border-2 rounded-xl px-3 font-semibold text-center text-sm outline-none transition-all ${
                                        isPaid ? 'border-transparent text-[#166534]'
                                        : showError && !numOp ? 'border-rose-300 bg-rose-50 text-rose-600'
                                        : 'border-[#e8eded] focus:border-[#4A90E2] text-[#2c3434]'
                                    }`}
                                    style={FONT}
                                />
                            </div>
                        </div>

                        {/* Saldo resultante + Confirmar */}
                        {!isPaid && (
                            <div className="space-y-2 pt-1">
                                <div className={`px-4 py-3 rounded-xl flex items-center justify-between border ${isInsufficient ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-[#e0f2fe]/60 border-[#bbf7d0] text-[#366480]'}`}>
                                    <div>
                                        <span className="text-[9px] font-semibold uppercase tracking-widest opacity-70 block">Saldo Resultante</span>
                                        <span className="text-base font-black tabular-nums">S/ {fmt(remainingBalance)}</span>
                                    </div>
                                    {isInsufficient && (
                                        <span className="text-[9px] font-semibold uppercase bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full tracking-widest">
                                            Fondos Insuficientes
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={handleConfirm}
                                    disabled={submitting || isInsufficient}
                                    className={`w-full font-black py-3.5 px-6 rounded-2xl shadow-lg transition-all uppercase tracking-widest text-[10px] border-b-4 flex items-center justify-center gap-2 ${
                                        submitting || isInsufficient
                                            ? 'bg-[#e8eded] border-[#d3dcdb] shadow-none cursor-not-allowed text-[#8b9ba5]'
                                            : 'bg-[#166534] border-[#14532d] text-white hover:bg-[#14532d] shadow-[#166534]/20 active:translate-y-px'
                                    }`}
                                    style={FONT}
                                >
                                    {submitting ? 'PROCESANDO...' : 'CONFIRMAR Y REGISTRAR PAGO'}
                                </button>
                                <button onClick={onClose} className="w-full py-1 text-[8px] font-semibold text-[#8b9ba5] uppercase tracking-widest hover:text-rose-500 transition-colors" style={FONT}>
                                    Cerrar
                                </button>
                            </div>
                        )}

                        {isPaid && (
                            <button
                                onClick={onClose}
                                className="w-full bg-[#f8faf9] border border-[#e8eded] text-[#8b9ba5] hover:bg-[#e8eded] font-semibold py-3.5 rounded-2xl uppercase tracking-widest text-sm active:scale-95 transition-all"
                                style={FONT}
                            >
                                Cerrar Detalles
                            </button>
                        )}
                    </div>

                    {/* Hidden file inputs */}
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                    <input ref={comprobanteInputRef} type="file" accept="image/*,.pdf" onChange={handleComprobanteFileChange} className="hidden" />
                    <input ref={evidenciaInputRef} type="file" accept="image/*" multiple onChange={handleEvidenciaFileChange} className="hidden" />
                </div>
            </div>
        </>
    );
};
