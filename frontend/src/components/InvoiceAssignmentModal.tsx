import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Search, ImagePlus, ChevronDown, Save, Calculator, Building2, Package, CheckCircle2, ZoomIn, Trash2, Percent, Hash, ArrowRightLeft, FolderOpen, Tag, AlertTriangle, MessageSquare, TrendingDown, Target, Info, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import type { Project, ProjectItem, NodrizaTesoreria } from '../services/types';

interface InvoiceAssignmentModalProps {
    egreso: NodrizaTesoreria;
    onClose: () => void;
    onSuccess: () => Promise<void>;
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

export const InvoiceAssignmentModal: React.FC<InvoiceAssignmentModalProps> = ({ egreso, onClose, onSuccess }) => {
    const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
    const [invoicePreview, setInvoicePreview] = useState<string | null>(egreso.invoice_url || null);
    const [serie, setSerie] = useState(egreso.invoice_serie || '');
    const [correlativo, setCorrelativo] = useState(egreso.invoice_correlativo || '');
    const [breakdown, setBreakdown] = useState<any[]>(egreso.invoice_details || []);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    // Distribution States
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<ProjectItem | null>(null);
    const [projectSearch, setProjectSearch] = useState('');
    const [itemSearch, setItemSearch] = useState('');
    const [showProjectSearch, setShowProjectSearch] = useState(false);
    const [showItemSearch, setShowItemSearch] = useState(false);
    const [zoomImage, setZoomImage] = useState(false);
    const [qty, setQty] = useState('');
    const [price, setPrice] = useState('');
    const [incIgv, setIncIgv] = useState(true);
    const [isLoadingItems, setIsLoadingItems] = useState(false);

    // Mismatch Popup State
    const [showMismatchPopup, setShowMismatchPopup] = useState(false);
    const [mismatchReason, setMismatchReason] = useState(egreso.mismatch_reason || '');
    const [showFinalConfirm, setShowFinalConfirm] = useState(false);

    const isEditingLocked = egreso.invoice_status === 'REGISTRADO' && (egreso.invoice_details && Array.isArray(egreso.invoice_details) && egreso.invoice_details.length > 0);

    const projectRef = useRef<HTMLDivElement>(null);
    const itemRef = useRef<HTMLDivElement>(null);
    const invoiceInputRef = useRef<HTMLInputElement>(null);
    const projectSearchInputRef = useRef<HTMLInputElement>(null);
    const itemSearchInputRef = useRef<HTMLInputElement>(null);
    const projectDropdownRef = useRef<HTMLDivElement>(null);
    const itemDropdownRef = useRef<HTMLDivElement>(null);

    type DropdownPos = { top: number; left: number; width: number };
    const [projectDropdownPos, setProjectDropdownPos] = useState<DropdownPos>({ top: 0, left: 0, width: 0 });
    const [itemDropdownPos, setItemDropdownPos] = useState<DropdownPos>({ top: 0, left: 0, width: 0 });

    const calcPos = (ref: React.RefObject<HTMLInputElement>): DropdownPos => {
        if (!ref.current) return { top: 0, left: 0, width: 0 };
        const r = ref.current.getBoundingClientRect();
        return { top: r.bottom + 4, left: r.left, width: r.width };
    };

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => onClose(), 280);
    };

    useEffect(() => {
        const fetchProjects = async () => {
            const all = await api.getProjects();
            setProjects(all.filter(p => p.status === 'INICIO' || p.status === 'EN_EJECUCION'));
        };
        fetchProjects();
    }, []);

    useEffect(() => {
        setSelectedItem(null);
        setItemSearch('');
        setQty('');
        setPrice('');

        if (selectedProject) {
            const fetchItems = async () => {
                setIsLoadingItems(true);
                try {
                    const items = await api.getItems(selectedProject.id);
                    setProjectItems(items);
                } finally {
                    setIsLoadingItems(false);
                }
            };
            fetchItems();
        } else {
            setProjectItems([]);
        }
    }, [selectedProject]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const t = e.target as Node;
            const inProjectInput = projectRef.current?.contains(t);
            const inProjectDrop = projectDropdownRef.current?.contains(t);
            if (!inProjectInput && !inProjectDrop) setShowProjectSearch(false);

            const inItemInput = itemRef.current?.contains(t);
            const inItemDrop = itemDropdownRef.current?.contains(t);
            if (!inItemInput && !inItemDrop) setShowItemSearch(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
                            setInvoiceFile(webpFile);
                            setInvoicePreview(URL.createObjectURL(webpFile));
                        } catch (err) { console.error("Paste error", err); }
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
        const webp = await convertToWebP(file);
        setInvoiceFile(webp);
        setInvoicePreview(URL.createObjectURL(webp));
    };

    const filteredProjects = useMemo(() => {
        if (!projectSearch) return projects;
        return projects.filter(p =>
            p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
            p.project_number.toLowerCase().includes(projectSearch.toLowerCase())
        );
    }, [projects, projectSearch]);

    const filteredItems = useMemo(() => {
        return projectItems.filter(i => {
            const matchesSearch = !itemSearch || i.description.toLowerCase().includes(itemSearch.toLowerCase());
            const isIncomplete = (i.real_qty || 0) < (i.planned_qty || 0);
            return matchesSearch && isIncomplete;
        });
    }, [projectItems, itemSearch]);

    const q = Number(qty) || 0;
    const p = Number(price) || 0;
    const rawTotal = q * p;
    let baseAmount = 0; let igvAmount = 0; let finalTotal = 0;

    if (incIgv) {
        finalTotal = rawTotal;
        baseAmount = finalTotal / 1.18;
        igvAmount = finalTotal - baseAmount;
    } else {
        baseAmount = rawTotal;
        igvAmount = baseAmount * 0.18;
        finalTotal = baseAmount + igvAmount;
    }

    const addItem = (type: 'PROJECT' | 'GENERAL') => {
        const newItem = type === 'PROJECT'
            ? {
                id: crypto.randomUUID(), type: 'PROJECT', projectId: selectedProject!.id, projectName: selectedProject!.name,
                projectNumber: selectedProject!.project_number, projectItemId: selectedItem!.id, description: selectedItem!.description,
                category: selectedItem!.category, unit: selectedItem!.unit, plannedQty: selectedItem!.planned_qty, plannedPrice: selectedItem!.planned_unit_price,
                qty: Number(qty), price: Number(price), incIgv, amount: finalTotal, baseAmount, igvAmount, isManual: true
            }
            : {
                id: crypto.randomUUID(), type: 'GENERAL', description: itemSearch.toUpperCase(), qty: Number(qty), price: Number(price),
                incIgv, amount: finalTotal, baseAmount, igvAmount, isManual: true
            };

        setBreakdown([...breakdown, newItem]);
        setQty(''); setPrice(''); setSelectedItem(null); setItemSearch('');
    };

    const removeItem = (id: string) => {
        setBreakdown(breakdown.filter(i => i.id !== id));
    };

    const totalInvoiced = useMemo(() =>
        breakdown.filter(i => i.isManual).reduce((sum, item) => sum + (item.amount || 0), 0)
    , [breakdown]);

    const totalBaseAmount = useMemo(() =>
        breakdown.filter(i => i.isManual).reduce((sum, item) => sum + (item.baseAmount || 0), 0)
    , [breakdown]);

    const totalIgvAmount = useMemo(() =>
        breakdown.filter(i => i.isManual).reduce((sum, item) => sum + (item.igvAmount || 0), 0)
    , [breakdown]);

    const sortedBreakdown = useMemo(() => {
        return [...breakdown].sort((a, b) => {
            if (a.type === 'PROJECT' && b.type !== 'PROJECT') return -1;
            if (a.type !== 'PROJECT' && b.type === 'PROJECT') return 1;
            return 0;
        });
    }, [breakdown]);

    const validateAndSave = () => {
        if (!serie || !correlativo) { alert("La Serie y el Correlativo son obligatorios."); return; }
        const difference = Math.abs(totalInvoiced - egreso.monto);
        if (difference > 0.05 && !mismatchReason) { setShowMismatchPopup(true); return; }
        setShowFinalConfirm(true);
    };

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            let finalInvoiceUrl = egreso.invoice_url;
            if (invoiceFile) finalInvoiceUrl = await api.uploadInvoice(invoiceFile, `INV_${serie}_${correlativo}`);

            for (const item of breakdown) {
                if (item.projectItemId && item.isManual) {
                    const { data: current } = await (api as any)._supabase
                        .from('project_items')
                        .select('real_qty, real_unit_price')
                        .eq('id', item.projectItemId)
                        .maybeSingle();
                    if (current) {
                        const oldTotal = (current.real_qty || 0) * (current.real_unit_price || 0);
                        const newTotal = oldTotal + item.amount;
                        const newQty = (current.real_qty || 0) + item.qty;
                        const newAvgPrice = newQty > 0 ? newTotal / newQty : 0;
                        await api.updateProjectItem(item.projectItemId, { real_qty: newQty, real_unit_price: newAvgPrice, origin: egreso.cuenta_origen, transaction_date: new Date().toISOString().split('T')[0] });
                    }
                }
            }

            const updatePayload: Partial<NodrizaTesoreria> = {
                invoice_url: finalInvoiceUrl,
                invoice_details: breakdown,
                invoice_serie: serie.toUpperCase(),
                invoice_correlativo: correlativo,
                mismatch_reason: mismatchReason,
                invoice_subtotal: totalBaseAmount,
                invoice_igv: totalIgvAmount,
                invoice_total: totalInvoiced,
                has_invoice: true,
                invoice_status: 'REGISTRADO'
            };

            console.log("Actualizando movimiento de tesorería con:", updatePayload);
            await api.updateTesoreriaMovement(egreso.id, updatePayload);

            await onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Error al guardar la factura:", error);
            alert("Error al guardar la gestión de factura: " + (error.message || "Error desconocido"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const isReadyToSave = serie.trim().length > 0 && correlativo.trim().length > 0;

    return (
        <>
        <div className={`treasury-ui fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden ${isClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`} style={{ backdropFilter: 'blur(6px)' }}>
            {zoomImage && invoicePreview && (
                <div onClick={() => setZoomImage(false)} className="fixed inset-0 z-[1300] bg-slate-950/95 flex items-center justify-center p-10 cursor-zoom-out animate-in zoom-in-95 duration-200">
                    <img src={invoicePreview} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" alt="Preview Full" />
                    <button className="absolute top-10 right-10 p-5 bg-white/10 hover:bg-rose-500 rounded-full text-white transition-all"><X className="w-8 h-8" /></button>
                </div>
            )}

            {showMismatchPopup && (
                <div className="fixed inset-0 z-[1400] bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-10 animate-in zoom-in-95 duration-200">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-8 shadow-3xl border-2 border-amber-100 flex flex-col gap-6">
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center border-2 border-white shadow-lg animate-bounce"><AlertTriangle className="w-8 h-8 text-amber-500" /></div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase italic tracking-tighter">ALERTA DE DESCUADRE</h2>
                            <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-tight">El monto registrado en la factura (S/ {totalInvoiced.toFixed(2)}) no coincide con lo pagado en el egreso (S/ {egreso.monto.toFixed(2)}). Justifique este descuadre para continuar.</p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Razón / Justificación</label>
                            <div className="relative"><MessageSquare className="absolute left-4 top-4 w-4 h-4 text-slate-300" /><textarea placeholder="Escriba aquí el motivo..." value={mismatchReason} onChange={(e) => setMismatchReason(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 p-4 pl-10 rounded-2xl border-2 border-transparent focus:border-amber-400 outline-none text-xs font-black min-h-[100px] shadow-inner resize-none"/></div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowMismatchPopup(false)} className="flex-1 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 rounded-xl hover:bg-slate-50 transition-all">Regresar</button>
                            <button onClick={handleSave} disabled={!mismatchReason.trim() || isSubmitting} className="flex-1 py-3 bg-amber-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-amber-100 hover:bg-amber-600 disabled:opacity-30 disabled:grayscale">Confirmar y Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className={`bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-4xl border border-white/50 flex flex-col max-h-[90vh] relative overflow-hidden ${isClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}>
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                {/* HEADER */}
                <div className="px-5 py-3 border-b border-[#d3dcdb]/30 flex items-center justify-between bg-white/40 shrink-0">
                    <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[#4A90E2] drop-shadow-sm shrink-0" />
                        <div>
                            <h2 className="text-sm font-black text-[#2c3434] uppercase tracking-tight leading-tight">Gestión de Factura</h2>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] font-black text-[#8b9ba5] uppercase tracking-widest truncate max-w-[220px] block">{egreso.observaciones || 'Sin descripción'}</span>
                                <div className="w-1 h-1 rounded-full bg-[#d3dcdb]"></div>
                                <span className="text-[10px] font-black text-[#4A90E2] tabular-nums">S/ {egreso.monto.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={handleClose} className="w-7 h-7 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all z-20"><X className="w-4 h-4" /></button>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-y-auto px-5 py-3 custom-scrollbar space-y-3">
                    {/* TOP: Document + Status */}
                    <div className="grid grid-cols-2 gap-3 items-stretch">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none pl-1">Documento Sustentatorio</label>
                            <div className="grid grid-cols-2 gap-2 h-28">
                                <div className="border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center transition-all bg-slate-50/50 dark:bg-slate-950/20 overflow-hidden relative group">
                                    {invoicePreview ? (
                                        <div className="w-full h-full relative">
                                            <img src={invoicePreview} onClick={() => setZoomImage(true)} className="w-full h-full object-contain p-1.5 cursor-zoom-in group-hover:scale-105 transition-transform" />
                                            <div className="absolute top-1.5 right-1.5 flex gap-1">
                                                <button onClick={() => setZoomImage(true)} className="p-1 bg-slate-900/80 text-white rounded-lg shadow-lg hover:bg-indigo-600 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"><ZoomIn className="w-3 h-3" /></button>
                                                {!isEditingLocked && <button onClick={() => { setInvoiceFile(null); setInvoicePreview(null); }} className="p-1 bg-rose-600 text-white rounded-lg shadow-lg hover:scale-110 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3 h-3" /></button>}
                                            </div>
                                        </div>
                                    ) : (
                                        <div onClick={() => !isEditingLocked && invoiceInputRef.current?.click()} className={`w-full h-full flex flex-col items-center justify-center ${!isEditingLocked ? 'cursor-pointer hover:bg-white dark:hover:bg-slate-800' : 'cursor-not-allowed'} transition-all gap-1`}><ImagePlus className="w-4 h-4 text-slate-300" /><span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{isEditingLocked ? 'BLOQUEADA' : 'Subir Imagen'}</span></div>
                                    )}
                                    <input ref={invoiceInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                                </div>
                                <div className="flex flex-col gap-1.5 bg-slate-50/30 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 justify-center">
                                    <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase pl-1 block">Serie</label><div className="relative"><Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-300" /><input type="text" placeholder="F001" value={serie} disabled={isEditingLocked} onChange={(e) => setSerie(e.target.value.toUpperCase())} className="w-full h-8 bg-white dark:bg-slate-800 pl-7 pr-2 rounded-lg text-[10px] font-black outline-none border border-transparent focus:border-indigo-500 uppercase shadow-sm disabled:opacity-50"/></div></div>
                                    <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase pl-1 block">Correlativo</label><div className="relative"><Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-300" /><input type="text" placeholder="000123" value={correlativo} disabled={isEditingLocked} onChange={(e) => setCorrelativo(e.target.value.replace(/\D/g, ''))} className="w-full h-8 bg-white dark:bg-slate-800 pl-7 pr-2 rounded-lg text-[10px] font-black outline-none border border-transparent focus:border-indigo-500 uppercase shadow-sm disabled:opacity-50"/></div></div>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1 leading-none">Status del Pago</label>
                            <div className="h-28 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-center gap-1.5">
                                <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">S/ {egreso.monto.toFixed(2)}</div>
                                <div className="w-8 h-0.5 bg-indigo-600 rounded-full"></div>
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{egreso.cuenta_origen}</span>
                            </div>
                        </div>
                    </div>

                    {/* CONFIGURATION PANEL */}
                    {!isEditingLocked && (
                        <div className="bg-indigo-50/30 dark:bg-indigo-950/10 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/30 space-y-2.5 shadow-sm text-xs">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[9px] font-black text-indigo-500 uppercase tracking-widest italic flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Configuración de Partida</h4>
                                <div className="flex bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm">
                                    <button onClick={() => setIncIgv(true)} className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${incIgv ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>CON IGV</button>
                                    <button onClick={() => setIncIgv(false)} className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${!incIgv ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>SIN IGV</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1" ref={projectRef}>
                                    <div className="flex justify-between items-center pl-1"><label className="text-[8px] font-black text-slate-400 uppercase">Obra Objetivo</label>{selectedProject && (<button onClick={() => {setSelectedProject(null); setProjectSearch(''); setProjectItems([]); }} className="text-[7px] font-black text-rose-500 flex items-center gap-1 hover:underline"><ArrowRightLeft className="w-2.5 h-2.5" /> Cambiar</button>)}</div>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                        <input
                                            ref={projectSearchInputRef}
                                            type="text"
                                            placeholder="Buscar..."
                                            value={selectedProject ? `${selectedProject.project_number} | ${selectedProject.name}` : projectSearch}
                                            onChange={(e) => { setProjectSearch(e.target.value); setSelectedProject(null); setProjectDropdownPos(calcPos(projectSearchInputRef)); setShowProjectSearch(true); }}
                                            onFocus={() => { setProjectDropdownPos(calcPos(projectSearchInputRef)); setShowProjectSearch(true); setShowItemSearch(false); }}
                                            className={`w-full h-9 bg-white dark:bg-slate-800 pl-9 pr-3 rounded-xl text-[10px] font-bold outline-none border border-transparent focus:border-indigo-500 uppercase shadow-sm ${selectedProject ? 'text-indigo-600' : ''}`}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1" ref={itemRef}>
                                    <label className="text-[8px] font-black text-slate-400 uppercase pl-1">Partida / Descripción</label>
                                    <div className="relative">
                                        <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                        <input
                                            ref={itemSearchInputRef}
                                            type="text"
                                            placeholder="Escriba detalle..."
                                            value={selectedItem ? selectedItem.description : itemSearch}
                                            onChange={(e) => { setItemSearch(e.target.value); setSelectedItem(null); setItemDropdownPos(calcPos(itemSearchInputRef)); setShowItemSearch(true); }}
                                            onFocus={() => { setItemDropdownPos(calcPos(itemSearchInputRef)); setShowItemSearch(true); setShowProjectSearch(false); }}
                                            className="w-full h-9 bg-white dark:bg-slate-800 pl-9 pr-3 rounded-xl text-[10px] font-bold outline-none border border-transparent focus:border-indigo-500 uppercase shadow-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-3 items-end">
                                <div className="flex flex-col gap-1"><label className="text-[7.5px] font-black text-slate-400 uppercase pl-1 text-center">Cantidad</label><input type="number" value={qty} onChange={(e)=>setQty(e.target.value)} className="h-9 bg-white px-3 rounded-xl text-[10px] font-black text-center border border-slate-100 shadow-sm" placeholder="0"/></div>
                                <div className="flex flex-col gap-1"><label className="text-[7.5px] font-black text-slate-400 uppercase pl-1 text-center">PRECIO</label><input type="number" value={price} onChange={(e)=>setPrice(e.target.value)} className="h-9 bg-white px-3 rounded-xl text-[10px] font-black text-center border border-slate-100 shadow-sm" placeholder="0.00"/></div>
                                <div className="flex flex-col gap-1"><label className="text-[7.5px] font-black text-indigo-500 uppercase pl-1 text-center">Impacto</label><div className="h-9 bg-indigo-50 border border-indigo-200 flex items-center justify-center rounded-xl text-[11px] font-black text-indigo-700 tabular-nums shadow-inner">S/ {finalTotal.toFixed(2)}</div></div>
                                <div className="grid grid-cols-2 gap-1.5 h-9">
                                    <button onClick={() => addItem('PROJECT')} disabled={!selectedProject || !selectedItem || !qty || !price} className="bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-700 disabled:opacity-20 flex items-center justify-center gap-1 shadow-lg"><CheckCircle2 className="w-3 h-3" /> Obra</button>
                                    <button onClick={() => addItem('GENERAL')} disabled={!qty || !price || !itemSearch} className="bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase hover:bg-slate-800 disabled:opacity-20 flex items-center justify-center gap-1"><Calculator className="w-3 h-3" /> Gral</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DISTRIBUTION DETAIL */}
                    <div className="space-y-2 pb-2">
                        <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 italic"><Calculator className="w-3 h-3" /> Detalle de Distribución de Factura</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {sortedBreakdown.map((item) => (
                                <div key={item.id} className={`group p-3 rounded-xl border flex flex-col gap-2 shadow-sm relative transition-all ${item.type === 'PROJECT' ? 'bg-white border-slate-100 border-2' : 'bg-slate-100 border-slate-200 opacity-80'}`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">{item.type === 'PROJECT' ? (<span className="text-[8px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase">#{item.projectNumber}</span>) : (<span className="text-[8px] font-black bg-slate-400 text-white px-2 py-0.5 rounded-full uppercase italic">GRAL</span>)}</div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-800 tabular-nums tracking-tighter transition-all group-hover:text-indigo-600">S/ {item.amount.toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <p className="text-[10px] font-black text-slate-800 leading-tight uppercase line-clamp-2 italic">{item.description}</p>
                                    {item.type === 'PROJECT' && (
                                        <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100 text-[9px]">
                                            <div className="flex flex-col gap-0.5"><span className="text-[7px] font-black text-slate-400 uppercase">PRESUPUESTADO</span><p className="font-bold text-slate-500 italic">Cant: {item.plannedQty} | Un: S/ {item.plannedPrice.toFixed(2)}</p></div>
                                            <div className="flex flex-col gap-0.5"><span className="text-[7px] font-black text-indigo-600 uppercase">REAL FACTURADO</span><p className="font-black text-indigo-700 underline underline-offset-4 font-mono">Cant: {item.qty} | Un: S/ {item.price.toFixed(2)}</p></div>
                                        </div>
                                    )}
                                    {item.isManual && !isEditingLocked && (<button onClick={() => removeItem(item.id)} className="absolute top-2 right-2 p-2 bg-slate-50 text-slate-300 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100 shadow-sm rounded-full"><Trash2 className="w-3 h-3" /></button>)}
                                </div>
                            ))}
                        </div>

                        {breakdown.length > 0 && (
                            <div className="bg-white border-2 border-slate-100 px-4 py-3 rounded-xl flex justify-between items-center shadow-lg mt-2 relative transition-all animate-in zoom-in-95 duration-200 ring-2 ring-slate-50">
                                <div className="flex gap-6">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">OPERACIÓN GRAVADA</span>
                                        <div className="text-base font-black tabular-nums tracking-tighter text-slate-800">S/ {(totalBaseAmount || 0).toFixed(2)}</div>
                                    </div>
                                    <div className="flex flex-col gap-0.5 border-l border-slate-100 pl-6">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">IGV (18%)</span>
                                        <div className="text-base font-black tabular-nums tracking-tighter text-slate-800">S/ {(totalIgvAmount || 0).toFixed(2)}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="bg-indigo-600 px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-100 hover:scale-[1.02] transition-transform">
                                        <span className="text-[8px] font-black text-indigo-100 uppercase tracking-widest block mb-0.5">TOTAL FACTURA VINCULADA</span>
                                        <div className="text-xl font-black tabular-nums tracking-tighter text-white">S/ {(totalInvoiced || 0).toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* FOOTER */}
                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white/40 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${Math.abs(totalInvoiced - egreso.monto) < 0.01 ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`}></div>
                        <p className="text-[9px] font-black text-slate-500 uppercase italic leading-none">{Math.abs(totalInvoiced - egreso.monto) < 0.01 ? 'Balance de Documento Cuadrado' : `Diferencia c/ Egreso: S/ ${(egreso.monto - totalInvoiced).toFixed(2)}`}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleClose} className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-600 transition-all">Cancelar</button>
                        {!isEditingLocked && (
                            <button
                                onClick={validateAndSave}
                                disabled={isSubmitting || !isReadyToSave}
                                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 ${!isReadyToSave ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'}`}
                            >
                                {isSubmitting ? 'GUARDANDO...' : 'Finalizar Gestión'}<Save className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {isEditingLocked && (
                            <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5" /> GESTIÓN FINALIZADA
                            </div>
                        )}
                    </div>
                </div>

                {/* CONFIRMATION DIALOG */}
                {showFinalConfirm && (
                    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                            <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="w-7 h-7 text-amber-500" />
                            </div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white text-center uppercase italic tracking-tighter mb-2">¿Confirmar Gestión?</h3>
                            <p className="text-[11px] font-bold text-slate-400 text-center uppercase tracking-widest leading-relaxed mb-6">
                                Al marcar como <span className="text-indigo-600 font-black">REGISTRADO</span>, esta factura se bloqueará y <span className="text-rose-500 font-black">no podrá ser editada</span> posteriormente.
                            </p>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={handleSave}
                                    className="w-full py-3 bg-indigo-600 text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-100 dark:shadow-indigo-900/40 hover:bg-indigo-700 active:scale-95 transition-all"
                                >
                                    Sí, finalizar y bloquear
                                </button>
                                <button
                                    onClick={() => setShowFinalConfirm(false)}
                                    className="w-full py-3 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:text-slate-600 transition-all"
                                >
                                    No, seguir editando
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* PORTAL: Project search dropdown — escapes overflow-hidden and overflow-y-auto */}
        {showProjectSearch && !selectedProject && createPortal(
            <div
                ref={projectDropdownRef}
                style={{ position: 'fixed', top: projectDropdownPos.top, left: projectDropdownPos.left, width: projectDropdownPos.width, zIndex: 9999 }}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 max-h-[30vh] overflow-y-auto p-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
            >
                {filteredProjects.length === 0
                    ? <p className="p-2.5 text-[10px] font-black text-slate-400 uppercase text-center">Sin resultados</p>
                    : filteredProjects.map(proj => (
                        <button
                            key={proj.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setSelectedProject(proj); setShowProjectSearch(false); setProjectSearch(''); }}
                            className="w-full p-2.5 text-left rounded-lg hover:bg-indigo-50 transition-all font-bold text-[10px] uppercase flex items-center gap-2.5"
                        >
                            <FolderOpen className="w-3 h-3 text-indigo-400 shrink-0" />
                            {proj.project_number} | {proj.name}
                        </button>
                    ))
                }
            </div>,
            document.body
        )}

        {/* PORTAL: Item search dropdown — escapes overflow-hidden and overflow-y-auto */}
        {showItemSearch && !selectedItem && selectedProject && createPortal(
            <div
                ref={itemDropdownRef}
                style={{ position: 'fixed', top: itemDropdownPos.top, left: itemDropdownPos.left, width: itemDropdownPos.width, zIndex: 9999 }}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 max-h-[30vh] overflow-y-auto p-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
            >
                {filteredItems.length === 0
                    ? <p className="p-2.5 text-[10px] font-black text-slate-400 uppercase text-center">Sin partidas disponibles</p>
                    : filteredItems.map(item => (
                        <button
                            key={item.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setSelectedItem(item); setShowItemSearch(false); setItemSearch(''); setQty('1'); setPrice(item.planned_unit_price.toString()); }}
                            className="w-full p-2.5 text-left rounded-lg hover:bg-indigo-50 transition-all font-bold text-[10px] uppercase flex items-center gap-2"
                        >
                            <Tag className="w-3 h-3 text-slate-300 shrink-0" />{item.description}
                        </button>
                    ))
                }
            </div>,
            document.body
        )}
        </>
    );
};
