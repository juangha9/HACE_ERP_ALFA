import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, FileText, ImagePlus, Save, Calculator, CheckCircle2, ZoomIn, AlertTriangle, Hash, AlertCircle, MessageSquare, Building2, AlignLeft } from 'lucide-react';
import { api } from '../services/api';
import type { NodrizaTesoreria, EgresoDetalleFactura } from '../services/types';

interface InvoiceAssignmentModalProps {
    egreso: NodrizaTesoreria;
    onClose: () => void;
    onSuccess: () => Promise<void>;
}

const UNITS = ['NIU', 'ZZ', 'UND', 'KG', 'M2', 'MTS', 'ML', 'SERV', 'PLS', 'GLN', 'HRS', 'JGO', 'SET', 'PZA', 'M3', 'TN', 'LT', '%'];

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

export const InvoiceAssignmentModal: React.FC<InvoiceAssignmentModalProps> = ({ egreso, onClose, onSuccess }) => {
    const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
    const [invoicePreview, setInvoicePreview] = useState<string | null>(egreso.invoice_url || null);
    const [serie, setSerie] = useState(egreso.invoice_serie || '');
    const [correlativo, setCorrelativo] = useState(egreso.invoice_correlativo || '');
    const [breakdown, setBreakdown] = useState<EgresoDetalleFactura[]>([]);
    const [isLoadingItems, setIsLoadingItems] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [zoomImage, setZoomImage] = useState(false);
    const [triedSubmit, setTriedSubmit] = useState(false);

    const [incIgv, setIncIgv] = useState(true);
    const [newRowQty, setNewRowQty] = useState('');
    const [newRowUnit, setNewRowUnit] = useState('NIU');
    const [newRowDesc, setNewRowDesc] = useState('');
    const [newRowPrice, setNewRowPrice] = useState('');

    const [proveedorNombre, setProveedorNombre] = useState(egreso.proveedor_nombre || '');
    const [showMismatchPopup, setShowMismatchPopup] = useState(false);
    const [mismatchReason, setMismatchReason] = useState(egreso.mismatch_reason || '');
    const [showFinalConfirm, setShowFinalConfirm] = useState(false);

    const isEditingLocked = egreso.invoice_status === 'REGISTRADO';

    const invoiceInputRef = useRef<HTMLInputElement>(null);
    const qtyInputRef = useRef<HTMLInputElement>(null);

    // Load existing line items from the dedicated table
    useEffect(() => {
        api.getEgresoDetalles(egreso.id)
            .then(items => setBreakdown(items))
            .catch(() => setBreakdown([]))
            .finally(() => setIsLoadingItems(false));
    }, [egreso.id]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => onClose(), 280);
    };

    useEffect(() => {
        const handlePaste = async (event: ClipboardEvent) => {
            if (isEditingLocked) return;
            const items = event.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        try {
                            const webpFile = await convertToWebP(file);
                            setInvoiceFile(webpFile);
                            setInvoicePreview(URL.createObjectURL(webpFile));
                        } catch (err) { console.error('Paste error', err); }
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [isEditingLocked]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const webp = await convertToWebP(file);
        setInvoiceFile(webp);
        setInvoicePreview(URL.createObjectURL(webp));
    };

    // New row computed totals
    const q = Number(newRowQty) || 0;
    const p = Number(newRowPrice) || 0;
    const rawTotal = q * p;
    let newBaseAmt = 0, newIgvAmt = 0, newFinalTotal = 0;
    if (incIgv) {
        newFinalTotal = rawTotal; newBaseAmt = newFinalTotal / 1.18; newIgvAmt = newFinalTotal - newBaseAmt;
    } else {
        newBaseAmt = rawTotal; newIgvAmt = newBaseAmt * 0.18; newFinalTotal = newBaseAmt + newIgvAmt;
    }
    const newVU = q > 0 ? newBaseAmt / q : 0;

    const addItem = () => {
        if (!newRowQty || !newRowPrice || q <= 0 || p <= 0) return;
        const newItem: EgresoDetalleFactura = {
            egreso_id: egreso.id,
            sort_order: breakdown.length,
            qty: q,
            unit: newRowUnit,
            description: newRowDesc.trim().toUpperCase(),
            v_unitario: newVU,
            base_amount: newBaseAmt,
            igv_amount: newIgvAmt,
            amount: newFinalTotal,
            inc_igv: incIgv,
        };
        setBreakdown(prev => [...prev, newItem]);
        setNewRowQty(''); setNewRowDesc(''); setNewRowPrice(''); setNewRowUnit('NIU');
        setTimeout(() => qtyInputRef.current?.focus(), 50);
    };

    const removeItem = (idx: number) =>
        setBreakdown(prev => prev.filter((_, i) => i !== idx));

    const totalInvoiced = useMemo(() => breakdown.reduce((s, i) => s + i.amount, 0), [breakdown]);
    const totalBaseAmount = useMemo(() => breakdown.reduce((s, i) => s + i.base_amount, 0), [breakdown]);
    const totalIgvAmount = useMemo(() => breakdown.reduce((s, i) => s + i.igv_amount, 0), [breakdown]);

    // Live error flags
    const errImage = triedSubmit && !invoicePreview;
    const errSerie = triedSubmit && !serie.trim();
    const errCorrelativo = triedSubmit && !correlativo.trim();
    const errFields = errSerie || errCorrelativo;

    const validateAndSave = () => {
        setTriedSubmit(true);
        if (!invoicePreview || !serie.trim() || !correlativo.trim()) return;
        const difference = Math.abs(totalInvoiced - egreso.monto);
        if (difference > 0.05 && !mismatchReason) { setShowMismatchPopup(true); return; }
        setShowFinalConfirm(true);
    };

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            let finalInvoiceUrl = egreso.invoice_url;
            if (invoiceFile) finalInvoiceUrl = await api.uploadInvoice(invoiceFile, `INV_${serie}_${correlativo}`);

            // Save line items to dedicated table
            await api.saveEgresoDetalles(egreso.id, breakdown);

            // Update summary in nodriza_tesoreria
            await api.updateTesoreriaMovement(egreso.id, {
                invoice_url: finalInvoiceUrl,
                invoice_serie: serie.toUpperCase(),
                invoice_correlativo: correlativo,
                mismatch_reason: mismatchReason || null,
                invoice_subtotal: totalBaseAmount,
                invoice_igv: totalIgvAmount,
                invoice_total: totalInvoiced,
                has_invoice: true,
                invoice_status: 'REGISTRADO',
                proveedor_nombre: proveedorNombre.trim() || null,
            } as Partial<NodrizaTesoreria>);

            // Audit log
            const auditDetalle = `S/ ${totalInvoiced.toFixed(2)} · Serie: ${serie.toUpperCase()}-${correlativo}` +
                (proveedorNombre.trim() ? ` · Proveedor: ${proveedorNombre.trim()}` : '');
            await api.logEgresoAudit(egreso.id, 'FACTURA_REGISTRADA', auditDetalle);

            await onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error al guardar la factura:', error);
            alert('Error al guardar: ' + (error.message || 'Error desconocido'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const difference = egreso.monto - totalInvoiced;
    const isBalanced = Math.abs(difference) < 0.05;

    return (
        <div
            className={`treasury-ui fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/25 overflow-hidden font-manrope ${isClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
            style={{ backdropFilter: 'blur(8px)', fontFamily: "'Manrope', sans-serif" }}
        >
            {/* Zoom overlay */}
            {zoomImage && invoicePreview && (
                <div onClick={() => setZoomImage(false)} className="fixed inset-0 z-[2100] bg-[#2c3434]/95 flex items-center justify-center p-10 cursor-zoom-out animate-in zoom-in-95 duration-200">
                    <img src={invoicePreview} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-white/10" alt="Preview Full" />
                    <button className="absolute top-10 right-10 p-4 bg-white/10 hover:bg-rose-500 rounded-full text-white transition-all"><X className="w-6 h-6" /></button>
                </div>
            )}

            {/* Mismatch popup */}
            {showMismatchPopup && (
                <div className="fixed inset-0 z-[2100] bg-[#2c3434]/60 backdrop-blur-md flex items-center justify-center p-10 animate-in zoom-in-95 duration-200">
                    <div className="bg-white w-full max-w-lg rounded-3xl p-7 shadow-2xl border border-[#d3dcdb]/50 flex flex-col gap-6" style={{ fontFamily: "'Manrope', sans-serif" }}>
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center border-2 border-white shadow-md animate-bounce">
                                <AlertTriangle className="w-7 h-7 text-amber-500" />
                            </div>
                            <h2 className="text-lg font-medium text-slate-900 uppercase tracking-tight italic">ALERTA DE DESCUADRE</h2>
                            <p className="text-xs font-medium text-slate-500 leading-relaxed uppercase tracking-tight">
                                El monto de la factura (S/ {totalInvoiced.toFixed(2)}) no coincide con el egreso (S/ {egreso.monto.toFixed(2)}). Justifique el descuadre para continuar.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-medium text-[#366480] uppercase tracking-wider pl-1">Razón / Justificación</label>
                            <div className="relative">
                                <MessageSquare className="absolute left-4 top-4 w-4 h-4 text-slate-400" />
                                <textarea
                                    placeholder="Escriba aquí el motivo del descuadre..."
                                    value={mismatchReason}
                                    onChange={(e) => setMismatchReason(e.target.value)}
                                    className="w-full bg-[#f7faf9] p-4 pl-11 rounded-2xl border border-[#d3dcdb] focus:border-[#4A90E2] outline-none text-xs font-medium text-slate-800 min-h-[100px] shadow-inner resize-none transition-all"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowMismatchPopup(false)} className="flex-1 py-3 text-[10px] font-medium text-slate-400 uppercase tracking-widest hover:text-slate-900 rounded-xl hover:bg-[#f7faf9] transition-all">
                                Regresar
                            </button>
                            <button
                                onClick={() => { setShowMismatchPopup(false); handleSave(); }}
                                disabled={!mismatchReason.trim() || isSubmitting}
                                className="flex-1 py-3 bg-[#4A90E2] hover:bg-[#357abd] text-white rounded-xl text-[10px] font-medium uppercase tracking-widest shadow-lg disabled:opacity-30 transition-all"
                            >
                                Confirmar y Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div
                className={`bg-white/95 rounded-3xl shadow-[0_30px_60px_rgba(44,52,52,0.15)] w-full max-w-4xl border border-white/50 flex flex-col max-h-[90vh] relative overflow-hidden font-manrope ${isClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}
                style={{ fontFamily: "'Manrope', sans-serif" }}
            >
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                {/* HEADER */}
                <div className="px-6 py-4 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#4A90E2]/10 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-[#4A90E2] shrink-0" />
                        </div>
                        <div>
                            <h2 className="text-sm font-medium text-[#366480] uppercase tracking-wider leading-tight">Gestión de Factura</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-medium text-[#4A90E2] tabular-nums">S/ {egreso.monto.toFixed(2)}</span>
                                <div className="w-1 h-1 rounded-full bg-[#d3dcdb]"></div>
                                <span className="text-[9.5px] font-medium text-[#8b9ba5] uppercase tracking-wider">{egreso.cuenta_origen}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={handleClose} className="w-8 h-8 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all z-20">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar space-y-5">

                    {/* TOP: Document image + Serie/Correlativo + Monto */}
                    <div className="grid grid-cols-2 gap-4 items-stretch">
                        <div className="flex flex-col gap-2">
                            <label className="text-[9.5px] font-medium text-[#366480] uppercase tracking-wider leading-none pl-1 flex items-center gap-2">
                                Documento Sustentatorio
                                {errImage && <span className="text-rose-500 font-bold normal-case tracking-normal text-[9px]">* Obligatorio</span>}
                            </label>
                            <div className="grid grid-cols-2 gap-3 h-28">
                                {/* Image */}
                                <div className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center overflow-hidden relative group transition-all ${errImage ? 'border-rose-400 bg-rose-50/40' : 'border-[#d3dcdb] bg-[#f7faf9]/50'}`}>
                                    {invoicePreview ? (
                                        <div className="w-full h-full relative">
                                            <img src={invoicePreview} onClick={() => setZoomImage(true)} className="w-full h-full object-contain p-1.5 cursor-zoom-in group-hover:scale-[1.02] transition-transform" alt="Factura" />
                                            <div className="absolute top-1.5 right-1.5 flex gap-1">
                                                <button onClick={() => setZoomImage(true)} className="p-1 bg-[#2c3434]/80 text-white rounded-lg shadow-md hover:bg-[#4A90E2] opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"><ZoomIn className="w-3.5 h-3.5" /></button>
                                                {!isEditingLocked && <button onClick={() => { setInvoiceFile(null); setInvoicePreview(null); }} className="p-1 bg-rose-600 text-white rounded-lg shadow-md hover:bg-rose-700 opacity-0 group-hover:opacity-100 transition-all"><X className="w-3.5 h-3.5" /></button>}
                                            </div>
                                        </div>
                                    ) : (
                                        <div onClick={() => !isEditingLocked && invoiceInputRef.current?.click()} className={`w-full h-full flex flex-col items-center justify-center gap-1.5 transition-all ${!isEditingLocked ? 'cursor-pointer hover:bg-white' : 'cursor-not-allowed'}`}>
                                            <ImagePlus className={`w-5 h-5 transition-colors ${errImage ? 'text-rose-400' : 'text-[#8b9ba5] group-hover:text-[#4A90E2]'}`} />
                                            <span className={`text-[8px] font-medium uppercase tracking-wider ${errImage ? 'text-rose-400' : 'text-[#8b9ba5]'}`}>
                                                {isEditingLocked ? 'BLOQUEADA' : 'Pegar (Ctrl+V) o clic'}
                                            </span>
                                        </div>
                                    )}
                                    <input ref={invoiceInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                                </div>

                                {/* Serie + Correlativo */}
                                <div className={`flex flex-col gap-2 p-3 rounded-xl border justify-center transition-all ${errFields ? 'border-rose-400 bg-rose-50/30' : 'border-[#d3dcdb] bg-[#f7faf9]/70'}`}>
                                    <div className="space-y-0.5">
                                        <label className="text-[8px] font-medium uppercase pl-1 block flex items-center gap-1" style={{ color: errSerie ? '#ef4444' : '#366480' }}>
                                            Serie {errSerie && <span className="text-rose-500">*</span>}
                                        </label>
                                        <div className="relative">
                                            <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-[#8b9ba5]" />
                                            <input
                                                type="text" placeholder="F001" value={serie}
                                                disabled={isEditingLocked}
                                                onChange={(e) => setSerie(e.target.value.toUpperCase())}
                                                style={{ borderColor: errSerie ? '#f87171' : undefined }}
                                                className={`w-full h-8 bg-white pl-7 pr-2 rounded-lg text-[10px] font-medium text-slate-800 outline-none border uppercase shadow-sm disabled:opacity-50 transition-all ${errSerie ? 'border-rose-400' : 'border-gray-200 focus:border-[#4A90E2]'}`}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-0.5">
                                        <label className="text-[8px] font-medium uppercase pl-1 block flex items-center gap-1" style={{ color: errCorrelativo ? '#ef4444' : '#366480' }}>
                                            Correlativo {errCorrelativo && <span className="text-rose-500">*</span>}
                                        </label>
                                        <div className="relative">
                                            <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-[#8b9ba5]" />
                                            <input
                                                type="text" placeholder="000123" value={correlativo}
                                                disabled={isEditingLocked}
                                                onChange={(e) => setCorrelativo(e.target.value.replace(/\D/g, ''))}
                                                style={{ borderColor: errCorrelativo ? '#f87171' : undefined }}
                                                className={`w-full h-8 bg-white pl-7 pr-2 rounded-lg text-[10px] font-medium text-slate-800 outline-none border uppercase shadow-sm disabled:opacity-50 transition-all ${errCorrelativo ? 'border-rose-400' : 'border-gray-200 focus:border-[#4A90E2]'}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[9.5px] font-medium text-[#366480] uppercase tracking-wider pl-1 leading-none">Monto Egresado de Cuenta</label>
                            <div className="h-28 bg-[#f7faf9] px-4 py-3 rounded-xl border border-[#d3dcdb] flex flex-col justify-center gap-1.5 shadow-sm">
                                <div className="text-2xl font-medium text-[#366480] tabular-nums tracking-tight">S/ {egreso.monto.toFixed(2)}</div>
                                <div className="w-8 h-1 bg-[#4A90E2] rounded-full"></div>
                                {egreso.observaciones && (
                                    <p className="text-[8px] font-medium text-[#8b9ba5] uppercase tracking-wide leading-snug line-clamp-2" title={egreso.observaciones}>
                                        Ref: {egreso.observaciones}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* DESCRIPCIÓN DE REFERENCIA + PROVEEDOR */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Descripción del egreso (solo referencia, no va en factura) */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9.5px] font-medium text-[#366480] uppercase tracking-wider pl-1 leading-none flex items-center gap-1.5">
                                <AlignLeft className="w-3 h-3" /> Descripción / Ref. del Egreso
                                <span className="ml-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-[8px] font-medium text-amber-600 uppercase tracking-wider">Solo referencia</span>
                            </label>
                            <div className="bg-[#f7faf9] border border-[#d3dcdb] rounded-xl px-3 py-2.5 min-h-[52px]">
                                {Array.isArray(egreso.invoice_details) && egreso.invoice_details.length > 0 ? (
                                    <ul className="space-y-1">
                                        {egreso.invoice_details.map((item: any, idx: number) => (
                                            <li key={idx} className="flex items-start gap-1.5 text-[10.5px] font-medium text-[#366480] leading-snug italic">
                                                <span className="text-[#4A90E2] shrink-0 mt-px select-none">·</span>
                                                <span className="whitespace-pre-wrap">{item.description}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : egreso.observaciones ? (
                                    <p className="text-[10.5px] font-medium text-[#366480] leading-snug italic">{egreso.observaciones}</p>
                                ) : (
                                    <p className="text-[10.5px] italic text-[#b0bcc4]">Sin descripción registrada</p>
                                )}
                            </div>
                        </div>

                        {/* Proveedor */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9.5px] font-medium text-[#366480] uppercase tracking-wider pl-1 leading-none flex items-center gap-1.5">
                                <Building2 className="w-3 h-3" /> Proveedor / Razón Social
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8b9ba5]" />
                                <input
                                    type="text"
                                    placeholder={isEditingLocked ? '—' : 'Ej: Distribuidora XYZ S.A.C.'}
                                    value={proveedorNombre}
                                    disabled={isEditingLocked}
                                    onChange={(e) => setProveedorNombre(e.target.value.toUpperCase())}
                                    className="w-full h-[52px] bg-white pl-8 pr-3 rounded-xl border border-[#d3dcdb] text-[10.5px] font-medium text-slate-800 outline-none focus:border-[#4A90E2] uppercase shadow-sm disabled:opacity-60 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* DETALLE DE FACTURA */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[9.5px] font-medium text-[#366480] uppercase tracking-wider pl-1 leading-none flex items-center gap-1.5">
                                <Calculator className="w-3.5 h-3.5" /> Detalle de Factura
                            </label>
                            {!isEditingLocked && (
                                <div className="flex bg-white p-0.5 rounded-lg border border-[#d3dcdb] shadow-inner">
                                    <button onClick={() => setIncIgv(true)} className={`px-3 py-1 rounded-md text-[8.5px] font-medium transition-all ${incIgv ? 'bg-[#4A90E2] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>CON IGV</button>
                                    <button onClick={() => setIncIgv(false)} className={`px-3 py-1 rounded-md text-[8.5px] font-medium transition-all ${!incIgv ? 'bg-[#366480] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>SIN IGV</button>
                                </div>
                            )}
                        </div>

                        <div className="border-2 border-gray-600 overflow-hidden">
                            <table className="w-full border-collapse" style={{ fontFamily: "'Courier New', monospace", fontSize: '11px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#e8e8e8', borderBottom: '2px solid #555' }}>
                                        <th style={{ border: '1px solid #aaa', padding: '6px 6px', textAlign: 'center', fontSize: '9px', fontWeight: 900, width: '50px' }}>CANT.</th>
                                        <th style={{ border: '1px solid #aaa', padding: '6px 6px', textAlign: 'center', fontSize: '9px', fontWeight: 900, width: '52px' }}>U.M.</th>
                                        <th style={{ border: '1px solid #aaa', padding: '6px 8px', textAlign: 'left', fontSize: '9px', fontWeight: 900 }}>DESCRIPCIÓN</th>
                                        <th style={{ border: '1px solid #aaa', padding: '6px 8px', textAlign: 'right', fontSize: '9px', fontWeight: 900, width: '88px' }}>V. UNITARIO</th>
                                        <th style={{ border: '1px solid #aaa', padding: '6px 8px', textAlign: 'right', fontSize: '9px', fontWeight: 900, width: '88px' }}>IMPORTE</th>
                                        {!isEditingLocked && <th style={{ border: '1px solid #aaa', width: '28px', backgroundColor: '#f0f0f0' }}></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoadingItems ? (
                                        <tr><td colSpan={isEditingLocked ? 5 : 6} style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '10px', border: '1px solid #ddd' }}>Cargando...</td></tr>
                                    ) : breakdown.length === 0 ? (
                                        <tr><td colSpan={isEditingLocked ? 5 : 6} style={{ padding: '24px', textAlign: 'center', color: '#aaa', fontStyle: 'italic', fontSize: '10px', border: '1px solid #ddd' }}>Sin ítems. Ingrese las líneas tal como aparecen en la factura.</td></tr>
                                    ) : breakdown.map((item, idx) => (
                                        <tr key={idx} className="group" style={{ borderBottom: '1px solid #e0e0e0' }}>
                                            <td style={{ border: '1px solid #ddd', padding: '5px 6px', textAlign: 'center', fontWeight: 500, color: '#222' }}>
                                                {item.qty.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                                            </td>
                                            <td style={{ border: '1px solid #ddd', padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: '#333', fontSize: '9px', letterSpacing: '0.05em' }}>
                                                {item.unit}
                                            </td>
                                            <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'left', fontWeight: 500, color: '#222', textTransform: 'uppercase', lineHeight: 1.35 }}>
                                                {item.description || <em style={{ color: '#bbb', fontStyle: 'italic' }}>—</em>}
                                            </td>
                                            <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right', color: '#444' }}>
                                                {item.v_unitario.toFixed(3)}
                                            </td>
                                            <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#111' }}>
                                                {item.amount.toFixed(2)}
                                            </td>
                                            {!isEditingLocked && (
                                                <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center', backgroundColor: '#fafafa' }}>
                                                    <button onClick={() => removeItem(idx)} className="p-1 text-gray-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 rounded">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>

                                {!isEditingLocked && (
                                    <tfoot>
                                        <tr style={{ backgroundColor: '#f0f0f0', borderTop: '2px solid #aaa' }}>
                                            <td style={{ border: '1px solid #bbb', padding: '4px 3px' }}>
                                                <input
                                                    ref={qtyInputRef}
                                                    type="number" value={newRowQty}
                                                    onChange={e => setNewRowQty(e.target.value)}
                                                    placeholder="0" min="0"
                                                    className="w-full h-7 bg-white border border-gray-300 rounded px-1 text-[10px] font-medium text-center outline-none focus:border-blue-400 tabular-nums"
                                                />
                                            </td>
                                            <td style={{ border: '1px solid #bbb', padding: '4px 3px' }}>
                                                <select
                                                    value={newRowUnit} onChange={e => setNewRowUnit(e.target.value)}
                                                    className="w-full h-7 bg-white border border-gray-300 rounded px-1 text-[9px] font-bold text-center outline-none focus:border-blue-400 appearance-none cursor-pointer"
                                                >
                                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                            </td>
                                            <td style={{ border: '1px solid #bbb', padding: '4px 3px' }}>
                                                <input
                                                    type="text" value={newRowDesc}
                                                    onChange={e => setNewRowDesc(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                                                    placeholder="Descripción tal como aparece en la factura..."
                                                    className="w-full h-7 bg-white border border-gray-300 rounded px-2 text-[10px] font-medium outline-none focus:border-blue-400 uppercase placeholder:normal-case placeholder:text-gray-400"
                                                />
                                            </td>
                                            <td style={{ border: '1px solid #bbb', padding: '4px 3px' }}>
                                                <input
                                                    type="number" value={newRowPrice}
                                                    onChange={e => setNewRowPrice(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' || e.key === 'Tab') {
                                                            e.preventDefault();
                                                            addItem();
                                                        }
                                                    }}
                                                    placeholder="0.000" min="0" step="0.001"
                                                    className="w-full h-7 bg-white border border-gray-300 rounded px-1 text-[10px] font-medium text-right outline-none focus:border-blue-400 tabular-nums"
                                                />
                                            </td>
                                            <td style={{ border: '1px solid #bbb', padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: newFinalTotal > 0 ? '#1a6ab5' : '#bbb', fontFamily: 'monospace', fontSize: '11px' }}>
                                                {newFinalTotal > 0 ? newFinalTotal.toFixed(2) : '—'}
                                            </td>
                                            {/* No + button — Tab/Enter on price auto-adds */}
                                            <td style={{ border: '1px solid #bbb', padding: '4px', backgroundColor: '#e8e8e8' }}></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>

                            {/* SUNAT Totals */}
                            {breakdown.length > 0 && (
                                <div style={{ borderTop: '2px solid #555', backgroundColor: '#fff', padding: '10px 16px' }}>
                                    <div className="flex justify-end">
                                        <div style={{ minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: "'Courier New', monospace", fontSize: '11px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e0e0e0', paddingBottom: '3px' }}>
                                                <span style={{ fontWeight: 600, color: '#666', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.05em' }}>Gravada S/</span>
                                                <span style={{ fontWeight: 600, color: '#333' }}>{totalBaseAmount.toFixed(2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e0e0e0', paddingBottom: '3px' }}>
                                                <span style={{ fontWeight: 600, color: '#666', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.05em' }}>IGV 18 % S/</span>
                                                <span style={{ fontWeight: 600, color: '#333' }}>{totalIgvAmount.toFixed(2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
                                                <span style={{ fontWeight: 900, color: '#111', textTransform: 'uppercase', fontSize: '12px' }}>TOTAL S/</span>
                                                <span style={{ fontWeight: 900, color: '#111', fontSize: '14px' }}>{totalInvoiced.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {!isEditingLocked && (
                            <p className="text-[8.5px] font-medium text-[#8b9ba5] pl-1 italic">
                                * Modo: <strong className="text-[#366480]">{incIgv ? 'CON IGV' : 'SIN IGV'}</strong> — el precio ingresado se interpreta {incIgv ? 'con IGV incluido (V.U. = precio ÷ 1.18)' : 'sin IGV'}. Tab o Enter desde V. UNITARIO agrega la fila automáticamente.
                            </p>
                        )}
                    </div>
                </div>

                {/* FOOTER */}
                <div className="px-6 py-4 border-t border-[#d3dcdb]/30 flex justify-between items-center bg-white/40 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${breakdown.length === 0 ? 'bg-gray-300' : isBalanced ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`}></div>
                        <p className="text-[9.5px] font-medium text-slate-500 uppercase italic leading-none">
                            {breakdown.length === 0
                                ? 'Ingrese el detalle de la factura'
                                : isBalanced
                                    ? 'Documento cuadrado con el egreso'
                                    : `Diferencia con egreso: S/ ${difference.toFixed(2)}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleClose} className="px-4 py-2 text-[10px] font-medium text-slate-400 hover:text-rose-500 uppercase tracking-wider transition-all">Cancelar</button>
                        {!isEditingLocked && (
                            <button
                                onClick={validateAndSave}
                                disabled={isSubmitting}
                                className="px-6 py-2.5 rounded-xl text-[10px] font-medium uppercase tracking-wider transition-all shadow-lg flex items-center gap-2 bg-[#4A90E2] text-white hover:bg-[#357abd] active:scale-95 disabled:opacity-50"
                            >
                                {isSubmitting ? 'GUARDANDO...' : 'Finalizar Gestión'}<Save className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {isEditingLocked && (
                            <div className="bg-emerald-50 text-emerald-600 px-4 py-2.5 rounded-xl text-[10px] font-medium uppercase tracking-wider border border-emerald-100 flex items-center gap-2 shadow-sm">
                                <CheckCircle2 className="w-3.5 h-3.5" /> GESTIÓN FINALIZADA
                            </div>
                        )}
                    </div>
                </div>

                {/* Final confirm dialog */}
                {showFinalConfirm && (
                    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
                        <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200" style={{ fontFamily: "'Manrope', sans-serif" }}>
                            <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="w-7 h-7 text-amber-500" />
                            </div>
                            <h3 className="text-base font-medium text-slate-800 text-center uppercase tracking-tight mb-2">¿Confirmar Gestión?</h3>
                            <p className="text-[11px] font-normal text-slate-400 text-center uppercase tracking-wider leading-relaxed mb-6">
                                Al marcar como <span className="text-[#366480] font-medium">REGISTRADO</span>, esta factura se bloqueará y <span className="text-rose-500 font-medium">no podrá ser editada</span>.
                            </p>
                            <div className="flex flex-col gap-2">
                                <button onClick={handleSave} disabled={isSubmitting} className="w-full py-3 bg-[#4A90E2] hover:bg-[#357abd] text-white rounded-xl text-[11px] font-medium uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-50">
                                    {isSubmitting ? 'Guardando...' : 'Sí, finalizar y bloquear'}
                                </button>
                                <button onClick={() => setShowFinalConfirm(false)} className="w-full py-3 bg-[#f7faf9] text-slate-400 hover:text-slate-600 rounded-xl text-[11px] font-medium uppercase tracking-widest transition-all">
                                    No, seguir editando
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
