import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { exportToExcel } from '../../../services/excelExport';
import type { BusinessInfo } from '../../../services/types';

interface QuotationModalProps {
    isOpen: boolean;
    onClose: () => void;
    optimizationData: {
        boardBreakdown: Array<{ materialLabel: string; count: number }>;
        edge1: number;
        edge2: number;
        clientName: string;
        optimizationId?: string | null;
        optimizationCode?: string | null;
        isLoadedFromHistory?: boolean;
        currentVersion?: number;
    };
    onSaveSuccess?: (newVersion: number, newCode: string) => void;
}

interface QuotationItem {
    quantity: number;
    unit: string;
    type: 'MELAMINA' | 'TAPACANTO' | 'OTROS' | string;
    description: string;
    unitPrice: number;
    total: number;
}

const QuotationModalComponent: React.FC<QuotationModalProps> = ({ isOpen, onClose, optimizationData, onSaveSuccess }) => {
    const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);

    useScrollLock(isOpen);
    // Por defecto, FACTURA (con IGV). Se puede cambiar a BOLETA en el form.
    const [clientData, setClientData] = useState({
        name: optimizationData.clientName || '',
        doi: '',
        address: '',
        deliveryDate: '',
        documentType: 'FACTURA' as 'BOLETA' | 'FACTURA'
    });

    const [items, setItems] = useState<QuotationItem[]>([]);
    const [totals, setTotals] = useState({
        subtotal: 0,
        discount: 0,
        igv: 0,
        total: 0,
        advance: 0,
        balance: 0
    });

    const [lockedCount, setLockedCount] = useState(3);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

    const [quotationCode, setQuotationCode] = useState('COT-XXXXXX');

    useEffect(() => {
        if (!isOpen) return;

        const init = async () => {
            try {
                const info = await api.getBusinessInfo();
                setBusinessInfo(info);

                // Determine Code
                let finalCode = 'COT-XXXXXX';
                if (optimizationData.optimizationCode) {
                    finalCode = optimizationData.optimizationCode.replace('OPT-', 'COT-');
                } else {
                    finalCode = await api.getNextQuotationCode();
                }
                setQuotationCode(finalCode);

                // CHECK IF AN EXISTING QUOTATION EXISTS FOR THIS OPTIMIZATION
                if (optimizationData.optimizationId) {
                    const quotes = await api.getQuotations();
                    const existing = quotes.find(q => q.optimization_id === optimizationData.optimizationId);
                    
                    if (existing) {
                        setClientData({
                            name: existing.client_name || '',
                            doi: existing.client_doi || '',
                            address: existing.client_address || '',
                            deliveryDate: existing.delivery_date || '',
                            documentType: existing.document_type as any
                        });

                        const existingItems = existing.items as any[];
                        setItems(existingItems);
                        // Infer locked count: leading items that are board/tapacanto types
                        let inferredLock = 0;
                        for (const item of existingItems) {
                            if (item.type === 'MELAMINA' || item.type === 'MEDELACK' || item.type === 'TAPACANTO') {
                                inferredLock++;
                            } else { break; }
                        }
                        setLockedCount(Math.max(3, inferredLock));
                        setTotals({
                            subtotal: Number(existing.subtotal),
                            discount: Number(existing.discount),
                            igv: Number(existing.igv),
                            total: Number(existing.total),
                            advance: Number(existing.advance),
                            balance: Number(existing.balance)
                        });
                        return; // Done
                    }
                }

                // If no existing quote, initialize from optimization data — one row per board type
                const boardItems: QuotationItem[] = optimizationData.boardBreakdown.map(b => ({
                    quantity: b.count,
                    unit: 'PLN',
                    type: 'MELAMINA',
                    description: b.materialLabel,
                    unitPrice: 0,
                    total: 0
                }));
                const initialItems: QuotationItem[] = [
                    ...boardItems,
                    {
                        quantity: Number(optimizationData.edge1.toFixed(2)),
                        unit: 'ML',
                        type: 'TAPACANTO',
                        description: 'Canto Delgado',
                        unitPrice: 0,
                        total: 0
                    },
                    {
                        quantity: Number(optimizationData.edge2.toFixed(2)),
                        unit: 'ML',
                        type: 'TAPACANTO',
                        description: 'Canto Grueso',
                        unitPrice: 0,
                        total: 0
                    }
                ];
                setLockedCount(boardItems.length + 2);
                setItems(initialItems);
            } catch (error) {
                console.error("Error initializing quotation modal", error);
            }
        };


        init();
    }, [isOpen]);

    // Recalculate totals
    useEffect(() => {
        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        const discountAmount = totals.discount;
        const baseForIGV = subtotal - discountAmount;
        const igvAmount = clientData.documentType === 'FACTURA' ? baseForIGV * 0.18 : 0;
        const finalTotal = baseForIGV + igvAmount;
        const balance = finalTotal - totals.advance;

        setTotals(prev => ({
            ...prev,
            subtotal,
            igv: igvAmount,
            total: finalTotal,
            balance
        }));
    }, [items, clientData.documentType, totals.discount, totals.advance]);

    const handleUpdateItem = (index: number, field: keyof QuotationItem, value: any) => {
        const newItems = [...items];
        const item = { ...newItems[index], [field]: value };
        
        if (field === 'quantity' || field === 'unitPrice') {
            item.total = Number(item.quantity) * Number(item.unitPrice);
        }
        
        newItems[index] = item;
        setItems(newItems);
    };

    const handleSave = async () => {
        try {
            setSaveStatus('saving');
            let finalCode = quotationCode;
            const finalVersion = optimizationData.currentVersion || 1;

            // Mantener el código del SKU si la cotización proviene de una optimización.
            if (optimizationData.optimizationCode) {
                finalCode = optimizationData.optimizationCode.replace('OPT-', 'COT-');
            }

            // Sanitizar items: el backend exige JSONB válido, sin valores undefined.
            // Antes pasábamos items con propiedades opcionales que en algunos casos
            // (filas personalizadas recién agregadas) llegaban con NaN al guardado
            // — eso devolvía "invalid input syntax for type numeric" sin estado.
            const sanitizedItems = items.map(it => ({
                quantity:    Number.isFinite(it.quantity)  ? Number(it.quantity)  : 0,
                unit:        String(it.unit || ''),
                type:        String(it.type || 'OTROS'),
                description: String(it.description || ''),
                unitPrice:   Number.isFinite(it.unitPrice) ? Number(it.unitPrice) : 0,
                total:       Number.isFinite(it.total)     ? Number(it.total)     : 0,
            }));

            const num = (v: number) => (Number.isFinite(v) ? Number(v) : 0);

            // Construcción de payload. Campos opcionales que estén vacíos se omiten
            // para que la BD aplique sus defaults (issue_date defaultea a CURRENT_DATE)
            // y no se intente insertar una fecha vacía sobre una columna DATE.
            const quotation: Record<string, any> = {
                code: finalCode,
                client_name: clientData.name?.trim() || 'CLIENTE MOSTRADOR',
                document_type: clientData.documentType,
                items: sanitizedItems,
                subtotal: num(totals.subtotal),
                discount: num(totals.discount),
                igv:      num(totals.igv),
                total:    num(totals.total),
                advance:  num(totals.advance),
                balance:  num(totals.balance),
                // issue_date explícito: sin esto el upsert NO actualiza la fecha
                // de emisión y la cotización guardada quedaba con la fecha del
                // primer guardado aunque se editara después.
                issue_date: new Date().toISOString().slice(0, 10),
            };
            if (optimizationData?.optimizationId) {
                quotation.optimization_id = optimizationData.optimizationId;
            }
            if (clientData.doi?.trim())     quotation.client_doi     = clientData.doi.trim();
            if (clientData.address?.trim()) quotation.client_address = clientData.address.trim();
            if (clientData.deliveryDate)    quotation.delivery_date  = clientData.deliveryDate;

            await api.saveQuotation(quotation);
            setSaveStatus('success');

            if (onSaveSuccess) {
                onSaveSuccess(finalVersion, finalCode.replace('COT-', 'OPT-'));
            }

            setTimeout(() => {
                setSaveStatus('idle');
                onClose();
            }, 1500);
        } catch (error: any) {
            // Surface the underlying message — antes solo aparecía un overlay
            // genérico y el detalle quedaba enterrado en console.error.
            console.error("Error guardando cotización:", error);
            const detail = error?.message || error?.details || error?.hint;
            if (detail) {
                // eslint-disable-next-line no-alert
                alert(`No se pudo guardar la cotización:\n\n${detail}`);
            }
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const handleExcelExport = () => {
        exportToExcel({ items, totals, code: quotationCode, clientData, businessInfo }, `Cotizacion_${quotationCode}`);
    };

    const handlePdfExport = async () => {
        const { generateQuotePDF } = await import('../../../services/pdfExport');
        generateQuotePDF({ items, totals, code: quotationCode, clientData, businessInfo }, `Cotizacion_${quotationCode}`);
    };

    const handleDeleteItem = (index: number) => {
        if (index < lockedCount) return;
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/20 overflow-hidden" style={{ backdropFilter: 'blur(6px)' }}>
            <div className="bg-white/90 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-6xl border border-white/50 flex flex-col max-h-[95vh] relative overflow-hidden">
                {/* Subtle top highlight for depth */}
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/50 z-10"></div>

                
                {/* Save Status Overlay */}
                {saveStatus !== 'idle' && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-slate-900/80 backdrop-blur-sm rounded-3xl animate-in fade-in">
                        <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 flex flex-col items-center gap-4 transform transition-all scale-100">
                            {saveStatus === 'saving' && (
                                <>
                                    <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Guardando cotización...</p>
                                </>
                            )}
                            {saveStatus === 'success' && (
                                <>
                                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 rounded-full flex items-center justify-center">
                                        <span className="material-icons-round text-4xl">check</span>
                                    </div>
                                    <h3 className="text-xl font-black tracking-tight text-slate-800 dark:text-white">¡Cotización Guardada!</h3>
                                    <p className="text-sm text-slate-500 font-medium">La cotización se ha registrado exitosamente.</p>
                                </>
                            )}
                            {saveStatus === 'error' && (
                                <>
                                    <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-full flex items-center justify-center">
                                        <span className="material-icons-round text-4xl">error_outline</span>
                                    </div>
                                    <h3 className="text-xl font-black tracking-tight text-slate-800 dark:text-white">Error al Guardar</h3>
                                    <p className="text-sm text-slate-500 font-medium">Ocurrió un problema de conexión. Inténtalo de nuevo.</p>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Header Section */}
                <div className="px-8 py-6 border-b border-slate-200/30 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <span className="material-icons-round text-[40px] text-slate-800 dark:text-white drop-shadow-sm">request_quote</span>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Presupuestador / Cotización</h2>
                            <p className="text-sm font-bold text-slate-400 font-mono">{quotationCode}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex bg-[#e9efee]/60 rounded-2xl p-1 shadow-sm border border-slate-200/30">
                           <button onClick={handlePdfExport} className="flex items-center gap-2 px-4 py-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all font-bold text-xs">
                                <span className="material-icons-round text-sm">picture_as_pdf</span>
                                PDF
                           </button>
                           <div className="w-px bg-slate-200 dark:bg-slate-700 mx-1 self-stretch" />
                           <button onClick={handleExcelExport} className="flex items-center gap-2 px-4 py-2 rounded-xl text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all font-bold text-xs">
                                <span className="material-icons-round text-sm">description</span>
                                EXCEL
                           </button>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 rounded-full text-slate-400 hover:text-slate-600 hover:bg-[#e9efee]/60 flex items-center justify-center transition-all">
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>
                </div>

                {/* Body Section */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    
                    {/* 1. Client & Business Info Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-[#e9efee]/40 p-6 rounded-3xl border border-slate-200/20">
                        {/* Business Info (ReadOnly-ish) */}
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest pl-1">Información de la Empresa</h3>
                            <div className="space-y-1">
                                <p className="text-lg font-black text-slate-800 dark:text-white">{businessInfo?.company_name}</p>
                                <p className="text-xs text-slate-500 font-medium">RUC: {businessInfo?.ruc}</p>
                                <p className="text-xs text-slate-500 font-medium">{businessInfo?.address}</p>
                            </div>
                        </div>

                        {/* Client Form */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Cliente / Razón Social</label>
                                <input 
                                    type="text" 
                                    value={clientData.name} 
                                    onChange={e => setClientData({...clientData, name: e.target.value})}
                                    className="w-full bg-[#e9efee]/50 border-none rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white/80 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">DOI / RUC</label>
                                <input 
                                    type="text" 
                                    value={clientData.doi} 
                                    onChange={e => setClientData({...clientData, doi: e.target.value})}
                                    className="w-full bg-[#e9efee]/50 border-none rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white/80 transition-all"
                                />
                            </div>
                            <div className="flex items-center justify-center gap-4 bg-[#e9efee]/50 border-none rounded-xl px-4 py-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" checked={clientData.documentType === 'BOLETA'} onChange={() => setClientData({...clientData, documentType: 'BOLETA'})} className="accent-indigo-600" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Boleta</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" checked={clientData.documentType === 'FACTURA'} onChange={() => setClientData({...clientData, documentType: 'FACTURA'})} className="accent-indigo-600" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Factura</span>
                                </label>
                            </div>
                            <div className="col-span-2 grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Emisión</label>
                                    <div className="w-full bg-[#e9efee]/40 rounded-xl px-4 py-3 text-xs font-bold text-slate-500 border-none">
                                        {new Date().toLocaleDateString()}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1 text-rose-500">Fecha de Entrega</label>
                                    <input 
                                        type="date" 
                                        value={clientData.deliveryDate}
                                        onChange={e => setClientData({...clientData, deliveryDate: e.target.value})}
                                        className="w-full bg-[#e9efee]/50 border-none rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-rose-500/20 focus:bg-white/80 transition-all" 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. Spreadsheet Table */}
                    <div className="border border-slate-200/20 rounded-3xl overflow-hidden shadow-sm bg-[#e9efee]/30">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-[#e9efee]/50 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                    <th className="px-4 py-4 text-left border-r border-slate-200 dark:border-slate-700 w-20">Cant.</th>
                                    <th className="px-4 py-4 text-left border-r border-slate-200 dark:border-slate-700 w-24">Unidad</th>
                                    <th className="px-4 py-4 text-left border-r border-slate-200 dark:border-slate-700 w-32">Tipo</th>
                                    <th className="px-4 py-4 text-left border-r border-slate-200 dark:border-slate-700">Descripción del Producto</th>
                                    <th className="px-4 py-4 text-right border-r border-slate-200 dark:border-slate-700 w-28">P. Unit</th>
                                    <th className="px-4 py-4 text-right w-28">Total</th>
                                    <th className="px-4 py-4 text-center w-12 text-slate-300"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {items.map((item, idx) => (
                                    <tr key={idx} className="group hover:bg-[#e9efee]/40 transition-colors">
                                        <td className="px-4 py-3 border-r border-slate-100 dark:border-slate-800">
                                            <input 
                                                type="number" 
                                                value={item.quantity} 
                                                onChange={e => handleUpdateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-transparent border-none font-bold text-slate-700 dark:text-slate-200 outline-none text-sm focus:bg-slate-50 transition-colors rounded-lg px-1"
                                            />
                                        </td>
                                        <td className="px-4 py-3 border-r border-slate-100 dark:border-slate-800">
                                            <input
                                                type="text"
                                                value={item.unit}
                                                onChange={e => handleUpdateItem(idx, 'unit', e.target.value)}
                                                className="w-full bg-transparent border-none font-bold text-slate-500 outline-none text-[10px] uppercase"
                                                readOnly={idx < lockedCount}
                                            />
                                        </td>
                                        <td className="px-4 py-3 border-r border-slate-100 dark:border-slate-800">
                                            {idx < lockedCount - 2 ? (
                                                <select
                                                    value={item.type}
                                                    onChange={e => handleUpdateItem(idx, 'type', e.target.value)}
                                                    className="w-full bg-transparent border-none font-black text-[10px] uppercase tracking-wider outline-none text-indigo-600"
                                                >
                                                    <option value="MELAMINA">MELAMINA</option>
                                                    <option value="MEDELACK">MEDELACK</option>
                                                </select>
                                            ) : item.type === 'TAPACANTO' && idx < lockedCount ? (
                                                <div className="w-full font-black text-[10px] uppercase tracking-wider text-emerald-600 px-1">
                                                    TAPACANTO
                                                </div>
                                            ) : (
                                                <select
                                                    value={item.type}
                                                    onChange={e => handleUpdateItem(idx, 'type', e.target.value)}
                                                    className="w-full bg-transparent border-none font-black text-[10px] uppercase tracking-wider outline-none text-slate-400"
                                                >
                                                    <option value="SERVICIOS">SERVICIOS</option>
                                                    <option value="OTROS">OTROS</option>
                                                </select>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 border-r border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="text" 
                                                    value={item.description} 
                                                    onChange={e => handleUpdateItem(idx, 'description', e.target.value)}
                                                    className="w-full bg-transparent border-none font-bold text-slate-700 dark:text-slate-200 outline-none text-sm focus:bg-slate-50 transition-colors rounded-lg px-1"
                                                    placeholder={item.type === 'MELAMINA' || item.type === 'MEDELACK' ? "Ej: Pelikano 18mm..." : item.type === 'TAPACANTO' ? "Ancho, espesor..." : "Descripción..."}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 border-r border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center justify-end gap-1">
                                                <span className="text-slate-400 text-xs text-[10px] font-bold">S/</span>
                                                <input 
                                                    type="number" 
                                                    value={item.unitPrice || ''} 
                                                    onChange={e => handleUpdateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                                                    className="w-20 bg-transparent border-none font-black text-indigo-600 dark:text-indigo-400 text-right outline-none text-sm focus:bg-indigo-50 transition-colors rounded-lg"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-black text-sm text-slate-800">
                                            S/ {item.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {idx >= lockedCount && (
                                                <button 
                                                    onClick={() => handleDeleteItem(idx)}
                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-rose-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                                                >
                                                    <span className="material-icons-round text-sm">delete</span>
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button 
                            onClick={() => setItems([...items, { quantity: 1, unit: 'UND', type: 'OTROS', description: '', unitPrice: 0, total: 0 }])}
                            className="w-full py-4 border-t border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-icons-round text-sm">add</span>
                            AGREGAR FILA PERSONALIZADA
                        </button>
                    </div>

                    {/* 3. Totals Section */}
                    <div className="flex flex-col md:flex-row gap-8 justify-between items-start">
                        {/* Signatures hidden in UI, only for export */}

                        {/* Calculated Totals */}
                        <div className="w-full md:w-80 space-y-3 bg-[#e9efee]/40 p-6 rounded-3xl border border-slate-200/20 shadow-sm">
                            <div className="flex justify-between items-center text-xs text-slate-500 font-bold uppercase tracking-wider">
                                <span>SUB TOTAL</span>
                                <span className="text-slate-700 dark:text-slate-200">S/ {totals.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-rose-500 font-bold uppercase tracking-wider">
                                <span>DESCUENTO</span>
                                <div className="flex items-center gap-1 border-b border-rose-200">
                                    <span className="text-[10px]">- S/</span>
                                    <input 
                                        type="number" 
                                        value={totals.discount || ''} 
                                        onChange={e => setTotals({...totals, discount: parseFloat(e.target.value) || 0})}
                                        className="w-16 bg-transparent border-none text-right font-black outline-none text-rose-500"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            {clientData.documentType === 'FACTURA' && (
                                <div className="flex justify-between items-center text-xs text-indigo-600 font-bold uppercase tracking-wider">
                                    <span>IGV (18%)</span>
                                    <span className="font-black">S/ {totals.igv.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <span className="text-xs font-black tracking-widest uppercase text-slate-400">TOTAL</span>
                                <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">S/ {totals.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-emerald-600 font-bold uppercase tracking-wider pt-4">
                                <span>ADELANTO</span>
                                <div className="flex items-center gap-1 bg-white/20 dark:bg-slate-900 border border-emerald-100 dark:border-emerald-800/40 rounded-lg px-2 py-1 shadow-sm">
                                    <span className="text-[10px]">S/</span>
                                    <input 
                                        type="number" 
                                        value={totals.advance || ''} 
                                        onChange={e => setTotals({...totals, advance: parseFloat(e.target.value) || 0})}
                                        className="w-16 bg-transparent border-none text-right font-black outline-none text-emerald-600"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center pt-3 mt-2 border-t-2 border-dashed border-slate-200 dark:border-slate-700">
                                <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest">SALDO PENDIENTE</span>
                                <span className="text-lg font-black tracking-tighter text-amber-600">S/ {totals.balance.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="px-8 py-5 border-t border-slate-200/20 flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 rounded-2xl text-sm font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
                    >
                        Descartar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saveStatus !== 'idle'}
                        className="px-12 py-3 bg-indigo-600 text-white font-black text-sm rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-500/20 active:scale-[0.98] transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Guardar Cotización
                    </button>
                </div>
            </div>
        </div>
    );
};

export const QuotationModal = React.memo(QuotationModalComponent);
