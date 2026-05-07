import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { RangeDatePicker } from '../components/RangeDatePicker';
import type { BusinessInfo } from '../services/types';
import {
    Search, Plus, Trash2, ChevronDown,
    RefreshCw, FileText, CheckCircle2, Calendar, Receipt,
    Copy,
} from 'lucide-react';
import { generateQuotePDF } from '../services/pdfExport';
import { exportToExcel } from '../services/excelExport';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
    id: string;
    cantidad: number;
    unidad: string;
    descripcion: string;
    precio_unitario: number;
    total: number;
}

interface Cotizacion {
    id: string;
    codigo: string;
    estado: 'BORRADOR' | 'LISTO';
    tipo_documento: 'COTIZACION' | 'BOLETA' | 'FACTURA';
    cliente_nombre: string;
    cliente_doi: string;
    cliente_direccion: string;
    cliente_telefono: string;
    cliente_email: string;
    fecha_emision: string;
    fecha_entrega: string | null;
    items: LineItem[];
    subtotal: number;
    descuento: number;
    igv: number;
    total: number;
    adelanto: number;
    saldo_pendiente: number;
    notas: string;
    condiciones_pago: string;
    created_at: string;
}

type TipoDoc = 'BOLETA' | 'FACTURA';

interface FormState {
    estado: 'BORRADOR' | 'LISTO';
    tipo_documento: TipoDoc;
    cliente_nombre: string;
    cliente_doi: string;
    cliente_direccion: string;
    cliente_telefono: string;
    cliente_email: string;
    fecha_emision: string;
    fecha_entrega: string | null;
    items: LineItem[];
    subtotal: number;
    descuento: number;
    igv: number;
    total: number;
    adelanto: number;
    saldo_pendiente: number;
    notas: string;
    condiciones_pago: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIDADES = ['UND', 'PLN', 'PLS', 'JGO', 'SET', 'PZA', 'M2', 'ML', 'MTS', 'KG', 'GLN', 'HRS', 'SERV'];
const IGV_RATE = 0.18;

const emptyForm = (): FormState => ({
    estado: 'BORRADOR',
    tipo_documento: 'FACTURA',
    cliente_nombre: '',
    cliente_doi: '',
    cliente_direccion: '',
    cliente_telefono: '',
    cliente_email: '',
    fecha_emision: format(new Date(), 'yyyy-MM-dd'),
    fecha_entrega: null,
    items: [{ id: crypto.randomUUID(), cantidad: 1, unidad: 'UND', descripcion: '', precio_unitario: 0, total: 0 }],
    subtotal: 0,
    descuento: 0,
    igv: 0,
    total: 0,
    adelanto: 0,
    saldo_pendiente: 0,
    notas: '',
    condiciones_pago: '',
});

// ─── Search Input (isolated to avoid re-render on parent state) ───────────────

const SearchInput = React.memo(({ value, onSearch, placeholder, className }: {
    value: string; onSearch: (v: string) => void; placeholder: string; className: string;
}) => {
    const [local, setLocal] = React.useState(value);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    React.useEffect(() => { setLocal(value); }, [value]);
    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocal(e.target.value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onSearch(e.target.value), 250);
    };
    return <input type="text" value={local} onChange={onChange} placeholder={placeholder} className={className} />;
});

// Combobox for unit field: clears on focus so datalist shows ALL options, then
// restores to last typed/selected value on blur.
const UnitCombobox = React.memo(({ value, onChange, listId, className }: {
    value: string; onChange: (v: string) => void; listId: string; className: string;
}) => {
    const [display, setDisplay] = React.useState(value);
    const lastRef = React.useRef(value);
    const focusedRef = React.useRef(false);
    React.useEffect(() => {
        if (!focusedRef.current) { setDisplay(value); lastRef.current = value; }
    }, [value]);
    return (
        <input
            type="text"
            list={listId}
            value={display}
            onFocus={() => { focusedRef.current = true; setDisplay(''); }}
            onChange={e => { const v = e.target.value.toUpperCase(); setDisplay(v); lastRef.current = v; onChange(v); }}
            onBlur={() => { focusedRef.current = false; setDisplay(lastRef.current || value); }}
            className={className}
        />
    );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtSol = (n: number) =>
    `S/ ${(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function recalc(items: LineItem[], descuento: number, tipo: TipoDoc, adelanto: number) {
    const subtotal = items.reduce((s, it) => s + it.total, 0);
    const base = Math.max(0, subtotal - descuento);
    const igv = tipo === 'FACTURA' ? parseFloat((base * IGV_RATE).toFixed(2)) : 0;
    const total = parseFloat((base + igv).toFixed(2));
    const saldo_pendiente = parseFloat((total - adelanto).toFixed(2));
    return { subtotal, igv, total, saldo_pendiente };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ estado }: { estado: 'BORRADOR' | 'LISTO' }) =>
    estado === 'LISTO' ? (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
            <CheckCircle2 className="w-3 h-3" /> Listo
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest">
            <FileText className="w-3 h-3" /> Borrador
        </span>
    );

// ─── Editor Modal ─────────────────────────────────────────────────────────────

interface EditorModalProps {
    isOpen: boolean;
    editingCode: string;
    form: FormState;
    businessInfo: BusinessInfo | null;
    saveStatus: 'idle' | 'saving' | 'success' | 'error';
    onClose: () => void;
    onSaveBorrador: () => void;
    onSaveListo: () => void;
    onFormChange: (f: FormState) => void;
    onUpdateItem: (id: string, field: keyof LineItem, raw: string) => void;
    onAddRow: () => void;
    onRemoveRow: (id: string) => void;
    onDescuentoChange: (val: string) => void;
    onAdelantoChange: (val: string) => void;
    onTipoDocumento: (tipo: TipoDoc) => void;
    onExportPDF: () => void;
    onExportExcel: () => void;
    isReadOnly: boolean;
}

const EditorModal: React.FC<EditorModalProps> = ({
    isOpen, editingCode, form, businessInfo, saveStatus,
    onClose, onSaveBorrador, onSaveListo, onFormChange,
    onUpdateItem, onAddRow, onRemoveRow, onDescuentoChange,
    onAdelantoChange, onTipoDocumento,
    onExportPDF, onExportExcel, isReadOnly,
}) => {
    const [showProcesarConfirm, setShowProcesarConfirm] = useState(false);

    if (!isOpen) return null;

    return createPortal(
        <>
            <div
                className="fixed inset-0 z-[2000] flex items-center justify-center p-4 overflow-hidden"
                style={{ backdropFilter: 'blur(10px)', background: 'rgba(15, 23, 30, 0.35)' }}
                onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            >
                <div className="bg-white/88 backdrop-blur-[24px] rounded-[32px] shadow-[0_32px_80px_rgba(0,0,0,0.18),0_0_0_1px_rgba(255,255,255,0.6)_inset] w-full max-w-5xl flex flex-col max-h-[92vh] relative overflow-hidden border border-white/50">

                    {/* Top highlight edge */}
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent z-10 pointer-events-none" />

                    {/* Save status overlay */}
                    {saveStatus !== 'idle' && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-[32px]">
                            <div className="text-center p-8 bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col items-center gap-4">
                                {saveStatus === 'saving' && (
                                    <>
                                        <div className="w-12 h-12 border-4 border-[#d1dfe3] border-t-[#366480] rounded-full animate-spin" />
                                        <p className="text-sm font-bold text-slate-600">Procesando cotización...</p>
                                    </>
                                )}
                                {saveStatus === 'success' && (
                                    <>
                                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                            <span className="material-icons-round text-4xl">check</span>
                                        </div>
                                        <h3 className="text-xl font-black tracking-tight text-slate-800">¡Cotización Procesada!</h3>
                                        <p className="text-sm text-slate-500 font-medium">La venta se registró en Gestión de Ventas y Tesorería.</p>
                                    </>
                                )}
                                {saveStatus === 'error' && (
                                    <>
                                        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
                                            <span className="material-icons-round text-4xl">error_outline</span>
                                        </div>
                                        <h3 className="text-xl font-black tracking-tight text-slate-800">Error al Guardar</h3>
                                        <p className="text-sm text-slate-500 font-medium">Ocurrió un problema. Inténtalo de nuevo.</p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Header */}
                    <div className="px-8 py-5 border-b border-white/30 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-4">
                            <span className="material-icons-round text-[36px] text-slate-700 drop-shadow-sm">request_quote</span>
                            <div>
                                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Presupuestador / Cotización</h2>
                                <p className="text-[11px] font-bold text-slate-400 font-mono">{editingCode || 'Nueva Cotización'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex bg-slate-100/60 rounded-2xl p-1 shadow-sm border border-white/40">
                                <button
                                    onClick={onExportPDF}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-rose-500 hover:bg-rose-50/80 transition-all font-bold text-xs"
                                >
                                    <span className="material-icons-round text-sm">picture_as_pdf</span>
                                    PDF
                                </button>
                                <div className="w-px bg-slate-200 mx-1 self-stretch" />
                                <button
                                    onClick={onExportExcel}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-emerald-600 hover:bg-emerald-50/80 transition-all font-bold text-xs"
                                >
                                    <span className="material-icons-round text-sm">description</span>
                                    EXCEL
                                </button>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-10 h-10 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 flex items-center justify-center transition-all"
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
                    </div>

                    {/* Scrollable body */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-6">

                        {/* Read-only notice */}
                        {isReadOnly && (
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700">
                                <span className="material-icons-round text-sm">lock</span>
                                <p className="text-xs font-bold">Esta cotización está procesada y solo puede visualizarse.</p>
                            </div>
                        )}

                        {/* 1. Business info + Client form */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/40 p-6 rounded-3xl border border-white/40 shadow-sm">
                            {/* Business info */}
                            <div className="space-y-3">
                                <h3 className="text-[10px] font-black text-[#366480] uppercase tracking-widest pl-1">Información de la Empresa</h3>
                                <div className="space-y-1">
                                    <p className="text-lg font-black text-slate-800">{businessInfo?.company_name || '—'}</p>
                                    <p className="text-xs text-slate-500 font-medium">RUC: {businessInfo?.ruc || '—'}</p>
                                    <p className="text-xs text-slate-500 font-medium">{businessInfo?.address || '—'}</p>
                                </div>
                            </div>

                            {/* Client form */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Cliente / Razón Social</label>
                                    <input
                                        type="text"
                                        value={form.cliente_nombre}
                                        onChange={e => onFormChange({ ...form, cliente_nombre: e.target.value })}
                                        readOnly={isReadOnly}
                                        className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#366480]/20 focus:bg-white/80 transition-all"
                                        placeholder="Nombre o Razón Social..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">DOI / RUC</label>
                                    <input
                                        type="text"
                                        value={form.cliente_doi}
                                        onChange={e => onFormChange({ ...form, cliente_doi: e.target.value })}
                                        readOnly={isReadOnly}
                                        className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#366480]/20 focus:bg-white/80 transition-all"
                                        placeholder="RUC / DNI..."
                                    />
                                </div>
                                <div className="flex items-center justify-center gap-4 bg-white/40 border border-white/50 rounded-xl px-4 py-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            checked={form.tipo_documento === 'BOLETA'}
                                            onChange={() => onTipoDocumento('BOLETA')}
                                            disabled={isReadOnly}
                                            className="accent-[#366480]"
                                        />
                                        <span className="text-xs font-bold text-slate-600">Boleta</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            checked={form.tipo_documento === 'FACTURA'}
                                            onChange={() => onTipoDocumento('FACTURA')}
                                            disabled={isReadOnly}
                                            className="accent-[#366480]"
                                        />
                                        <span className="text-xs font-bold text-slate-600">Factura</span>
                                    </label>
                                </div>
                                <div className="col-span-2 grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Emisión</label>
                                        <div className="w-full bg-white/30 border border-white/40 rounded-xl px-4 py-3 text-xs font-bold text-slate-500">
                                            {form.fecha_emision
                                                ? format(new Date(form.fecha_emision + 'T12:00:00'), 'dd/MM/yyyy')
                                                : new Date().toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1 pl-1">Fecha de Entrega</label>
                                        <input
                                            type="date"
                                            value={form.fecha_entrega || ''}
                                            onChange={e => onFormChange({ ...form, fecha_entrega: e.target.value || null })}
                                            readOnly={isReadOnly}
                                            className="w-full bg-white/50 border border-white/60 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-rose-500/20 focus:bg-white/80 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Items table */}
                        <datalist id="cot-unidades">
                            {UNIDADES.map(u => <option key={u} value={u} />)}
                        </datalist>
                        <div className="border border-white/40 rounded-3xl overflow-auto shadow-sm bg-white/30">
                            <table className="w-full min-w-[640px] border-collapse">
                                <thead>
                                    <tr className="bg-white/40 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                        <th className="px-4 py-4 text-left border-r border-white/50 w-20">Cant.</th>
                                        <th className="px-4 py-4 text-left border-r border-white/50 w-24">Unidad</th>
                                        <th className="px-4 py-4 text-left border-r border-white/50 min-w-[220px]">Descripción</th>
                                        <th className="px-4 py-4 text-center border-r border-white/50 w-32">P. Unit</th>
                                        <th className="px-4 py-4 text-center w-32">Total</th>
                                        <th className="px-4 py-4 w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/40">
                                    {form.items.map((item, idx) => (
                                        <tr key={item.id} className="group hover:bg-white/40 transition-colors">
                                            <td className="px-4 py-3 border-r border-white/30">
                                                <input
                                                    type="number"
                                                    value={item.cantidad || ''}
                                                    onChange={e => onUpdateItem(item.id, 'cantidad', e.target.value)}
                                                    readOnly={isReadOnly}
                                                    className="w-full bg-transparent border-none font-bold text-slate-700 outline-none text-sm focus:bg-white/60 transition-colors rounded-lg px-1"
                                                    placeholder="0"
                                                />
                                            </td>
                                            <td className="px-4 py-3 border-r border-white/30">
                                                {isReadOnly ? (
                                                    <span className="font-bold text-slate-500 text-[11px] uppercase">{item.unidad}</span>
                                                ) : (
                                                    <UnitCombobox
                                                        value={item.unidad}
                                                        onChange={v => onUpdateItem(item.id, 'unidad', v)}
                                                        listId="cot-unidades"
                                                        className="w-full bg-transparent border-none font-bold text-slate-500 outline-none text-[11px] uppercase cursor-pointer"
                                                    />
                                                )}
                                            </td>
                                            <td className="px-4 py-3 border-r border-white/30 min-w-[220px]">
                                                <input
                                                    type="text"
                                                    value={item.descripcion}
                                                    onChange={e => onUpdateItem(item.id, 'descripcion', e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter' && idx === form.items.length - 1) onAddRow(); }}
                                                    readOnly={isReadOnly}
                                                    className="w-full bg-transparent border-none font-bold text-slate-700 outline-none text-sm focus:bg-white/60 transition-colors rounded-lg px-1"
                                                    placeholder="Descripción del producto o servicio..."
                                                    title={item.descripcion}
                                                />
                                            </td>
                                            <td className="px-4 py-3 border-r border-white/30">
                                                <div className="flex items-center justify-end gap-1">
                                                    <span className="text-slate-400 text-[10px] font-bold">S/</span>
                                                    <input
                                                        type="number"
                                                        value={item.precio_unitario || ''}
                                                        onChange={e => onUpdateItem(item.id, 'precio_unitario', e.target.value)}
                                                        readOnly={isReadOnly}
                                                        className="w-20 bg-transparent border-none font-black text-[#366480] text-right outline-none text-sm focus:bg-[#f0f5f4]/60 transition-colors rounded-lg"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-sm text-slate-800">
                                                S/ {item.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {!isReadOnly && (
                                                    <button
                                                        onClick={() => onRemoveRow(item.id)}
                                                        disabled={form.items.length === 1}
                                                        className="w-8 h-8 rounded-full flex items-center justify-center text-rose-300 hover:text-rose-600 hover:bg-rose-50/60 transition-all disabled:opacity-0 disabled:pointer-events-none"
                                                    >
                                                        <span className="material-icons-round text-sm">delete</span>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!isReadOnly && (
                                <button
                                    onClick={onAddRow}
                                    className="w-full py-4 border-t border-white/40 text-xs font-bold text-slate-400 hover:text-[#366480] hover:bg-white/30 transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-icons-round text-sm">add</span>
                                    AGREGAR FILA PERSONALIZADA
                                </button>
                            )}
                        </div>

                        {/* 3. Totals */}
                        <div className="flex justify-end">
                            <div className="w-full md:w-80 space-y-3 bg-white/40 p-6 rounded-3xl border border-white/40 shadow-sm">
                                <div className="flex justify-between items-center text-xs text-slate-500 font-bold uppercase tracking-wider">
                                    <span>Sub Total</span>
                                    <span className="text-slate-700">S/ {form.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-rose-500 font-bold uppercase tracking-wider">
                                    <span>Descuento</span>
                                    <div className="flex items-center gap-1 border-b border-rose-200">
                                        <span className="text-[10px]">- S/</span>
                                        <input
                                            type="number"
                                            value={form.descuento || ''}
                                            onChange={e => onDescuentoChange(e.target.value)}
                                            readOnly={isReadOnly}
                                            className="w-16 bg-transparent border-none text-right font-black outline-none text-rose-500"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                {form.tipo_documento === 'FACTURA' && (
                                    <div className="flex justify-between items-center text-xs text-[#366480] font-bold uppercase tracking-wider">
                                        <span>IGV (18%)</span>
                                        <span className="font-black">S/ {form.igv.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="pt-3 border-t border-white/50 flex justify-between items-center">
                                    <span className="text-xs font-black tracking-widest uppercase text-slate-400">Total</span>
                                    <span className="text-2xl font-black text-[#366480]">
                                        S/ {form.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-emerald-600 font-bold uppercase tracking-wider pt-4">
                                    <span>Adelanto</span>
                                    <div className="flex items-center gap-1 bg-white/50 border border-emerald-100 rounded-lg px-2 py-1 shadow-sm">
                                        <span className="text-[10px]">S/</span>
                                        <input
                                            type="number"
                                            value={form.adelanto || ''}
                                            onChange={e => onAdelantoChange(e.target.value)}
                                            readOnly={isReadOnly}
                                            className="w-16 bg-transparent border-none text-right font-black outline-none text-emerald-600"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-between items-center pt-3 mt-2 border-t-2 border-dashed border-white/50">
                                    <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Saldo Pendiente</span>
                                    <span className="text-lg font-black tracking-tighter text-amber-600">
                                        S/ {(form.saldo_pendiente || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-5 border-t border-white/30 flex justify-between items-center shrink-0">
                        <StatusBadge estado={form.estado} />
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="px-6 py-3 rounded-2xl text-sm font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
                            >
                                {isReadOnly ? 'Cerrar' : 'Descartar'}
                            </button>
                            {!isReadOnly && (
                                <>
                                    <button
                                        onClick={onSaveBorrador}
                                        disabled={saveStatus !== 'idle'}
                                        className="px-6 py-3 rounded-2xl border border-slate-200/60 bg-white/50 text-sm font-black text-slate-600 hover:bg-white/80 uppercase tracking-widest transition-all disabled:opacity-50"
                                    >
                                        Guardar Borrador
                                    </button>
                                    <button
                                        onClick={() => setShowProcesarConfirm(true)}
                                        disabled={saveStatus !== 'idle'}
                                        className="px-10 py-3 bg-[#366480] text-white font-black text-sm rounded-2xl hover:bg-[#2c5268] shadow-xl shadow-[#366480]/20 active:scale-[0.98] transition-all uppercase tracking-widest disabled:opacity-50"
                                    >
                                        Procesar Cotización
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation modal */}
            {showProcesarConfirm && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[4px]">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center">
                        <span className="material-icons-round text-amber-500 text-4xl mb-4">warning</span>
                        <h3 className="text-lg font-black mb-2 text-slate-800">¿Procesar Cotización?</h3>
                        <p className="text-sm text-slate-500 mb-6">Esta acción no puede revertirse. La cotización quedará bloqueada y ya no se podrá editar, solo visualizar.</p>
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setShowProcesarConfirm(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => { setShowProcesarConfirm(false); onSaveListo(); }}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-[#366480] text-white font-black text-sm hover:bg-[#2c5268] transition-all"
                            >
                                Procesar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CotizacionesPage() {
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingCode, setEditingCode] = useState('');

    // List state
    const [loading, setLoading] = useState(true);
    const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState<'TODOS' | 'BORRADOR' | 'LISTO'>('TODOS');
    const now = new Date();
    const [startDate, setStartDate] = useState(format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(now, 'yyyy-MM-dd'));
    const [quickFilter, setQuickFilter] = useState<'HOY' | 'ULTIMOS_7' | 'MES_ACTUAL' | 'PERSONALIZADO'>('ULTIMOS_7');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const datePickerRef = useRef<HTMLDivElement>(null);

    // Editor state
    const [form, setForm] = useState<FormState>(emptyForm());
    const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Click outside date picker
    useEffect(() => {
        const fn = (e: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node))
                setShowDatePicker(false);
        };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, []);

    // Business info when editor opens
    useEffect(() => {
        if (editorOpen) {
            api.getBusinessInfo().then(setBusinessInfo).catch(() => {});
        }
    }, [editorOpen]);

    // Lock scroll when editor is open
    useEffect(() => {
        document.body.style.overflow = editorOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [editorOpen]);

    // ── Data ─────────────────────────────────────────────────────────────────

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            let q = supabase
                .from('cotizaciones')
                .select('*')
                .gte('fecha_emision', startDate)
                .lte('fecha_emision', endDate)
                .order('created_at', { ascending: false });
            if (filterEstado !== 'TODOS') q = q.eq('estado', filterEstado);
            const { data, error } = await q;
            if (error) throw error;
            setCotizaciones((data as Cotizacion[]) || []);
        } catch (e: any) {
            console.error(e);
            setFetchError(e?.message || 'Error desconocido al cargar cotizaciones');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, filterEstado]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return cotizaciones;
        const q = searchTerm.toLowerCase();
        return cotizaciones.filter(c =>
            c.codigo?.toLowerCase().includes(q) ||
            c.cliente_nombre?.toLowerCase().includes(q) ||
            c.cliente_doi?.toLowerCase().includes(q)
        );
    }, [cotizaciones, searchTerm]);

    // ── Quick date filter ─────────────────────────────────────────────────────

    const applyQuickFilter = (val: typeof quickFilter) => {
        setQuickFilter(val);
        const n = new Date();
        if (val === 'HOY') {
            const d = format(n, 'yyyy-MM-dd');
            setStartDate(d); setEndDate(d);
        } else if (val === 'ULTIMOS_7') {
            setStartDate(format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd'));
            setEndDate(format(n, 'yyyy-MM-dd'));
        } else if (val === 'MES_ACTUAL') {
            setStartDate(format(startOfMonth(n), 'yyyy-MM-dd'));
            setEndDate(format(endOfMonth(n), 'yyyy-MM-dd'));
        }
    };

    // ── Editor helpers ─────────────────────────────────────────────────────────

    const openNew = () => {
        setForm(emptyForm());
        setEditingId(null);
        setEditingCode('');
        setEditorOpen(true);
    };

    const openEdit = (c: Cotizacion) => {
        const tipo: TipoDoc = c.tipo_documento === 'BOLETA' ? 'BOLETA' : 'FACTURA';
        setForm({
            estado: c.estado,
            tipo_documento: tipo,
            cliente_nombre: c.cliente_nombre || '',
            cliente_doi: c.cliente_doi || '',
            cliente_direccion: c.cliente_direccion || '',
            cliente_telefono: c.cliente_telefono || '',
            cliente_email: c.cliente_email || '',
            fecha_emision: c.fecha_emision || format(new Date(), 'yyyy-MM-dd'),
            fecha_entrega: c.fecha_entrega || null,
            items: c.items?.length
                ? c.items
                : [{ id: crypto.randomUUID(), cantidad: 1, unidad: 'UND', descripcion: '', precio_unitario: 0, total: 0 }],
            subtotal: c.subtotal || 0,
            descuento: c.descuento || 0,
            igv: c.igv || 0,
            total: c.total || 0,
            adelanto: c.adelanto || 0,
            saldo_pendiente: c.saldo_pendiente || 0,
            notas: c.notas || '',
            condiciones_pago: c.condiciones_pago || '',
        });
        setEditingId(c.id);
        setEditingCode(c.codigo || '');
        setEditorOpen(true);
    };

    const closeEditor = () => setEditorOpen(false);

    const updateItem = (id: string, field: keyof LineItem, raw: string) => {
        setForm(prev => {
            const items = prev.items.map(it => {
                if (it.id !== id) return it;
                const val = (field === 'cantidad' || field === 'precio_unitario') ? parseFloat(raw) || 0 : raw;
                const updated = { ...it, [field]: val } as LineItem;
                if (field === 'cantidad' || field === 'precio_unitario') {
                    updated.total = parseFloat((updated.cantidad * updated.precio_unitario).toFixed(2));
                }
                return updated;
            });
            return { ...prev, items, ...recalc(items, prev.descuento, prev.tipo_documento, prev.adelanto) };
        });
    };

    const addRow = () => {
        setForm(prev => ({
            ...prev,
            items: [...prev.items, { id: crypto.randomUUID(), cantidad: 1, unidad: 'UND', descripcion: '', precio_unitario: 0, total: 0 }],
        }));
    };

    const removeRow = (id: string) => {
        setForm(prev => {
            const items = prev.items.filter(it => it.id !== id);
            return { ...prev, items, ...recalc(items, prev.descuento, prev.tipo_documento, prev.adelanto) };
        });
    };

    const setDescuento = (val: string) => {
        const d = parseFloat(val) || 0;
        setForm(prev => ({ ...prev, descuento: d, ...recalc(prev.items, d, prev.tipo_documento, prev.adelanto) }));
    };

    const setAdelanto = (val: string) => {
        const a = parseFloat(val) || 0;
        setForm(prev => ({
            ...prev,
            adelanto: a,
            saldo_pendiente: parseFloat((prev.total - a).toFixed(2)),
        }));
    };

    const setTipoDocumento = (tipo: TipoDoc) => {
        setForm(prev => ({
            ...prev,
            tipo_documento: tipo,
            ...recalc(prev.items, prev.descuento, tipo, prev.adelanto),
        }));
    };

    const handleExportPDF = () => {
        const exportData = {
            items: form.items.map(it => ({
                quantity: it.cantidad,
                unit: it.unidad,
                type: 'PRODUCTO',
                description: it.descripcion,
                unitPrice: it.precio_unitario,
                total: it.total
            })),
            totals: {
                subtotal: form.subtotal,
                discount: form.descuento,
                igv: form.igv,
                total: form.total,
                advance: form.adelanto,
                balance: form.saldo_pendiente
            },
            code: editingCode || 'NUEVA',
            clientData: {
                name: form.cliente_nombre,
                doi: form.cliente_doi,
                address: form.cliente_direccion,
                deliveryDate: form.fecha_entrega
            },
            businessInfo: businessInfo
        };
        generateQuotePDF(exportData, `Cotizacion_${editingCode || 'Nueva'}`);
    };

    const handleExportExcel = () => {
        exportToExcel({
            items: form.items.map(it => ({
                quantity: it.cantidad,
                unit: it.unidad,
                type: 'PRODUCTO',
                description: it.descripcion,
                unitPrice: it.precio_unitario,
                total: it.total,
            })),
            totals: {
                subtotal: form.subtotal,
                discount: form.descuento,
                igv: form.igv,
                total: form.total,
                advance: form.adelanto,
                balance: form.saldo_pendiente,
            },
            code: editingCode || 'NUEVA',
            clientData: {
                name: form.cliente_nombre,
                address: form.cliente_direccion,
                doi: form.cliente_doi,
                deliveryDate: form.fecha_entrega,
            },
            businessInfo,
        }, `Cotizacion_${editingCode || 'Nueva'}`);
    };

    const syncItemsTable = async (cotizacionId: string, items: LineItem[]) => {
        await supabase.from('cotizaciones_items').delete().eq('cotizacion_id', cotizacionId);
        const rows = items
            .filter(it => it.descripcion.trim() !== '' || it.cantidad > 0)
            .map((it, idx) => ({
                cotizacion_id:   cotizacionId,
                linea:           idx + 1,
                cantidad:        it.cantidad,
                unidad:          it.unidad,
                descripcion:     it.descripcion,
                precio_unitario: it.precio_unitario,
                total:           it.total,
            }));
        if (rows.length > 0) {
            await supabase.from('cotizaciones_items').insert(rows);
        }
    };

    const save = async (estadoOverride?: 'BORRADOR' | 'LISTO') => {
        setSaveStatus('saving');
        try {
            const payload = { ...form, estado: estadoOverride ?? form.estado };
            let cotizacionId = editingId;

            if (editingId) {
                const { error } = await supabase.from('cotizaciones').update(payload).eq('id', editingId);
                if (error) throw error;
            } else {
                const { data: inserted, error } = await supabase
                    .from('cotizaciones')
                    .insert(payload)
                    .select('id')
                    .single();
                if (error) throw error;
                cotizacionId = inserted.id;
            }

            if (cotizacionId) {
                await syncItemsTable(cotizacionId, form.items);
            }

            if (estadoOverride === 'LISTO' && cotizacionId) {
                await supabase.rpc('cotizacion_to_venta', { p_cotizacion_id: cotizacionId }).maybeSingle();
            }

            setSaveStatus('success');
            if (estadoOverride === 'LISTO') setFilterEstado('TODOS');
            await fetchData();
            setTimeout(() => { setSaveStatus('idle'); closeEditor(); }, 1500);
        } catch (e) {
            console.error(e);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const deleteCot = async (id: string) => {
        const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
        if (!error) { setDeleteConfirmId(null); fetchData(); }
    };

    const duplicate = async (c: Cotizacion) => {
        const { codigo: _c, id: _i, created_at: _d, ...rest } = c;
        await supabase.from('cotizaciones').insert({ ...rest, estado: 'BORRADOR' });
        fetchData();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // LIST VIEW (always rendered)
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <>
            {/* Editor as transparent glassmorphism modal */}
            <EditorModal
                isOpen={editorOpen}
                editingCode={editingCode}
                form={form}
                businessInfo={businessInfo}
                saveStatus={saveStatus}
                onClose={closeEditor}
                onSaveBorrador={() => save('BORRADOR')}
                onSaveListo={() => save('LISTO')}
                onFormChange={setForm}
                onUpdateItem={updateItem}
                onAddRow={addRow}
                onRemoveRow={removeRow}
                onDescuentoChange={setDescuento}
                onAdelantoChange={setAdelanto}
                onTipoDocumento={setTipoDocumento}
                onExportPDF={handleExportPDF}
                onExportExcel={handleExportExcel}
                isReadOnly={form.estado === 'LISTO'}
            />

            <div className="min-h-screen flex flex-col animate-premium-fade">
                {/* Header */}
                <div className="p-8 pb-0 flex items-center justify-between flex-wrap gap-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[#366480]/10 flex items-center justify-center">
                            <Receipt className="w-5 h-5 text-[#366480]" />
                        </div>
                        <div>
                            <h1 className="text-[18px] font-black text-[#2c3434] tracking-tight">Cotizaciones</h1>
                            <p className="text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest">
                                {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={openNew}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#366480] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#2c5268] transition-all shadow-md"
                    >
                        <Plus className="w-4 h-4" /> Nueva Cotización
                    </button>
                </div>

                {/* Filter bar */}
                <div className="px-8 py-5 flex flex-wrap items-center gap-3 shrink-0 border-b border-[#f0f5f4]">
                    <div className="relative flex-1 min-w-[260px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b9ba5]" />
                        <SearchInput
                            value={searchTerm}
                            onSearch={setSearchTerm}
                            placeholder="Buscar por código, cliente, DOI..."
                            className="w-full pl-11 pr-5 py-3 bg-[#f8faf9] border-none rounded-full text-[12px] font-bold text-[#2c3434] outline-none placeholder:text-[#8b9ba5] placeholder:font-normal"
                        />
                    </div>

                    <div className="relative">
                        <select
                            value={filterEstado}
                            onChange={e => setFilterEstado(e.target.value as any)}
                            className="bg-[#f8faf9] border-none px-5 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-9"
                        >
                            <option value="TODOS">Todos los estados</option>
                            <option value="BORRADOR">Borrador</option>
                            <option value="LISTO">Listo</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                    </div>

                    <div className="relative">
                        <select
                            value={quickFilter}
                            onChange={e => {
                                const v = e.target.value as typeof quickFilter;
                                if (v === 'PERSONALIZADO') { setQuickFilter('PERSONALIZADO'); setShowDatePicker(true); }
                                else applyQuickFilter(v);
                            }}
                            className="bg-[#f8faf9] border-none px-5 py-3 rounded-full text-[12px] font-bold text-[#366480] outline-none appearance-none cursor-pointer pr-9"
                        >
                            <option value="HOY">Hoy</option>
                            <option value="ULTIMOS_7">Últimos 7 días</option>
                            <option value="MES_ACTUAL">Este mes</option>
                            <option value="PERSONALIZADO">Personalizado</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#366480] pointer-events-none" />
                    </div>

                    {quickFilter === 'PERSONALIZADO' && (
                        <div className="relative" ref={datePickerRef}>
                            <button
                                onClick={() => setShowDatePicker(v => !v)}
                                className="flex items-center gap-3 px-6 py-3 bg-[#f8faf9] text-[#366480] rounded-full text-[12px] font-bold hover:bg-[#eef4f7] transition-all"
                            >
                                <Calendar className="w-4 h-4 text-[#4A90E2]" />
                                {startDate
                                    ? `${format(new Date(startDate + 'T12:00:00'), 'dd MMM', { locale: es })} - ${format(new Date(endDate + 'T12:00:00'), 'dd MMM', { locale: es })}`
                                    : 'Seleccionar Rango'}
                                <ChevronDown className={`w-3 h-3 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
                            </button>
                            <RangeDatePicker
                                isOpen={showDatePicker}
                                startDate={startDate}
                                endDate={endDate}
                                onApply={(start, end) => {
                                    setStartDate(start);
                                    setEndDate(end);
                                    setShowDatePicker(false);
                                }}
                                onCancel={() => setShowDatePicker(false)}
                            />
                        </div>
                    )}

                    <button
                        onClick={() => { setSearchTerm(''); fetchData(); }}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-[#f8faf9] text-[#8b9ba5] hover:bg-[#eef4f7] hover:text-[#366480] transition-all"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {/* Cards grid */}
                <div className="flex-1 overflow-y-auto p-8">
                    {fetchError && (
                        <div className="mb-6 flex items-start gap-3 px-5 py-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700">
                            <span className="material-icons-round text-sm mt-0.5">error_outline</span>
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest mb-0.5">Error al cargar cotizaciones</p>
                                <p className="text-xs font-medium">{fetchError}</p>
                                <button onClick={fetchData} className="mt-2 text-xs font-black text-rose-600 underline underline-offset-2">
                                    Reintentar
                                </button>
                            </div>
                        </div>
                    )}
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <div className="w-8 h-8 border-2 border-[#366480] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : !fetchError && filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-60 gap-4 text-[#8b9ba5]">
                            <Receipt className="w-12 h-12 opacity-30" />
                            <p className="text-[12px] font-bold uppercase tracking-widest">Sin cotizaciones</p>
                            <button onClick={openNew} className="text-[11px] font-black text-[#366480] underline underline-offset-2">
                                Crear la primera
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filtered.map(c => (
                                <div
                                    key={c.id}
                                    onClick={() => openEdit(c)}
                                    className="bg-white/40 backdrop-blur-[16px] rounded-[28px] p-5 border border-white/50 shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 cursor-pointer transition-all group"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <p className="text-[10px] font-black text-[#366480] uppercase tracking-widest">{c.codigo}</p>
                                            <p className="text-[13px] font-black text-[#2c3434] mt-0.5 line-clamp-1">
                                                {c.cliente_nombre || '—'}
                                            </p>
                                        </div>
                                        <StatusBadge estado={c.estado} />
                                    </div>
                                    <p className="text-[10px] font-bold text-[#8b9ba5] mb-4">
                                        {c.fecha_emision ? format(new Date(c.fecha_emision + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                                    </p>
                                    <div className="bg-[#f0f7fb] rounded-2xl px-4 py-2.5 mb-4">
                                        <p className="text-[9px] font-black text-[#8b9ba5] uppercase tracking-widest">Total</p>
                                        <p className="text-[16px] font-black text-[#366480] tabular-nums">{fmtSol(c.total)}</p>
                                    </div>
                                    <div
                                        className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <button
                                            onClick={() => duplicate(c)}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-[#f8faf9] text-[10px] font-black text-[#8b9ba5] hover:text-[#366480] hover:bg-[#eef4f7] transition-all uppercase tracking-wider"
                                        >
                                            <Copy className="w-3 h-3" /> Duplicar
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirmId(c.id)}
                                            className="w-7 h-7 flex items-center justify-center rounded-xl bg-[#f8faf9] text-[#c5d0d4] hover:text-red-400 hover:bg-red-50 transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Delete confirmation modal */}
                {deleteConfirmId && createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                        <div className="bg-white/80 backdrop-blur-[24px] rounded-[32px] p-8 border border-white/50 shadow-2xl max-w-sm w-full mx-4">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center">
                                    <Trash2 className="w-5 h-5 text-red-500" />
                                </div>
                                <div>
                                    <p className="text-[14px] font-black text-[#2c3434]">Eliminar cotización</p>
                                    <p className="text-[11px] font-bold text-[#8b9ba5]">Esta acción no se puede deshacer</p>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="flex-1 py-2.5 rounded-full bg-[#f8faf9] text-[11px] font-black text-[#8b9ba5] uppercase tracking-widest hover:bg-[#eef4f7] transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => deleteCot(deleteConfirmId)}
                                    className="flex-1 py-2.5 rounded-full bg-red-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-red-600 transition-all"
                                >
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </>
    );
}
