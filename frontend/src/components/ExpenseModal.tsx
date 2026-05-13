import React, { useState, useRef, useEffect } from 'react';
import { TrendingDown, Camera, X, FileSearch, Search, ImagePlus, Building2, Package, Users, Car, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Calculator } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { api } from '../services/api';
import type { Project, ProjectItem } from '../services/types';

const BANK_ACCOUNTS = ['2049/YAPE', '4071', '9001', '8059'];

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


interface ExpenseModalProps {
    onClose: () => void;
    onSuccess: () => Promise<void>;
    calculateGlobalBalance: (account: string) => number;
    formatCurrency: (n: number | string) => string;
    initialData?: { monto: string, categoria: string, cuenta: string, desc: string };
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ 
    onClose, 
    onSuccess, 
    calculateGlobalBalance, 
    formatCurrency,
    initialData
}) => {
    // --- LOCAL STATE ---
    const [gastoData, setGastoData] = useState(initialData || { 
        monto: '', 
        categoria: 'Luz', 
        cuenta: 'Efectivo', 
        desc: '' 
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    
    // Traceability fields
    const [numOp, setNumOp] = useState('');
    const [voucherFile, setVoucherFile] = useState<File | null>(null);
    const [voucherPreview, setVoucherPreview] = useState<string | null>(null);
    const [showError, setShowError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const invoiceInputRef = useRef<HTMLInputElement>(null);

    // --- NEW: Invoice State ---
    const [hasInvoice, setHasInvoice] = useState(false);
    const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
    const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
    const [invoiceBreakdown, setInvoiceBreakdown] = useState<any[]>([]);

    // Project Integration State
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);

    const isTraceabilityRequired = gastoData.cuenta !== 'Efectivo' && gastoData.categoria !== 'Ajuste de Caja';

    // Fetch initial projects
    useEffect(() => {
        const fetchProjects = async () => {
            setIsLoadingProjects(true);
            try {
                const all = await api.getProjects();
                setProjects(all.filter(p => p.status === 'INICIO' || p.status === 'EN_EJECUCION'));
            } catch (err) {
                console.error("Error fetching projects:", err);
            } finally {
                setIsLoadingProjects(false);
            }
        };
        fetchProjects();
    }, []);

    useScrollLock(true);

    // Global Paste handler
    useEffect(() => {
        const handlePaste = async (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        try {
                            const webpFile = await convertToWebP(file);
                            // If user is focused on invoice section, prioritize invoice
                            if (hasInvoice && !invoiceFile) {
                                setInvoiceFile(webpFile);
                                setInvoicePreview(URL.createObjectURL(webpFile));
                            } else if (isTraceabilityRequired && !voucherFile) {
                                setVoucherFile(webpFile);
                                setVoucherPreview(URL.createObjectURL(webpFile));
                            }
                        } catch (err) {
                            console.error("Paste error", err);
                        }
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [isTraceabilityRequired, hasInvoice, invoiceFile, voucherFile]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'voucher' | 'invoice') => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const webp = await convertToWebP(file);
            if (type === 'voucher') {
                setVoucherFile(webp); setVoucherPreview(URL.createObjectURL(webp));
            } else {
                setInvoiceFile(webp); setInvoicePreview(URL.createObjectURL(webp));
            }
        } catch {
             if (type === 'voucher') {
                setVoucherFile(file); setVoucherPreview(URL.createObjectURL(file));
            } else {
                setInvoiceFile(file); setInvoicePreview(URL.createObjectURL(file));
            }
        }
    };

    const addBreakdownItem = () => {
        if (!hasInvoice || !gastoData.monto) return;
        
        const newItem = {
            id: crypto.randomUUID(),
            type: 'GENERAL',
            category: gastoData.categoria,
            description: gastoData.desc || 'Gasto General',
            amount: Number(gastoData.monto)
        };
        
        setInvoiceBreakdown([...invoiceBreakdown, newItem]);
        setGastoData(prev => ({ ...prev, monto: '', desc: '' }));
    };

    const removeBreakdownItem = (id: string) => {
        setInvoiceBreakdown(invoiceBreakdown.filter(i => i.id !== id));
    };

    const totalInvoiceAmount = invoiceBreakdown.reduce((sum, item) => sum + item.amount, 0);

    const handleConfirmGasto = async () => {
        const finalMonto = hasInvoice ? totalInvoiceAmount : Number(gastoData.monto);
        if (!finalMonto || isSubmitting) return;
        
        // --- STRIKER VALIDATION ---
        if (isTraceabilityRequired && (!numOp || !voucherFile)) {
            setShowError(true);
            alert("Para pagos bancarios, el Váucher y el Nro. de Operación son obligatorios.");
            return;
        }
        // Invoice breakdown is required if hasInvoice is active, but the image is OPTIONAL
        if (hasInvoice && invoiceBreakdown.length === 0) {
            alert("Debe agregar al menos un concepto al desglose de la factura.");
            return;
        }

        setIsSubmitting(true);
        try {
            let voucherUrl = null;
            let invoiceUrl = null;

            if (voucherFile) {
                voucherUrl = await api.uploadVoucher(voucherFile, `EGRESO_${gastoData.categoria.toUpperCase()}`);
            }
            if (invoiceFile) {
                invoiceUrl = await api.uploadInvoice(invoiceFile, `FACTURA_${numOp || 'SIN_OP'}`);
            }

            // Create main Treasury Movement
            await api.createTesoreriaMovement({
                monto: finalMonto,
                tipo_movimiento: 'EGRESO',
                cuenta_origen: gastoData.cuenta,
                categoria: gastoData.categoria, // Keep original category (Luz, Orden de Compra, etc.)
                observaciones: hasInvoice ? `Factura vinculada a ${invoiceBreakdown.length} items. ${gastoData.desc}` : gastoData.desc,
                numero_operacion: numOp || null,
                voucher_url: voucherUrl,
                has_invoice: hasInvoice,
                invoice_url: invoiceUrl,
                invoice_details: hasInvoice ? invoiceBreakdown : null,
                invoice_status: 'BORRADOR',
                referencia_id: (gastoData.categoria === 'REQUERIMIENTO DE COMPRA' && !hasInvoice) ? selectedProject?.id : null
            });

            await onSuccess();
            handleClose();
        } catch (error) {
            console.error(error);
            alert("Error al registrar egreso.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const currentBalance = calculateGlobalBalance(gastoData.cuenta);
    const totalToSpend = hasInvoice ? totalInvoiceAmount : Number(gastoData.monto);
    const hasInsufficientFunds = gastoData.categoria !== 'Ajuste de Caja' && totalToSpend > currentBalance;

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
        }, 300);
    };

    return (
        <div className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden ${isClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`} style={{ backdropFilter: 'blur(6px)' }}>
            <div className={`bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full ${hasInvoice ? 'max-w-5xl' : 'max-w-2xl'} border border-white/50 flex flex-col max-h-[95vh] relative overflow-hidden transition-all ${isClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                <div className="px-6 py-5 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40 shrink-0">
                    <div className="flex items-center gap-3">
                        <TrendingDown className="w-8 h-8 text-[#4A90E2] drop-shadow-sm" />
                        <div>
                            <h2 className="text-lg font-black text-[#2c3434] uppercase tracking-tight">Registrar Egreso</h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${hasInvoice ? 'text-[#366480]' : 'text-[#8b9ba5]'}`}>{hasInvoice ? 'Modo Factura' : 'Modo Simple'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div
                            onClick={() => setHasInvoice(!hasInvoice)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all border shadow-sm ${hasInvoice ? 'bg-[#366480] border-[#366480] text-white shadow-[#366480]/20' : 'bg-[#f0f5f4] border-[#d3dcdb]/50 text-[#8b9ba5] hover:bg-[#e9efee]'}`}
                        >
                            <FileSearch className={`w-3.5 h-3.5 ${hasInvoice ? 'animate-pulse text-white' : ''}`} />
                            <span className="text-[10px] font-black uppercase tracking-widest">¿Con Factura?</span>
                        </div>
                        <button onClick={handleClose} className="w-9 h-9 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all z-20"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className={`grid ${hasInvoice ? 'grid-cols-1 lg:grid-cols-12 gap-6' : 'grid-cols-1 gap-5'}`}>
                        {/* LEFT SECTION: SELECTORS & INPUTS */}
                        <div className={`${hasInvoice ? 'lg:col-span-5' : ''} space-y-4`}>
                            <div className="space-y-3">
                                <label className="text-[9px] font-black text-slate-400 uppercase block pl-1 tracking-[0.2em]">Categoría / Concepto</label>
                                <select
                                    value={gastoData.categoria}
                                    onChange={(e) => {
                                        setGastoData({...gastoData, categoria: e.target.value});
                                    }}
                                    className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-3 rounded-2xl text-[12px] font-black outline-none border-2 border-transparent focus:border-rose-400 transition-all uppercase cursor-pointer shadow-inner"
                                >
                                    <option value="REQUERIMIENTO DE COMPRA">REQUERIMIENTO DE COMPRA</option>
                                    <option value="Luz">Servicio: Luz</option>
                                    <option value="Agua">Servicio: Agua</option>
                                    <option value="Internet">Servicio: Internet</option>
                                    <option value="Postpago">Telefonía / Postpago</option>
                                    <option value="Limpieza">Mantenimiento / Limpieza</option>
                                    <option value="Pagos Varios">Gastos Administrativos / Varios</option>
                                    <option value="Pago a Terceros">Honorarios / Pago Terceros</option>
                                    <option value="Ajuste de Caja">Ajuste de Saldo en Cuenta</option>
                                </select>
                                <div className="bg-rose-50/50 dark:bg-rose-950/20 px-5 py-3 rounded-2xl border border-rose-100 dark:border-rose-900/50 shadow-inner">
                                    <label className="text-[9px] font-black text-rose-500 uppercase block tracking-widest pl-0.5 mb-1">Monto Individual (S/)</label>
                                    <input
                                        type="number"
                                        value={gastoData.monto}
                                        onChange={(e) => setGastoData({...gastoData, monto: e.target.value})}
                                        className="w-full bg-transparent border-none p-0 text-2xl font-black outline-none tabular-nums text-rose-600 focus:ring-0"
                                        placeholder="0.00"
                                    />
                                </div>
                                <textarea
                                    placeholder="Descripción / Glosa..."
                                    value={gastoData.desc}
                                    onChange={(e) => setGastoData({...gastoData, desc: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-rose-400 px-4 py-3 rounded-2xl text-[11px] font-bold outline-none h-20 transition-all uppercase resize-none shadow-inner"
                                />
                            </div>

                            <button
                                onClick={addBreakdownItem}
                                disabled={!gastoData.monto}
                                className={`w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${hasInvoice ? 'bg-indigo-600 text-white shadow-lg hover:scale-[1.02] active:scale-95' : 'hidden'}`}
                            >
                                + Añadir al Desglose
                            </button>

                            {/* Voucher upload (always visible when traceability required, shown here when not in invoice mode) */}
                            {!hasInvoice && isTraceabilityRequired && (
                                <div className="space-y-3 pt-2 border-t border-slate-100">
                                    <div className="flex items-center justify-between pl-0.5">
                                        <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Auditoría Bancaria</h5>
                                        <span className="text-[7px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full uppercase">Obligatorio*</span>
                                    </div>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`h-24 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${showError && !voucherFile ? 'border-rose-400 bg-rose-50' : 'border-slate-200 hover:border-rose-500 bg-white dark:bg-slate-800 shadow-sm'}`}
                                    >
                                        {voucherPreview ? (
                                            <img src={voucherPreview} className="h-full w-full object-contain p-2 rounded-2xl" alt="Voucher"/>
                                        ) : (
                                            <>
                                                <Camera className="w-6 h-6 text-slate-300" />
                                                <span className="text-[9px] font-black text-slate-400 uppercase">Subir Váucher</span>
                                            </>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <input
                                            placeholder="N° OPERACIÓN *"
                                            value={numOp}
                                            onChange={(e) => setNumOp(e.target.value.toUpperCase())}
                                            className={`w-full bg-white dark:bg-slate-800 px-4 py-3 rounded-xl text-center font-black text-base outline-none border-2 transition-all ${showError && !numOp ? 'border-rose-400 shadow-rose-50' : 'border-slate-100 focus:border-rose-500 shadow-sm'}`}
                                        />
                                        {showError && !numOp && <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-rose-500 animate-pulse" />}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT SECTION: only shown in invoice mode */}
                        {hasInvoice && (
                        <div className="lg:col-span-7 flex flex-col gap-4">
                            <div className="flex-1 bg-indigo-50/20 dark:bg-indigo-950/5 rounded-2xl border-2 border-indigo-100/50 dark:border-indigo-900/30 flex flex-col overflow-hidden shadow-inner min-h-[200px]">
                                <div className="px-5 py-3 border-b border-indigo-100/50 flex justify-between items-center bg-white/50 dark:bg-slate-900/50">
                                    <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] italic leading-none">Artículos en la Factura</h4>
                                    <span className="text-base font-black text-indigo-700 tabular-nums leading-none">TOTAL: S/ {totalInvoiceAmount.toFixed(2)}</span>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                                    {invoiceBreakdown.length === 0 ? (
                                        <div className="pt-12 flex flex-col items-center opacity-30">
                                            <Calculator className="w-10 h-10 mb-3 text-slate-300 pointer-events-none" />
                                            <p className="text-[10px] font-black text-slate-400 uppercase italic">Añade Conceptos desde el panel izquierdo</p>
                                        </div>
                                    ) : invoiceBreakdown.map((item) => (
                                        <div key={item.id} className="bg-white dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex justify-between items-center group animate-in slide-in-from-right-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                                        {item.category}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase truncate leading-none">
                                                    {item.description}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-[12px] font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">S/ {item.amount.toFixed(2)}</span>
                                                <button onClick={() => removeBreakdownItem(item.id)} className="p-1.5 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all group-hover:opacity-100 opacity-0"><X className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* DOCUMENTATION PANEL: Voucher + Invoice (only in invoice mode) */}
                            <div className={`grid ${isTraceabilityRequired ? 'grid-cols-2' : 'grid-cols-1'} gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all duration-500`}>
                                {isTraceabilityRequired && (
                                    <div className="space-y-2 animate-in slide-in-from-left-4">
                                        <div className="flex items-center justify-between pl-0.5">
                                            <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Auditoría Bancaria</h5>
                                            <span className="text-[7px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full uppercase">Obligatorio*</span>
                                        </div>
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${showError && !voucherFile ? 'border-rose-400 bg-rose-50' : 'border-slate-200 hover:border-rose-500 bg-white dark:bg-slate-800 shadow-sm'}`}
                                        >
                                            {voucherPreview ? (
                                                <img src={voucherPreview} className="h-full w-full object-contain p-2 rounded-xl" alt="Voucher"/>
                                            ) : (
                                                <>
                                                    <Camera className="w-5 h-5 text-slate-300" />
                                                    <span className="text-[9px] font-black text-slate-400 uppercase">Subir Váucher</span>
                                                </>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <input
                                                placeholder="N° OP *"
                                                value={numOp}
                                                onChange={(e) => setNumOp(e.target.value.toUpperCase())}
                                                className={`w-full bg-white dark:bg-slate-800 px-3 py-2.5 rounded-xl text-center font-black text-sm outline-none border-2 transition-all ${showError && !numOp ? 'border-rose-400 shadow-rose-50' : 'border-slate-100 focus:border-rose-500 shadow-sm'}`}
                                            />
                                            {showError && !numOp && <AlertCircle className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-500 animate-pulse" />}
                                        </div>
                                    </div>
                                )}

                                <div className={`space-y-2 transition-all ${isTraceabilityRequired ? 'border-l border-slate-100 dark:border-slate-800 pl-4' : ''}`}>
                                    <div className="flex items-center justify-between pl-0.5">
                                        <h5 className="text-[9px] font-black uppercase tracking-widest leading-none text-indigo-400">Factura Digital</h5>
                                        <span className="text-[7px] font-black text-indigo-400/50 bg-indigo-50 px-2 py-0.5 rounded-full uppercase italic">Opcional</span>
                                    </div>
                                    <div
                                        onClick={() => invoiceInputRef.current?.click()}
                                        className="h-full min-h-[100px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all border-indigo-200 hover:border-indigo-400 bg-white dark:bg-indigo-950/20 shadow-sm"
                                    >
                                        {invoicePreview ? (
                                            <div className="relative group p-1.5 h-full w-full">
                                                <img src={invoicePreview} className="w-full h-full object-contain rounded-lg" alt="Factura"/>
                                                <div className="absolute inset-0 bg-indigo-600/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center rounded-lg backdrop-blur-[2px]">
                                                    <ImagePlus className="w-8 h-8 text-white" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-2">
                                                <FileSearch className="w-8 h-8 text-indigo-300 animate-bounce-slow" />
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Digitalizar Factura</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white/40 shrink-0">
                    <div className="flex-1 min-w-[180px]">
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 leading-none">Total</p>
                         <div className="flex items-baseline gap-3">
                            <span className={`text-3xl font-black tabular-nums tracking-tighter transition-colors ${hasInsufficientFunds ? 'text-rose-600' : 'text-slate-950 dark:text-white'}`}>S/ {totalToSpend.toFixed(2)}</span>
                            <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full border tracking-widest shadow-sm ${currentBalance - totalToSpend < 0 ? 'bg-rose-50 text-rose-500 border-rose-100 animate-pulse' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                Remanente: S/ {(currentBalance - totalToSpend).toFixed(2)}
                            </span>
                         </div>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800 shadow-inner">
                        {['Efectivo', ...BANK_ACCOUNTS].map(acc => (
                            <button
                                key={acc}
                                onClick={() => setGastoData({...gastoData, cuenta: acc})}
                                className={`h-9 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${gastoData.cuenta === acc ? 'bg-rose-600 text-white shadow-lg shadow-rose-200' : 'bg-white dark:bg-slate-800 text-slate-400 border border-slate-100 dark:border-slate-700 hover:text-slate-600'}`}
                            >
                                {acc.split('/')[0]}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleConfirmGasto}
                        disabled={isSubmitting || totalToSpend <= 0 || hasInsufficientFunds}
                        className={`px-8 rounded-xl h-12 text-[11px] font-black uppercase tracking-widest shadow-lg active:scale-95 disabled:opacity-30 flex items-center gap-3 transition-all bg-[#4A90E2] text-white shadow-[#4A90E2]/20 border-b-4 border-[#366480]`}
                    >
                        {isSubmitting ? 'PROCESANDO...' : 'Confirmar'}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'voucher')} className="hidden" />
            <input ref={invoiceInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'invoice')} className="hidden" />
        </div>
    );
};
