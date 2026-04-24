import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal';
import { api } from '../../services/api';
import type { OrdenPago, Proveedor, Project, DetalleOrden } from '../../services/types';
import { X, Clock } from 'lucide-react';

interface PaymentOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'VIEW' | 'EDIT' | 'CREATE';
    orden?: OrdenPago;
    proveedores: Proveedor[];
    projects: Project[];
}

export const PaymentOrderModal: React.FC<PaymentOrderModalProps> = ({ 
    isOpen, 
    onClose, 
    mode,
    orden, 
    proveedores, 
    projects 
}) => {
    const isEdit = mode === 'EDIT';
    const isView = mode === 'VIEW';
    const [originalData, setOriginalData] = useState<{form: any, items: any[], includeIGV: boolean}>({ form: {}, items: [], includeIGV: false });
    const [showReasonModal, setShowReasonModal] = useState(false);
    const [formData, setFormData] = useState<Partial<OrdenPago>>({
        moneda: 'PEN',
        estado: 'enviado',
        monto_subtotal: 0,
        monto_impuestos: 0,
        monto_total: 0,
        ...(orden || {})
    });

    const [detalles, setDetalles] = useState<Partial<DetalleOrden>[]>([]);
    const [saving, setSaving] = useState(false);
    const [facturaFile, setFacturaFile] = useState<File | null>(null);
    const [evidenciaFiles, setEvidenciaFiles] = useState<File[]>([]);
    const [preexistingEvidences, setPreexistingEvidences] = useState<string[]>([]);
    const [includeIGV, setIncludeIGV] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        if (orden) {
            api.getDetallesOrden(orden.id).then(d => {
                setDetalles(d);
                const hasIGV = Number(orden.monto_impuestos) > 0;
                setIncludeIGV(hasIGV);
                setOriginalData({ 
                    form: { 
                        proveedor_id: orden.proveedor_id, 
                        project_id: orden.project_id, 
                        moneda: orden.moneda 
                    }, 
                    includeIGV: hasIGV,
                    items: d.map(item => ({ 
                        descripcion: item.descripcion, 
                        cantidad: item.cantidad, 
                        precio_unitario: item.precio_unitario 
                    }))
                });
            });
            if (orden.url_evidencia) {
                setPreexistingEvidences(orden.url_evidencia.split(/[|,]/).filter(Boolean));
            }
        } else {
            setDetalles([{ descripcion: '', cantidad: 1, precio_unitario: 0, subtotal_item: 0 }]);
            setOriginalData({ form: { proveedor_id: '', project_id: '', moneda: 'PEN' }, items: [] });
        }
    }, [orden]);

    const isDirty = useMemo(() => {
        if (mode === 'CREATE') {
            return detalles.some(d => d.descripcion || Number(d.precio_unitario) > 0) || !!facturaFile || evidenciaFiles.length > 0;
        }
        
        // Comparison for Edit
        const formChanged = formData.proveedor_id !== originalData.form.proveedor_id || 
                           formData.project_id !== originalData.form.project_id ||
                           formData.moneda !== originalData.form.moneda;
        
        const currentItems = detalles.map(d => ({ d: d.descripcion, c: d.cantidad, p: d.precio_unitario }));
        const initialItems = originalData.items.map(d => ({ d: d.descripcion, c: d.cantidad, p: d.precio_unitario }));
        const itemsChanged = JSON.stringify(currentItems) !== JSON.stringify(initialItems);
        const igvChanged = includeIGV !== originalData.includeIGV;

        return formChanged || itemsChanged || igvChanged || !!facturaFile || evidenciaFiles.length > 0;
    }, [formData, detalles, originalData, facturaFile, evidenciaFiles, includeIGV, mode]);

    const handleAddItem = () => {
        setDetalles([...detalles, { descripcion: '', cantidad: 1, precio_unitario: 0, subtotal_item: 0 }]);
    };

    const handleRemoveItem = (index: number) => {
        setDetalles(detalles.filter((_, i) => i !== index));
    };

    const handleItemChange = (index: number, field: keyof DetalleOrden, value: any) => {
        const newDetalles = [...detalles];
        newDetalles[index] = { ...newDetalles[index], [field]: value };
        
        if (field === 'cantidad' || field === 'precio_unitario') {
            const qty = Number(newDetalles[index].cantidad) || 0;
            const price = Number(newDetalles[index].precio_unitario) || 0;
            newDetalles[index].subtotal_item = qty * price;
        }
        
        setDetalles(newDetalles);
    };

    useEffect(() => {
        const subtotal = detalles.reduce((acc, d) => acc + (Number(d.subtotal_item) || 0), 0);
        const taxes = includeIGV ? subtotal * 0.18 : 0;
        const total = subtotal + taxes;
        
        setFormData(prev => ({ 
            ...prev, 
            monto_subtotal: subtotal, 
            monto_impuestos: taxes, 
            monto_total: total 
        }));
    }, [detalles, includeIGV]);

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

    const processFile = async (file: File): Promise<File> => {
        const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.type === 'application/pdf') {
            if (file.size > MAX_PDF_SIZE) throw new Error("El PDF supera el límite de 10MB");
            return file;
        }
        if (file.type.startsWith('image/')) {
            try {
                return await convertToWebP(file);
            } catch (e) {
                console.warn("Conversion error, uploading original", e);
                return file;
            }
        }
        return file;
    };

    const handleAttemptClose = () => {
        if (isDirty && !saving && !isView) {
            setShowExitConfirm(true);
        } else {
            onClose();
        }
    };

    const handlePreSave = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Manual Validation for Critical Fields
        if (!formData.proveedor_id || !formData.project_id) {
            alert("⚠️ Error: Debe seleccionar un PROVEEDOR y una OBRA/PROYECTO obligatoriamente.");
            return;
        }

        const detailsValid = detalles.every(d => d.descripcion?.trim() && Number(d.precio_unitario) > 0);
        if (detalles.length === 0 || !detailsValid) {
            alert("⚠️ Error: Todos los ítems deben tener DESCRIPCIÓN y un PRECIO UNITARIO válido.");
            return;
        }

        if (isEdit) {
            setShowReasonModal(true);
        } else {
            handleSave();
        }
    };

    const handleSave = async (reasonOverride?: string) => {
        const finalMotivo = reasonOverride || formData.motivo_cambio;
        
        if (isEdit && !finalMotivo?.trim()) {
            alert("⚠️ Error: Debe ingresar el motivo del cambio.");
            return;
        }

        setSaving(true);
        setShowReasonModal(false);
        try {
            let urlFactura = formData.url_factura;
            let urlEvidencia = formData.url_evidencia;

            if (facturaFile) {
                const processed = await processFile(facturaFile);
                urlFactura = await api.uploadOrdenFile(processed, 'facturas');
            }

            // Handle Multiple Evidences
            let newEvidenceUrls: string[] = [...preexistingEvidences];
            if (evidenciaFiles.length > 0) {
                const uploadPromises = evidenciaFiles.map(async (file) => {
                    const processed = await processFile(file);
                    return api.uploadOrdenFile(processed, 'evidencias');
                });
                const uploadedUrls = await Promise.all(uploadPromises);
                newEvidenceUrls = [...newEvidenceUrls, ...uploadedUrls];
            }
            urlEvidencia = newEvidenceUrls.join(',');

            const project = projects.find(p => p.id === formData.project_id);
            
            await api.saveOrdenPago({
                ...formData,
                url_factura: urlFactura,
                url_evidencia: urlEvidencia,
                obra_nombre: project?.name || 'Varios / Planta'
            }, detalles);

            onClose();
        } catch (error: any) {
            console.error("Error al guardar orden de pago:", error);
            alert(error.message || "Error al guardar la orden de pago");
        } finally {
            setSaving(false);
        }
    };



    return (
        <Modal isOpen={isOpen} onClose={handleAttemptClose} contentClassName="modal-content-flush">
            <div className="relative w-full overflow-hidden rounded-[2rem] bg-slate-50 dark:bg-slate-900 shadow-2xl">
                
                {/* Audit Reason Sub-Modal (Popup within Popup) */}
                {showReasonModal && (
                    <div className="absolute inset-0 z-[250] flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowReasonModal(false)}></div>
                        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-10 shadow-3xl relative border border-amber-100 dark:border-amber-900/30 animate-in zoom-in-95 duration-300">
                            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6 transform -rotate-6">
                                <Clock className="w-8 h-8 text-amber-500" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white text-center uppercase tracking-tighter mb-2">Confirmar Edición</h3>
                            <p className="text-slate-400 text-center font-bold text-[10px] uppercase tracking-[0.2em] mb-8 leading-relaxed px-4">
                                Para mantener la trazabilidad financiera, explique brevemente el motivo de este cambio.
                            </p>
                            
                            <textarea
                                autoFocus
                                value={formData.motivo_cambio || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, motivo_cambio: e.target.value }))}
                                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 p-5 rounded-3xl font-bold text-sm text-slate-700 dark:text-white focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 mb-6"
                                placeholder="Ej: Corrección de precio, cambio de proveedor, error de digitación..."
                                rows={3}
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setShowReasonModal(false)}
                                    className="py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleSave()}
                                    className="py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-amber-100 dark:shadow-none transition-all"
                                >
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Custom Confirmation Dialog - Fixed positioning relative to the Modal viewport */}
                {showExitConfirm && (
                    <div className="absolute inset-0 z-[200] flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowExitConfirm(false)}></div>
                        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl relative border border-slate-100 dark:border-slate-800 animate-in zoom-in duration-300">
                            <div className="w-20 h-20 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span className="material-icons-round text-rose-500 text-4xl">warning_amber</span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white text-center uppercase tracking-tighter mb-4">¿Estás seguro?</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-center font-bold text-sm leading-relaxed mb-8 uppercase tracking-widest text-[10px]">
                                Tienes cambios pendientes. Si sales ahora, perderás toda la información ingresada en este requerimiento.
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={onClose}
                                    className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-rose-200 dark:shadow-none transition-all"
                                >
                                    Sí, salir y perder cambios
                                </button>
                                <button
                                    onClick={() => setShowExitConfirm(false)}
                                    className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-200 transition-all"
                                >
                                    No, continuar editando
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div 
                    className="w-full h-full max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col"
                    onScroll={(e) => setIsScrolled(e.currentTarget.scrollTop > 20)}
                >
                    <form onSubmit={handlePreSave} className="flex flex-col flex-1">
                    {/* Header - Aerial Theme & Static Position Fixed via Internal Scroll */}
                    <div className={`sticky top-0 z-[100] transition-all duration-300 flex justify-between items-center px-10 py-8 border-b ${
                        isScrolled 
                        ? 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-slate-100 dark:border-slate-800 shadow-lg' 
                        : 'bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-white/20 dark:border-slate-800/20'
                    }`}>
                        <div className="flex items-center gap-5">
                            <div className={`h-12 w-1.5 bg-indigo-600 rounded-full transition-all duration-500 ${isScrolled ? 'h-8' : 'h-12'} shadow-[0_0_15px_rgba(79,70,229,0.5)]`}></div>
                            <div>
                                <h2 className={`font-black text-slate-900 dark:text-white uppercase tracking-tighter italic transition-all duration-300 ${isScrolled ? 'text-2xl' : 'text-3xl'}`}>
                                    {isView ? `Detalle: ${orden?.codigo_orden}` : isEdit ? `Editar: ${orden?.codigo_orden}` : 'GENERAR ORDEN DE PAGO'}
                                </h2>
                                <p className="text-slate-400 font-bold text-[9px] uppercase tracking-[0.2em] mt-0.5">Gestión de flujo financiero inteligente</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-5">
                            <div className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border shadow-sm transition-all ${
                                formData.estado === 'pagado' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-indigo-600 text-white border-indigo-700 shadow-indigo-200'
                            }`}>
                                {formData.estado}
                            </div>
                            <button 
                                type="button"
                                onClick={handleAttemptClose}
                                className="p-3 bg-white/50 dark:bg-slate-800/50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-2xl transition-all shadow-sm active:scale-95 group/close border border-white/20"
                            >
                                <X className="w-5 h-5 transition-transform group-hover/close:rotate-90" />
                            </button>
                        </div>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* Moneda Selection - Back to main form body */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Moneda del Requerimiento</label>
                            <div className="flex gap-4">
                                {['PEN', 'USD'].map(m => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, moneda: m as 'PEN' | 'USD' })}
                                        className={`flex-1 p-4 rounded-2xl font-black text-sm tracking-widest transition-all border-2 ${
                                            formData.moneda === m 
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                                            : 'bg-white dark:bg-slate-800 border-slate-100 text-slate-400 hover:bg-slate-50'
                                        }`}
                                    >
                                        {m === 'PEN' ? 'Soles (S/)' : 'Dólares ($)'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Main Form */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Proveedor */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Proveedor</label>
                            <select
                                value={formData.proveedor_id || ''}
                                onChange={(e) => setFormData({ ...formData, proveedor_id: e.target.value })}
                                disabled={isView || (isEdit && formData.estado === 'pagado')}
                                className="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 p-4 rounded-2xl font-bold text-slate-700 dark:text-white focus:outline-none focus:border-indigo-500 transition-all shadow-sm disabled:opacity-70 disabled:bg-slate-50"
                                required
                            >
                                <option value="">Seleccionar Proveedor...</option>
                                {proveedores.map(p => (
                                    <option key={p.id} value={p.id}>{p.razon_social} ({p.tax_id})</option>
                                ))}
                            </select>
                        </div>

                        {/* Obra */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Obra / Proyecto</label>
                            <select
                                value={formData.project_id || ''}
                                onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                                disabled={isView || (isEdit && formData.estado === 'pagado')}
                                className="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 p-4 rounded-2xl font-bold text-slate-700 dark:text-white focus:outline-none focus:border-indigo-500 transition-all shadow-sm disabled:opacity-70 disabled:bg-slate-50"
                                required
                            >
                                <option value="">Seleccionar Obra...</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} - {p.project_number}</option>
                                ))}
                            </select>
                        </div>

                         <div></div>
                    </div>

                    {/* Items Section */}
                    <div className="space-y-4 pt-6">
                        <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-t-3xl border border-b-0 border-slate-100 dark:border-slate-700">
                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                <span className="material-icons-round text-indigo-500">list</span>
                                Detalle de Conceptos
                            </h3>
                            {(!isView && (!isEdit || formData.estado !== 'pagado')) && (
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setIncludeIGV(!includeIGV)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
                                            includeIGV 
                                            ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                                            : 'bg-slate-50 border-slate-100 text-slate-400'
                                        }`}
                                    >
                                        <span className="material-icons-round text-sm">
                                            {includeIGV ? 'check_circle' : 'radio_button_unchecked'}
                                        </span>
                                        Incluir IGV (18%)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAddItem}
                                        className="text-xs font-black text-indigo-600 border-2 border-indigo-50 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-all"
                                    >
                                        + Agregar Item
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-b-3xl overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-slate-50/50 dark:bg-slate-700/50">
                                    <tr className="text-left border-b border-slate-100 dark:border-slate-700">
                                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">Cant.</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">P. Unit</th>
                                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-32">Total</th>
                                        <th className="px-4 py-3 w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {detalles.map((item, index) => (
                                        <tr key={index} className="group">
                                            <td className="px-6 py-3">
                                                <input
                                                    type="text"
                                                    value={item.descripcion || ''}
                                                    onChange={(e) => handleItemChange(index, 'descripcion', e.target.value)}
                                                    disabled={isView || (isEdit && formData.estado === 'pagado')}
                                                    className="w-full bg-transparent font-bold text-sm text-slate-700 dark:text-white focus:outline-none placeholder:text-slate-300 disabled:opacity-50"
                                                    placeholder="Ej: Pintura, Servicios técnicos..."
                                                    required
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={item.cantidad || ''}
                                                    onChange={(e) => handleItemChange(index, 'cantidad', e.target.value)}
                                                    onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
                                                    onWheel={(e) => e.currentTarget.blur()}
                                                    disabled={isView || (isEdit && formData.estado === 'pagado')}
                                                    className="w-full bg-transparent font-black text-sm text-slate-700 dark:text-white focus:outline-none disabled:opacity-50"
                                                    required
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={item.precio_unitario || ''}
                                                    onChange={(e) => handleItemChange(index, 'precio_unitario', e.target.value)}
                                                    onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
                                                    onWheel={(e) => e.currentTarget.blur()}
                                                    disabled={isView || (isEdit && formData.estado === 'pagado')}
                                                    className="w-full bg-transparent font-black text-sm text-indigo-600 focus:outline-none disabled:opacity-50"
                                                    required
                                                />
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <span className="font-black text-sm text-slate-900 dark:text-white">
                                                    {(item.subtotal_item || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {detalles.length > 1 && (!isView && (!isEdit || formData.estado !== 'pagado')) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveItem(index)}
                                                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <span className="material-icons-round text-sm">delete</span>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Files Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Factura / Link de Pago (PDF/Imagen)</label>
                            <input
                                type="file"
                                onChange={(e) => setFacturaFile(e.target.files?.[0] || null)}
                                disabled={isView || (isEdit && formData.estado === 'pagado')}
                                className="w-full bg-white dark:bg-slate-800 p-3 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 font-bold text-xs disabled:opacity-50"
                                accept="image/*,.pdf"
                            />
                            {formData.url_factura && (
                                <a href={formData.url_factura} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 font-bold underline px-2">Ver archivo actual</a>
                            )}
                        </div>
                        <div className="space-y-4">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                Evidencia (Fotos Múltiples)
                                <span className="bg-slate-100 text-[10px] px-2 py-0.5 rounded-full text-slate-500">{evidenciaFiles.length + preexistingEvidences.length}</span>
                            </label>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {/* Pre-existing */}
                                {preexistingEvidences.map((url, idx) => (
                                    <div key={`pre-${idx}`} className="relative h-24 rounded-2xl overflow-hidden border border-slate-200 group">
                                        <img src={url} className="w-full h-full object-cover" alt="evidencia" />
                                        <button 
                                            type="button"
                                            onClick={() => setPreexistingEvidences(prev => prev.filter((_, i) => i !== idx))}
                                            disabled={isView || (isEdit && formData.estado === 'pagado')}
                                            className="absolute top-1 right-1 bg-rose-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg disabled:hidden"
                                        >
                                            <span className="material-icons-round text-xs">close</span>
                                        </button>
                                    </div>
                                ))}

                                {/* New Selected */}
                                {evidenciaFiles.map((f, idx) => (
                                    <div key={`new-${idx}`} className="relative h-24 rounded-2xl overflow-hidden border border-indigo-200 group bg-indigo-50/30">
                                        <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" alt="preview" />
                                        <button 
                                            type="button"
                                            onClick={() => setEvidenciaFiles(prev => prev.filter((_, i) => i !== idx))}
                                            className="absolute top-1 right-1 bg-rose-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                        >
                                            <span className="material-icons-round text-xs">close</span>
                                        </button>
                                        <div className="absolute bottom-0 left-0 right-0 bg-indigo-600/80 text-white text-[8px] font-black text-center py-0.5 uppercase">Nuevo</div>
                                    </div>
                                ))}

                                {/* Add Button */}
                                {!isView && (
                                    <button
                                        type="button"
                                        onClick={() => document.getElementById('multi-evidencia')?.click()}
                                        className="h-24 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center hover:border-indigo-400 hover:bg-slate-50 transition-all text-slate-400"
                                    >
                                        <span className="material-icons-round text-xl">add_a_photo</span>
                                        <span className="text-[9px] font-black uppercase mt-1">Agregar</span>
                                    </button>
                                )}
                            </div>

                            <input
                                id="multi-evidencia"
                                type="file"
                                multiple
                                onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    setEvidenciaFiles(prev => [...prev, ...files]);
                                }}
                                className="hidden"
                                accept="image/*"
                            />
                        </div>
                    </div>

                    {/* Summary Card */}
                    <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-xl shadow-indigo-200 dark:shadow-none space-y-4">
                        <div className="flex justify-between items-center text-sm font-bold opacity-80 uppercase tracking-widest">
                            <span>Subtotal</span>
                            <span>{formData.moneda === 'PEN' ? 'S/' : '$'} {formData.monto_subtotal?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm font-bold opacity-80 uppercase tracking-widest">
                            <span>IGV (18%)</span>
                            <span>{formData.moneda === 'PEN' ? 'S/' : '$'} {formData.monto_impuestos?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center pt-4 border-t border-white/20">
                            <span className="text-xl font-black uppercase tracking-tighter">Total Neto a Pagar</span>
                            <span className="text-4xl font-black">{formData.moneda === 'PEN' ? 'S/' : '$'} {formData.monto_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    {/* Actions */}
                    {!isView && (
                        <div className="flex gap-4 pt-6">
                            <button
                                type="button"
                                onClick={handleAttemptClose}
                                className="flex-1 bg-white dark:bg-slate-800 text-slate-500 font-black py-4 rounded-2xl border-2 border-slate-100 dark:border-slate-700 hover:bg-slate-50 transition-all uppercase tracking-widest text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={saving || !isDirty || (isEdit && formData.estado === 'pagado')}
                                className="flex-2 bg-indigo-600 text-white font-black py-4 px-12 rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-widest text-sm disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed"
                            >
                                {saving ? 'Guardando...' : isEdit ? 'Actualizar Orden' : 'Generar Requerimiento'}
                            </button>
                        </div>
                    )}
                    </div>
                </form>
            </div>
            </div>
        </Modal>
    );
};
