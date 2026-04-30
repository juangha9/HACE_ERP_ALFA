import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal';
import { api } from '../../services/api';
import type { OrdenPago, Proveedor, Project, DetalleOrden } from '../../services/types';
import { X, Clock, Plus, CloudUpload, Image } from 'lucide-react';

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



    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#2c3434]/20 overflow-hidden animate-in fade-in duration-300" style={{ backdropFilter: 'blur(6px)' }}>
            <div className="bg-white/85 backdrop-blur-[24px] rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-3xl border border-white/50 flex flex-col max-h-[95vh] relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>
                
                {/* Audit Reason Sub-Modal (Popup within Popup) */}
                {showReasonModal && (
                    <div className="absolute inset-0 z-[250] flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="absolute inset-0 bg-[#2c3434]/20 backdrop-blur-sm" onClick={() => setShowReasonModal(false)}></div>
                        <div className="bg-white/95 backdrop-blur-xl w-full max-w-md rounded-[3rem] p-10 shadow-[0_30px_60px_rgba(0,0,0,0.12)] relative border border-white/50 animate-in zoom-in-95 duration-300">
                            <div className="w-16 h-16 bg-[#f0f5f4] rounded-2xl flex items-center justify-center mx-auto mb-6 transform -rotate-6">
                                <Clock className="w-8 h-8 text-[#366480]" />
                            </div>
                            <h3 className="text-2xl font-black text-[#2c3434] text-center uppercase tracking-tighter mb-2">Confirmar Edición</h3>
                            <p className="text-[#8b9ba5] text-center font-bold text-[10px] uppercase tracking-[0.2em] mb-8 leading-relaxed px-4">
                                Para mantener la trazabilidad financiera, explique brevemente el motivo de este cambio.
                            </p>
                            
                            <textarea
                                autoFocus
                                value={formData.motivo_cambio || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, motivo_cambio: e.target.value }))}
                                className="w-full bg-[#f8faf9] border-2 border-transparent focus:border-[#4A90E2] p-5 rounded-3xl font-bold text-sm text-[#2c3434] outline-none transition-all placeholder:text-[#8b9ba5]/50 mb-6"
                                placeholder="Ej: Corrección de precio, cambio de proveedor, error de digitación..."
                                rows={3}
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setShowReasonModal(false)}
                                    className="py-4 bg-[#f8faf9] text-[#8b9ba5] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#e8eded] transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleSave()}
                                    className="py-4 bg-[#4A90E2] hover:bg-[#366480] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-[#4A90E2]/20 transition-all"
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
                        <div className="absolute inset-0 bg-[#2c3434]/40 backdrop-blur-md" onClick={() => setShowExitConfirm(false)}></div>
                        <div className="bg-white/95 backdrop-blur-xl w-full max-w-sm rounded-[2.5rem] p-10 shadow-[0_30px_60px_rgba(0,0,0,0.12)] relative border border-white/50 animate-in zoom-in duration-300">
                            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span className="material-icons-round text-rose-500 text-4xl">warning_amber</span>
                            </div>
                            <h3 className="text-2xl font-black text-[#2c3434] text-center uppercase tracking-tighter mb-4">¿Estás seguro?</h3>
                            <p className="text-[#8b9ba5] text-center font-bold text-sm leading-relaxed mb-8 uppercase tracking-widest text-[10px]">
                                Tienes cambios pendientes. Si sales ahora, perderás toda la información ingresada en este requerimiento.
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={onClose}
                                    className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-rose-600/20 transition-all"
                                >
                                    Sí, salir y perder cambios
                                </button>
                                <button
                                    onClick={() => setShowExitConfirm(false)}
                                    className="w-full py-4 bg-[#f8faf9] text-[#8b9ba5] rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-[#e8eded] transition-all"
                                >
                                    No, continuar editando
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="px-8 py-5 flex items-center justify-between bg-white/40 shrink-0 border-b border-[#f0f5f4]/50">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-black text-[#2c3434] uppercase tracking-tight">
                            {isView ? `Detalle: ${orden?.codigo_orden}` : isEdit ? `Editar: ${orden?.codigo_orden}` : 'Generar Orden de Pago'}
                        </h2>
                        <div className="w-3 h-3 rounded-full bg-[#dcfce7]"></div>
                    </div>
                    <div className="flex items-center gap-6">
                        {formData.estado && formData.estado !== 'borrador' && (
                            <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border shadow-sm transition-all ${
                                formData.estado === 'pagado' ? 'bg-[#dcfce7] text-[#166534] border-[#bbf7d0]' : 'bg-[#e8eded] text-[#366480] border-[#d3dcdb]'
                            }`}>
                                {formData.estado}
                            </div>
                        )}
                        <button onClick={handleAttemptClose} className="text-[#8b9ba5] hover:text-[#2c3434] transition-all"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <form onSubmit={handlePreSave} className="flex flex-col flex-1">

                    <div className="p-6 space-y-5">
                        {/* Moneda Selection */}
                        <div className="flex bg-[#e8eded] rounded-xl p-1 w-fit">
                            {['PEN', 'USD'].map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, moneda: m as 'PEN' | 'USD' })}
                                    className={`px-6 py-2 rounded-lg font-bold text-xs tracking-wide transition-all ${
                                        formData.moneda === m 
                                        ? 'bg-white text-[#366480] shadow-sm' 
                                        : 'text-[#8b9ba5] hover:text-[#366480]'
                                    }`}
                                >
                                    {m === 'PEN' ? 'Soles (S/)' : 'Dólares ($)'}
                                </button>
                            ))}
                        </div>

                        {/* Main Form */}
                        <div className="grid grid-cols-2 gap-6 pt-2">
                        {/* Proveedor */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest ml-1">Proveedor</label>
                            <select
                                value={formData.proveedor_id || ''}
                                onChange={(e) => setFormData({ ...formData, proveedor_id: e.target.value })}
                                disabled={isView || (isEdit && formData.estado === 'pagado')}
                                className="w-full bg-[#f0f5f4] border-none p-3.5 rounded-xl font-bold text-sm text-[#2c3434] outline-none transition-all cursor-pointer"
                                required
                            >
                                <option value="">Seleccionar proveedor...</option>
                                {proveedores.map(p => (
                                    <option key={p.id} value={p.id}>{p.razon_social} ({p.tax_id})</option>
                                ))}
                            </select>
                        </div>

                        {/* Obra */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest ml-1">Obra / Proyecto</label>
                            <select
                                value={formData.project_id || ''}
                                onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                                disabled={isView || (isEdit && formData.estado === 'pagado')}
                                className="w-full bg-[#f0f5f4] border-none p-3.5 rounded-xl font-bold text-sm text-[#2c3434] outline-none transition-all cursor-pointer"
                                required
                            >
                                <option value="">Seleccionar proyecto...</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Items Section */}
                    <div className="space-y-3 pt-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-[11px] font-black text-[#8b9ba5] uppercase tracking-widest">
                                Detalle de Conceptos
                            </h3>
                            {(!isView && (!isEdit || formData.estado !== 'pagado')) && (
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-[#8b9ba5] tracking-tight">Incluir IGV (18%)</span>
                                    <button
                                        type="button"
                                        onClick={() => setIncludeIGV(!includeIGV)}
                                        className={`relative w-10 h-5 rounded-full transition-all ${includeIGV ? 'bg-[#366480]' : 'bg-[#d3dcdb]'}`}
                                    >
                                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${includeIGV ? 'transform translate-x-5' : ''}`}></div>
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        <div className="bg-white rounded-xl overflow-hidden border border-[#e8eded]">
                            <table className="w-full">
                                <thead className="bg-[#e8eded]">
                                    <tr className="text-left">
                                        <th className="px-5 py-3 text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest">Descripción</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest w-20 text-center">Cant.</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest w-28 text-center">P. Unit</th>
                                        <th className="px-5 py-3 text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest text-right w-32">Total</th>
                                        <th className="w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#e8eded]">
                                    {detalles.map((item, index) => (
                                        <tr key={index}>
                                            <td className="px-5 py-3">
                                                <input
                                                    type="text"
                                                    value={item.descripcion || ''}
                                                    onChange={(e) => handleItemChange(index, 'descripcion', e.target.value)}
                                                    disabled={isView || (isEdit && formData.estado === 'pagado')}
                                                    className="w-full bg-transparent font-bold text-xs text-[#2c3434] outline-none placeholder:text-[#d3dcdb]"
                                                    placeholder="Ej. Servicios de consultoría"
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
                                                    className="w-full bg-transparent font-bold text-xs text-[#2c3434] outline-none text-center"
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
                                                    className="w-full bg-transparent font-bold text-xs text-[#366480] outline-none text-center"
                                                    required
                                                />
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <span className="font-black text-xs text-[#2c3434] tabular-nums">
                                                    {formData.moneda === 'PEN' ? 'S/' : '$'} {(item.subtotal_item || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                            </td>
                                            <td className="px-2 py-3 text-center">
                                                {detalles.length > 1 && (!isView && (!isEdit || formData.estado !== 'pagado')) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveItem(index)}
                                                        className="p-1 text-[#8b9ba5] hover:text-rose-500 rounded transition-colors"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {(!isView && (!isEdit || formData.estado !== 'pagado')) && (
                            <button
                                type="button"
                                onClick={handleAddItem}
                                className="flex items-center gap-1.5 text-[10px] font-black text-[#366480] hover:text-[#4A90E2] transition-colors mt-2"
                            >
                                <Plus className="w-4 h-4" /> AGREGAR ITEM
                            </button>
                        )}
                    </div>

                    {/* Files Section */}
                    <div className="grid grid-cols-2 gap-6 pt-4">
                        <div className="space-y-1.5 flex flex-col">
                            <label className="text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest ml-1">Factura / Link de Pago</label>
                            <div className={`flex-1 border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors relative ${facturaFile || formData.url_factura ? 'border-[#4A90E2] bg-[#4A90E2]/5' : 'border-[#e8eded] bg-white/50 hover:border-[#4A90E2]'}`}>
                                <CloudUpload className={`w-6 h-6 mb-2 ${facturaFile || formData.url_factura ? 'text-[#4A90E2]' : 'text-[#8b9ba5]'}`} />
                                <span className={`text-[10px] font-bold px-2 truncate w-full ${facturaFile || formData.url_factura ? 'text-[#366480]' : 'text-[#8b9ba5]'}`}>
                                    {facturaFile ? facturaFile.name : formData.url_factura ? 'Archivo actual guardado' : 'Subir archivo o pegar link'}
                                </span>
                                <input
                                    type="file"
                                    onChange={(e) => setFacturaFile(e.target.files?.[0] || null)}
                                    disabled={isView || (isEdit && formData.estado === 'pagado')}
                                    className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                    accept="image/*,.pdf"
                                />
                                {formData.url_factura && (
                                    <a href={formData.url_factura} target="_blank" rel="noreferrer" className="absolute bottom-2 text-[9px] text-[#4A90E2] font-bold underline z-10">Ver archivo</a>
                                )}
                            </div>
                        </div>
                        <div className="space-y-1.5 flex flex-col">
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-[10px] font-black text-[#8b9ba5] uppercase tracking-widest">Evidencia</label>
                                {(preexistingEvidences.length > 0 || evidenciaFiles.length > 0) && (
                                    <span className="bg-[#e8eded] text-[9px] px-1.5 py-0.5 rounded-full text-[#366480] font-black">
                                        {evidenciaFiles.length + preexistingEvidences.length}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 border-2 border-dashed border-[#e8eded] rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#4A90E2] transition-colors bg-white/50 relative">
                                <Image className="w-6 h-6 text-[#366480] mb-2" />
                                <span className="text-[10px] text-[#8b9ba5] font-bold">Adjuntar comprobante</span>
                                <input
                                    id="multi-evidencia"
                                    type="file"
                                    multiple
                                    onChange={(e) => {
                                        const files = Array.from(e.target.files || []);
                                        setEvidenciaFiles(prev => [...prev, ...files]);
                                    }}
                                    className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                    accept="image/*"
                                    disabled={isView || (isEdit && formData.estado === 'pagado')}
                                />
                            </div>
                            
                            {(preexistingEvidences.length > 0 || evidenciaFiles.length > 0) && (
                                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 pt-1">
                                    {/* Pre-existing */}
                                    {preexistingEvidences.map((url, idx) => (
                                        <div key={`pre-${idx}`} className="relative h-12 w-12 shrink-0 rounded-lg overflow-hidden border border-[#d3dcdb] group">
                                            <img src={url} className="w-full h-full object-cover" alt="evidencia" />
                                            <button 
                                                type="button"
                                                onClick={() => setPreexistingEvidences(prev => prev.filter((_, i) => i !== idx))}
                                                disabled={isView || (isEdit && formData.estado === 'pagado')}
                                                className="absolute top-0.5 right-0.5 bg-rose-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg disabled:hidden"
                                            >
                                                <X className="w-2 h-2" />
                                            </button>
                                        </div>
                                    ))}

                                    {/* New Selected */}
                                    {evidenciaFiles.map((f, idx) => (
                                        <div key={`new-${idx}`} className="relative h-12 w-12 shrink-0 rounded-lg overflow-hidden border border-[#4A90E2]/30 group bg-[#f0f5f4]">
                                            <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" alt="preview" />
                                            <button 
                                                type="button"
                                                onClick={() => setEvidenciaFiles(prev => prev.filter((_, i) => i !== idx))}
                                                className="absolute top-0.5 right-0.5 bg-rose-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                            >
                                                <X className="w-2 h-2" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    </div>

                    {/* Summary and Actions */}
                    <div className="bg-[#f4f7f6]/60 p-6 border-t border-[#e8eded]/50 flex flex-col gap-6">
                        <div className="flex justify-end items-end gap-12">
                            <div className="flex flex-col items-center">
                                <span className="text-[9px] font-black text-[#8b9ba5] uppercase tracking-widest mb-1">Subtotal</span>
                                <span className="text-sm font-black text-[#8b9ba5]">{formData.moneda === 'PEN' ? 'S/' : '$'} {formData.monto_subtotal?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-[9px] font-black text-[#8b9ba5] uppercase tracking-widest mb-1">IGV (18%)</span>
                                <span className="text-sm font-black text-[#8b9ba5]">{formData.moneda === 'PEN' ? 'S/' : '$'} {formData.monto_impuestos?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex flex-col items-end ml-4">
                                <span className="text-[10px] font-black text-[#4A90E2] uppercase tracking-widest mb-1">Total Neto a Pagar</span>
                                <span className="text-2xl font-black text-[#2c3434]">{formData.moneda === 'PEN' ? 'S/' : '$'} {formData.monto_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        {!isView && (
                            <div className="flex justify-end gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={handleAttemptClose}
                                    className="px-6 py-2.5 rounded-lg border border-[#d3dcdb] bg-white text-[#8b9ba5] font-black text-[10px] uppercase tracking-widest hover:bg-[#f0f5f4] transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || !isDirty || (isEdit && formData.estado === 'pagado')}
                                    className="px-6 py-2.5 rounded-lg bg-[#366480] text-white font-black text-[10px] uppercase tracking-widest hover:bg-[#2c4e66] transition-all shadow-md disabled:opacity-50"
                                >
                                    {saving ? 'Guardando...' : isEdit ? 'Actualizar Orden' : 'Generar Requerimiento'}
                                </button>
                            </div>
                        )}
                    </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
