import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { RangeDatePicker } from '../components/RangeDatePicker';
import type { BusinessInfo, Contact } from '../services/types';
import {
    Search, Plus, Trash2, ChevronDown,
    RefreshCw, FileText, CheckCircle2, Calendar, Receipt,
    Copy, X, Hash,
} from 'lucide-react';
import { generateQuotePDF, printQuotePDF } from '../services/pdfExport';

import { appSettingsService, SETTING_KEYS } from '../services/appSettingsService';
import { useAuth } from '../context/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
    id: string;
    cantidad: number;
    unidad: string;
    descripcion: string;
    precio_unitario: number;
    total: number;
    sku_corto?: string;
}

interface TablerosProduct {
    id: string;
    sku: string;
    sku_corto?: string;
    base_name: string;
    presentation: string | null;
    min_price: number;
}

interface BoundProduct {
    catalog_product_id: string;
    sku: string;
    sku_corto?: string;
    base_name: string;
    presentation: string | null;
    min_price: number;
}

interface Cotizacion {
    id: string;
    codigo: string;
    estado: 'BORRADOR' | 'LISTO' | 'ELIMINADO';
    tipo_documento: 'COTIZACION' | 'BOLETA' | 'FACTURA' | 'TICKET';
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
    descripcion: string;
    numero_comprobante?: string;
    comprobante_locked?: boolean;
    sustento_comprobante_url?: string;
    created_at: string;
    user_id?: string;
    descuento_sugerido?: number;
    descuento_sugerido_porcentaje?: number;
    descuento_solicitado?: boolean;
    descuento_estado_aprobacion?: string;
    descuento_motivo_solicitud?: string;
    descuento_comentarios_admin?: string;
    prioridad?: 'NORMAL' | 'ALTO' | 'MUY ALTO';
}

type TipoDoc = 'BOLETA' | 'FACTURA' | 'TICKET';

interface FormState {
    estado: 'BORRADOR' | 'LISTO' | 'ELIMINADO';
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
    descripcion: string;
    numero_comprobante: string;
    comprobante_locked: boolean;
    descuento_sugerido?: number;
    descuento_sugerido_porcentaje?: number;
    descuento_solicitado?: boolean;
    descuento_estado_aprobacion?: 'NINGUNO' | 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
    descuento_motivo_solicitud?: string;
    descuento_comentarios_admin?: string;
    prioridad?: 'NORMAL' | 'ALTO' | 'MUY ALTO';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIDADES = ['PLS', 'MTS', 'SERV', 'UND', 'PLN', 'JGO', 'SET', 'PZA', 'M2', 'ML', 'KG', 'GLN', 'HRS'];

const mapCatalogUnitToQuoteUnit = (unit: string | null | undefined): string => {
    if (!unit) return 'PLS';
    const u = unit.trim().toUpperCase();
    if (u === 'PLANCHA' || u === 'PLS' || u === 'PLANCHAS') return 'PLS';
    if (u === 'METRO' || u === 'MTS' || u === 'METROS' || u === 'ML') return 'MTS';
    if (u === 'SERVICIO' || u === 'SERV' || u === 'SERVICIOS') return 'SERV';
    if (u === 'UNIDAD' || u === 'UND' || u === 'UNIDADES' || u === 'PZA' || u === 'PIEZA') return 'UND';
    if (u === 'JUEGO' || u === 'JGO' || u === 'JUEGOS') return 'JGO';
    if (u === 'SET' || u === 'SETS') return 'SET';
    if (u === 'PIEZA' || u === 'PZA') return 'PZA';
    if (u === 'M2' || u === 'METRO CUADRADO') return 'M2';
    if (u === 'ML' || u === 'METRO LINEAL') return 'ML';
    if (u === 'KG' || u === 'KILOGRAMO' || u === 'KILOGRAMOS') return 'KG';
    if (u === 'GLN' || u === 'GALON' || u === 'GALONES') return 'GLN';
    if (u === 'HRS' || u === 'HORA' || u === 'HORAS') return 'HRS';

    const found = UNIDADES.find(x => u.includes(x));
    if (found) return found;

    return 'PLS';
};

const IGV_RATE = 0.18;

const fmtLimaTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });

const emptyForm = (): FormState => ({
    estado: 'BORRADOR',
    tipo_documento: 'TICKET',
    cliente_nombre: '',
    cliente_doi: '',
    cliente_direccion: '',
    cliente_telefono: '',
    cliente_email: '',
    fecha_emision: format(new Date(), 'yyyy-MM-dd'),
    fecha_entrega: null,
    items: [{ id: crypto.randomUUID(), cantidad: 1, unidad: 'PLS', descripcion: '', precio_unitario: 0, total: 0 }],
    subtotal: 0,
    descuento: 0,
    igv: 0,
    total: 0,
    adelanto: 0,
    saldo_pendiente: 0,
    notas: '',
    condiciones_pago: '',
    descripcion: '',
    numero_comprobante: '',
    comprobante_locked: false,
    descuento_sugerido: 0,
    descuento_sugerido_porcentaje: 0,
    descuento_solicitado: false,
    descuento_estado_aprobacion: 'NINGUNO',
    descuento_motivo_solicitud: '',
    descuento_comentarios_admin: '',
    prioridad: 'NORMAL',
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

// Unit selector using native <select> for reliable cross-browser option picking
const UnitSelect = React.memo(({ value, onChange, className }: {
    value: string; onChange: (v: string) => void; className: string;
}) => (
    <select
        value={UNIDADES.includes(value) ? value : UNIDADES[0]}
        onChange={e => onChange(e.target.value)}
        className={`${className} appearance-none`}
    >
        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
    </select>
));

// Debounced input: local state for instant display, syncs to parent after 80 ms
// (or immediately on blur). Prevents parent re-renders from blocking the cursor.
const CellInput = React.memo(({ value, onChange, type = 'text', className, placeholder, readOnly, onKeyDown, title, inputRef }: {
    value: string | number;
    onChange: (v: string) => void;
    type?: string;
    className?: string;
    placeholder?: string;
    readOnly?: boolean;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    title?: string;
    inputRef?: React.Ref<HTMLInputElement>;
}) => {
    const [local, setLocal] = React.useState(String(value || ''));
    const debounceRef = React.useRef<any>(null);
    const focusedRef = React.useRef(false);

    React.useEffect(() => {
        if (!focusedRef.current) setLocal(String(value || ''));
    }, [value]);

    return (
        <input
            ref={inputRef}
            type={type}
            value={local}
            onFocus={() => { focusedRef.current = true; }}
            onChange={e => {
                const v = e.target.value;
                setLocal(v);
                clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => onChange(v), 80);
            }}
            onBlur={() => {
                focusedRef.current = false;
                clearTimeout(debounceRef.current);
                onChange(local);
            }}
            readOnly={readOnly}
            className={className}
            placeholder={placeholder}
            onKeyDown={onKeyDown}
            title={title}
        />
    );
});

// Blocks non-numeric keys on price/amount inputs (scientific notation, sign, enter)
const blockNumericKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['-', '+', 'e', 'E', 'Enter'].includes(e.key)) e.preventDefault();
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const stripPublicoGeneral = (name: string): string => {
    const m = name?.match(/^PÚBLICO GENERAL \((.+)\)$/);
    return m ? m[1] : (name || '');
};

const fmtSol = (n: number) =>
    `S/ ${(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function recalc(items: LineItem[], descuento: number, tipo: TipoDoc, adelanto: number) {
    const subtotal = items.reduce((s, it) => s + it.total, 0);
    const base = Math.max(0, subtotal - descuento);
    const igv = (tipo === 'FACTURA' || tipo === 'BOLETA' || tipo === 'TICKET') ? parseFloat((base * IGV_RATE).toFixed(2)) : 0;
    const total = parseFloat((base + igv).toFixed(2));
    const saldo_pendiente = parseFloat((total - adelanto).toFixed(2));
    return { subtotal, igv, total, saldo_pendiente };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ estado }: { estado: 'BORRADOR' | 'LISTO' | 'ELIMINADO' }) =>
    estado === 'LISTO' ? (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-black uppercase tracking-widest">
            <CheckCircle2 className="w-3 h-3" /> Listo
        </span>
    ) : estado === 'ELIMINADO' ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-100 text-rose-600 text-[11px] font-black uppercase tracking-widest">
            <Trash2 className="w-3 h-3" /> Anulado
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-black uppercase tracking-widest">
            <FileText className="w-3 h-3" /> Borrador
        </span>
    );

// ─── Voucher Edit Modal (inline comprobante from table) ───────────────────────

interface VoucherEditModalProps {
    isOpen: boolean;
    cotizacion: Cotizacion | null;
    onClose: () => void;
    onSave: (value: string) => Promise<void>;
}

const VoucherEditModal: React.FC<VoucherEditModalProps> = ({ isOpen, cotizacion, onClose, onSave }) => {
    const [value, setValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setValue(cotizacion?.numero_comprobante || '');
            setMounted(true);
            setIsClosing(false);
        }
    }, [isOpen, cotizacion]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => { setMounted(false); setIsClosing(false); onClose(); }, 220);
    };

    const handleSave = async () => {
        setSaving(true);
        try { await onSave(value); handleClose(); }
        finally { setSaving(false); }
    };

    if (!mounted) return null;

    return createPortal(
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${isClosing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
            style={{ backdropFilter: 'blur(8px)', background: 'rgba(15, 23, 30, 0.22)' }}
        >
            <div
                className={`${isClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'} bg-white/90 backdrop-blur-[20px] rounded-[20px] shadow-[0_24px_60px_rgba(0,0,0,0.15),0_0_0_1px_rgba(255,255,255,0.5)_inset] border border-white/50 w-full max-w-sm p-6`}
            >
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#366480]/10 flex items-center justify-center">
                            <Hash className="w-4 h-4 text-[#366480]" />
                        </div>
                        <div>
                            <p className="text-[13px] font-black text-[#2c3434] uppercase tracking-tight">N° Comprobante</p>
                            <p className="text-[10px] font-bold text-[#8b9ba5] mt-0.5 truncate max-w-[200px]">
                                {cotizacion?.codigo} · {stripPublicoGeneral(cotizacion?.cliente_nombre || '')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {cotizacion?.comprobante_locked && (
                    <div className="mb-3 px-3 py-2 bg-[#fef3c7] border border-[#f59e0b]/20 rounded-xl flex items-center gap-2 text-[10px] text-[#b45309] font-black uppercase tracking-tight">
                        <span>VERIFICADO Y BLOQUEADO</span>
                    </div>
                )}

                <input
                    type="text"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !saving && !cotizacion?.comprobante_locked) handleSave(); }}
                    disabled={cotizacion?.comprobante_locked}
                    className="w-full border border-[#c8d8de] rounded-xl px-4 py-3 text-sm font-bold text-[#2c3434] outline-none focus:border-[#366480] focus:ring-2 focus:ring-[#366480]/10 transition-all bg-white/80 placeholder:text-slate-300 placeholder:font-normal disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Ej: F001-0000123 / B001-0000001"
                    autoFocus={!cotizacion?.comprobante_locked}
                />

                <div className="flex gap-2.5 mt-4">
                    <button
                        onClick={handleClose}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[11px] font-black text-slate-500 hover:bg-slate-50 transition-all uppercase tracking-widest"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || cotizacion?.comprobante_locked}
                        className="flex-1 py-2.5 rounded-xl bg-[#366480] text-white text-[11px] font-black hover:bg-[#2c5268] transition-all uppercase tracking-widest disabled:opacity-50"
                    >
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── Editor Modal ─────────────────────────────────────────────────────────────

interface EditorModalProps {
    isOpen: boolean;
    editingCode: string;
    form: FormState;
    businessInfo: BusinessInfo | null;
    saveStatus: 'idle' | 'saving' | 'success' | 'error';
    isDirty: boolean;
    contacts: Contact[];
    onClose: () => void;
    onSaveBorrador: (isDiscount?: boolean) => void;
    onSaveListo: () => void;
    onFormChange: (f: FormState) => void;
    onClientSelect: (fromList: boolean) => void;
    onUpdateItem: (id: string, field: keyof LineItem, raw: string) => void;
    onAddRow: () => void;
    onRemoveRow: (id: string) => void;
    onDescuentoChange: (val: string) => void;
    onAdelantoChange: (val: string) => void;
    onTipoDocumento: (tipo: TipoDoc) => void;
    onExportPDF: () => void;
    onPrint: () => void;
    onDuplicate?: () => void;
    isReadOnly: boolean;
    pendingFocusRowId?: string | null;
    doiLocked: boolean;
    nameLocked: boolean;
    onDoiLocked: (v: boolean) => void;
    onNameLocked: (v: boolean) => void;
    cotizacionId: string | null;
    onSaveComprobante: (val: string) => Promise<void>;
    tablerosCatalog: TablerosProduct[];
    similarityThreshold: number;
    boundProducts: Map<string, BoundProduct>;
    lineErrors: Map<string, string>;
    saveErrorKind: 'material' | 'price' | 'client' | 'other';
    touchedDescriptionsRef: React.RefObject<Set<string>>;
    onBindProduct: (lineId: string, product: TablerosProduct) => void;
    onUnbindProduct: (lineId: string) => void;
    clientError: boolean;
    allCatalogProducts: any[];
    isVentas: boolean;
    handleCodeSubmit: (lineId: string, code: string) => boolean;
    getBrandWarning: (itemId: string) => string | null;
    isSavingDiscount?: boolean;
    isSavingDraft?: boolean;
}

const EditorModal: React.FC<EditorModalProps> = ({
    isOpen, editingCode, form, businessInfo, saveStatus, isDirty,
    contacts, onClose, onSaveBorrador, onSaveListo, onFormChange, onClientSelect,
    onUpdateItem, onAddRow, onRemoveRow, onDescuentoChange,
    onAdelantoChange, onTipoDocumento,
    onExportPDF, onPrint, onDuplicate, isReadOnly, pendingFocusRowId,
    doiLocked, nameLocked, onDoiLocked, onNameLocked,
    cotizacionId: _cotizacionId, onSaveComprobante,
    tablerosCatalog, similarityThreshold, boundProducts, lineErrors,
    saveErrorKind, touchedDescriptionsRef, onBindProduct, onUnbindProduct,
    clientError,
    allCatalogProducts,
    isVentas,
    handleCodeSubmit,
    getBrandWarning,
    isSavingDiscount = false,
    isSavingDraft = false,
}) => {
    const [showClientDrop, setShowClientDrop] = useState(false);
    const clientDropRef = useRef<HTMLDivElement>(null);
    const [showLegend, setShowLegend] = useState(false);

    const isDependentService = (itemId: string) => {
        const bound = boundProducts.get(itemId);
        if (!bound) return false;
        const catalogProd = allCatalogProducts.find(p => p.id === bound.catalog_product_id);
        if (!catalogProd || !catalogProd.is_service) return false;

        return form.items.some(it => {
            if (it.id === itemId) return false;
            const itBound = boundProducts.get(it.id);
            if (!itBound) return false;
            const parentProd = allCatalogProducts.find(p => p.id === itBound.catalog_product_id);
            return parentProd?.has_associated_service && parentProd?.associated_service_id === catalogProd.id;
        });
    };


    // States for discount requests
    const [showRequestDiscountModal, setShowRequestDiscountModal] = useState(false);
    const [reqDiscountType, setReqDiscountType] = useState<'MONEDA' | 'PORCENTAJE'>('MONEDA');
    const [reqDiscountVal, setReqDiscountVal] = useState<string>('');
    const [reqDiscountReason, setReqDiscountReason] = useState<string>('');
    const [reqDiscountError, setReqDiscountError] = useState<string | null>(null);

    const handleSendDiscountRequest = () => {
        if (!reqDiscountVal || Number(reqDiscountVal) <= 0) {
            setReqDiscountError('Ingresa un valor válido de descuento');
            return;
        }
        if (!reqDiscountReason.trim()) {
            setReqDiscountError('Ingresa el motivo o justificación');
            return;
        }

        const val = Number(reqDiscountVal);
        let amount = 0;
        let pct = 0;

        if (reqDiscountType === 'MONEDA') {
            amount = val;
            pct = form.subtotal > 0 ? parseFloat(((val / form.subtotal) * 100).toFixed(2)) : 0;
        } else {
            pct = val;
            amount = parseFloat(((val * form.subtotal) / 100).toFixed(2));
        }

        onFormChange({
            ...form,
            descuento_solicitado: true,
            descuento_estado_aprobacion: 'PENDIENTE',
            descuento_sugerido: amount,
            descuento_sugerido_porcentaje: pct,
            descuento_motivo_solicitud: reqDiscountReason.trim(),
        });

        setShowRequestDiscountModal(false);
        setReqDiscountVal('');
        setReqDiscountReason('');
        setReqDiscountError(null);

        // Auto-save the Borrador to notify the admin
        setTimeout(() => {
            onSaveBorrador(true);
        }, 100);
    };

    useEffect(() => {
        const fn = (e: MouseEvent) => {
            if (clientDropRef.current && !clientDropRef.current.contains(e.target as Node))
                setShowClientDrop(false);
        };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, []);

    const filteredContacts = useMemo(() =>
        contacts.filter(c =>
            !form.cliente_nombre || c.name.toLowerCase().includes(form.cliente_nombre.toLowerCase())
        ),
        [contacts, form.cliente_nombre]
    );

    const highlightText = (text: string, query: string) => {
        if (!query.trim()) return <>{text}</>;
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return <>{text}</>;
        return (
            <>
                {text.slice(0, idx)}
                <mark className="bg-amber-100 text-amber-900 not-italic rounded-[2px] px-0">
                    {text.slice(idx, idx + query.length)}
                </mark>
                {text.slice(idx + query.length)}
            </>
        );
    };
    const [showProcesarConfirm, setShowProcesarConfirm] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [openCatalogRowId, setOpenCatalogRowId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const wasOpenRef = useRef(false);
    const quantityRefs = useRef<Map<string, HTMLInputElement>>(new Map());

    // Comprobante — own state so it's always editable, even in LISTO mode
    const [localComprobante, setLocalComprobante] = useState(form.numero_comprobante || '');
    const [comprobanteChanged, setComprobanteChanged] = useState(false);
    const [savingComprobante, setSavingComprobante] = useState(false);

    useEffect(() => {
        setLocalComprobante(form.numero_comprobante || '');
        setComprobanteChanged(false);
    }, [isOpen]);

    const handleComprobanteChange = (val: string) => {
        if (isReadOnly) {
            setLocalComprobante(val);
            setComprobanteChanged(val !== (form.numero_comprobante || ''));
        } else {
            onFormChange({ ...form, numero_comprobante: val });
        }
    };

    const handleSaveComprobante = async () => {
        setSavingComprobante(true);
        try {
            await onSaveComprobante(isReadOnly ? localComprobante : (form.numero_comprobante || ''));
            setComprobanteChanged(false);
        } finally {
            setSavingComprobante(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setMounted(true);
            setIsClosing(false);
            setIsAnimating(true);
            wasOpenRef.current = true;
        } else if (wasOpenRef.current) {
            wasOpenRef.current = false;
            setIsClosing(true);
        }
    }, [isOpen]);

    useEffect(() => () => { document.body.style.overflow = ''; }, []);

    useEffect(() => {
        if (!pendingFocusRowId) return;
        const input = quantityRefs.current.get(pendingFocusRowId);
        if (input) { input.focus(); input.select(); }
    }, [pendingFocusRowId]);

    const handleClose = () => {
        if (isClosing) return;
        if (isDirty && !isReadOnly) {
            setShowCloseConfirm(true);
            return;
        }
        setIsClosing(true);
    };

    const handlePanelAnimEnd = (e: React.AnimationEvent) => {
        if (e.target !== e.currentTarget) return;
        if (isClosing) {
            document.body.style.overflow = '';
            setMounted(false);
            setIsClosing(false);
            onClose();
        } else {
            setIsAnimating(false);
        }
    };


    if (!mounted) return null;

    return createPortal(
        <>
            <div
                className={`${isClosing ? 'animate-backdrop-out' : 'animate-backdrop'} fixed inset-0 z-[2000] flex items-center justify-center p-4 overflow-hidden`}
                style={{ backdropFilter: 'blur(6px)', background: 'rgba(15, 23, 30, 0.35)' }}
            >
                <div className="flex gap-4 max-w-7xl w-full max-h-[92vh] items-stretch justify-center">
                    <div
                        className={`${isClosing ? 'animate-modal-panel-out' : 'animate-modal-panel'} bg-white rounded-[32px] shadow-[0_32px_80px_rgba(0,0,0,0.18),0_0_0_1px_rgba(255,255,255,0.6)_inset] flex-1 flex flex-col max-h-[92vh] relative overflow-hidden border border-slate-100${(isAnimating || isClosing) ? ' pointer-events-none' : ''}`}
                        onAnimationEnd={handlePanelAnimEnd}
                    >

                    {/* Top highlight edge */}
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent z-10 pointer-events-none" />

                    {/* Save status overlay */}
                    {saveStatus !== 'idle' && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-[32px]">
                            <div className="text-center p-8 bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col items-center gap-4">
                                {saveStatus === 'saving' && (
                                    <>
                                        <div className="w-12 h-12 border-4 border-[#d1dfe3] border-t-[#366480] rounded-full animate-spin" />
                                        <p className="text-sm font-bold text-slate-600">
                                            {isSavingDiscount ? 'Enviando solicitud de descuento...' :
                                             isSavingDraft ? 'Guardando borrador...' :
                                             'Procesando cotización...'}
                                        </p>
                                    </>
                                )}
                                {saveStatus === 'success' && (
                                    <>
                                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                            <span className="material-icons-round text-4xl">check</span>
                                        </div>
                                        <h3 className="text-xl font-black tracking-tight text-slate-800">
                                            {isSavingDiscount ? '¡Solicitud Enviada!' :
                                             isSavingDraft ? '¡Borrador Guardado!' :
                                             '¡Cotización Procesada!'}
                                        </h3>
                                        <p className="text-sm text-slate-500 font-medium">
                                            {isSavingDiscount
                                                ? 'La solicitud de descuento fue enviada al administrador para su aprobación.'
                                                : isSavingDraft
                                                ? 'La cotización se guardó como borrador correctamente.'
                                                : 'La venta se registró en Gestión de Ventas y Tesorería.'}
                                        </p>
                                    </>
                                )}
                                {saveStatus === 'error' && (
                                    <>
                                        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
                                            <span className="material-icons-round text-4xl">error_outline</span>
                                        </div>
                                        <h3 className="text-xl font-black tracking-tight text-slate-800">
                                            {saveErrorKind === 'material' ? 'Material Controlado Detectado' :
                                             saveErrorKind === 'price'    ? 'Precio por Debajo del Mínimo' :
                                             saveErrorKind === 'client'   ? 'Cliente / Razón Social Obligatorio' :
                                                                            'Error al Guardar'}
                                        </h3>
                                        <p className="text-sm text-slate-500 font-medium">
                                            {saveErrorKind === 'material'
                                                ? 'Hay líneas con materiales controlados (TABLEROS). Selecciona el producto del catálogo en las filas marcadas en rojo.'
                                                : saveErrorKind === 'price'
                                                ? 'Una o más líneas tienen un precio menor al mínimo de catálogo. Ajusta el precio en las filas marcadas en rojo.'
                                                : saveErrorKind === 'client'
                                                ? 'El campo "Cliente / Razón Social" es obligatorio para poder guardar o procesar la cotización.'
                                                : 'Ocurrió un problema. Inténtalo de nuevo.'}
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Header */}
                    <div className="px-8 py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-4">
                            <span className="material-icons-round text-[36px] text-slate-700 drop-shadow-sm">request_quote</span>
                            <div>
                                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Cotización</h2>
                                <p className="text-[11px] font-bold text-slate-400 font-mono">{editingCode || '— Sin asignar —'}</p>
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
                                    onClick={onPrint}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-[#366480] hover:bg-[#eef4f7]/80 transition-all font-bold text-xs"
                                >
                                    <span className="material-icons-round text-sm">print</span>
                                    Imprimir
                                </button>
                                {onDuplicate && (
                                    <>
                                        <div className="w-px bg-slate-200 mx-1 self-stretch" />
                                        <button
                                            onClick={onDuplicate}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[#366480] hover:bg-[#eef4f7]/80 transition-all font-bold text-xs"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            Duplicar
                                        </button>
                                    </>
                                )}
                            </div>

                            <button
                                onClick={handleClose}
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
                                <p className="text-xs font-bold">
                                    {form.descuento_estado_aprobacion === 'PENDIENTE'
                                        ? 'Esta cotización se encuentra en espera de la respuesta del administrador y no puede editarse.'
                                        : 'Esta cotización está procesada y solo puede visualizarse.'}
                                </p>
                            </div>
                        )}



                        {/* 1. Business info + Client form */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-3xl border-2 border-slate-400 shadow-sm">
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
                                <div className="relative" ref={clientDropRef}>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Cliente / Razón Social <span className="text-rose-500 font-bold">*</span></label>
                                    <input
                                        type="text"
                                        value={form.cliente_nombre}
                                        onChange={e => {
                                            const val = e.target.value;
                                            const exact = contacts.find(c => c.name.toLowerCase() === val.toLowerCase());
                                            if (exact) {
                                                onFormChange({ ...form, cliente_nombre: val, cliente_doi: exact.tax_id || '' });
                                                onDoiLocked(!!exact.tax_id);
                                            } else {
                                                onFormChange({ ...form, cliente_nombre: val });
                                                onDoiLocked(false);
                                            }
                                            onClientSelect(!!exact);
                                            onNameLocked(false);
                                            setShowClientDrop(true);
                                        }}
                                        onFocus={() => !nameLocked && setShowClientDrop(true)}
                                        readOnly={isReadOnly || nameLocked}
                                        className={`w-full bg-white border-2 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 transition-all${clientError && !form.cliente_nombre.trim() ? ' border-rose-400 ring-rose-200 focus:ring-rose-200' : ' border-slate-400 focus:border-[#366480] focus:ring-[#366480]/15 focus:bg-white'}${nameLocked && !isReadOnly ? ' bg-slate-50/60 text-slate-500 cursor-not-allowed pr-9' : ''}`}
                                        placeholder="Nombre o Razón Social..."
                                    />
                                    {clientError && !form.cliente_nombre.trim() && (
                                        <p className="text-[10px] font-black text-rose-500 pl-1 mt-1">Campo obligatorio</p>
                                    )}
                                    {nameLocked && !isReadOnly && (
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 material-icons-round text-[14px] text-slate-300 pointer-events-none" title="Autorellenado por DOI — modifica el DOI para cambiar">lock</span>
                                    )}
                                    {showClientDrop && !isReadOnly && !nameLocked && filteredContacts.length > 0 && (
                                        <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-48 overflow-y-auto">
                                            {filteredContacts.map(c => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-[#2c3434] hover:bg-[#eef4f7] transition-colors"
                                                    onMouseDown={e => {
                                                        e.preventDefault();
                                                        onFormChange({ ...form, cliente_nombre: c.name, cliente_doi: c.tax_id || '' });
                                                        onClientSelect(true);
                                                        onDoiLocked(!!c.tax_id);
                                                        onNameLocked(false);
                                                        setShowClientDrop(false);
                                                    }}
                                                >
                                                    {highlightText(c.name, form.cliente_nombre)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Descripción / Observaciones</label>
                                    <CellInput
                                        type="text"
                                        value={form.descripcion}
                                        onChange={v => onFormChange({ ...form, descripcion: v })}
                                        readOnly={isReadOnly}
                                        className="w-full bg-white border-2 border-slate-400 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-[#366480] focus:ring-2 focus:ring-[#366480]/15 transition-all"
                                        placeholder="Ej: Fabricación de puerta metálica..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">DOI / RUC</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={form.cliente_doi}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const matched = contacts.find(c => c.tax_id && c.tax_id.trim() === val.trim());
                                                if (matched && val.trim().length > 0) {
                                                    onFormChange({ ...form, cliente_doi: val, cliente_nombre: matched.name });
                                                    onClientSelect(true);
                                                    onNameLocked(true);
                                                    onDoiLocked(false);
                                                } else {
                                                    onFormChange({ ...form, cliente_doi: val });
                                                    onNameLocked(false);
                                                    onClientSelect(false);
                                                }
                                            }}
                                            readOnly={isReadOnly || doiLocked}
                                            className={`w-full bg-white border-2 border-slate-400 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#366480]/15 focus:bg-white transition-all${doiLocked && !isReadOnly ? ' bg-slate-50/60 text-slate-500 cursor-not-allowed pr-9' : ''}`}
                                            placeholder="RUC / DNI..."
                                        />
                                        {doiLocked && !isReadOnly && (
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 material-icons-round text-[14px] text-slate-300 pointer-events-none" title="Bloqueado — la edición es en el módulo de Contactos">lock</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-center gap-4 bg-white border-2 border-slate-400 rounded-xl px-4 py-3 shadow-sm">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            checked={form.tipo_documento === 'BOLETA'}
                                            onChange={() => onTipoDocumento('BOLETA')}
                                            disabled={isReadOnly || form.comprobante_locked}
                                            className="accent-[#366480] disabled:cursor-not-allowed"
                                        />
                                        <span className={`text-xs font-bold ${isReadOnly || form.comprobante_locked ? 'text-slate-400' : 'text-slate-600'}`}>Boleta</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            checked={form.tipo_documento === 'FACTURA'}
                                            onChange={() => onTipoDocumento('FACTURA')}
                                            disabled={isReadOnly || form.comprobante_locked}
                                            className="accent-[#366480] disabled:cursor-not-allowed"
                                        />
                                        <span className={`text-xs font-bold ${isReadOnly || form.comprobante_locked ? 'text-slate-400' : 'text-slate-600'}`}>Factura</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            checked={form.tipo_documento === 'TICKET'}
                                            onChange={() => onTipoDocumento('TICKET')}
                                            disabled={isReadOnly || form.comprobante_locked}
                                            className="accent-[#366480] disabled:cursor-not-allowed"
                                        />
                                        <span className={`text-xs font-bold ${isReadOnly || form.comprobante_locked ? 'text-slate-400' : 'text-slate-600'}`}>Ticket</span>
                                    </label>
                                </div>
                                <div className="col-span-2 grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Emisión</label>
                                        <div className="w-full bg-slate-50/50 border-2 border-slate-400 rounded-xl px-4 py-3 text-xs font-bold text-slate-500 shadow-sm">
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
                                            className="w-full bg-white border-2 border-slate-400 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-[#366480] focus:ring-2 focus:ring-[#366480]/15 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Items table */}
                        <div className="border-2 border-slate-400 rounded-3xl overflow-auto shadow-sm bg-white">
                            <table className="w-full min-w-[640px] border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest border-b-2 border-slate-400">
                                        <th className="px-4 py-4 text-left border-r border-slate-300 w-20">Cant.</th>
                                        <th className="px-4 py-4 text-left border-r border-slate-300 w-24">Unidad</th>
                                        <th className="px-4 py-4 text-left border-r border-slate-300 w-28">Código</th>
                                        <th className="px-4 py-4 text-left border-r border-slate-300 min-w-[220px]">Descripción</th>
                                        <th className="px-4 py-4 text-center border-r border-slate-300 w-32">P. Unit</th>
                                        <th className="px-4 py-4 text-center w-32">Total</th>
                                        <th className="px-4 py-4 w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y-2 divide-slate-300">
                                    {form.items.map((item, idx) => {
                                        const bound = boundProducts.get(item.id);
                                        const showCatalog = openCatalogRowId === item.id && !bound && !isReadOnly;
                                        const error = lineErrors.get(item.id);
                                        const brandWarning = getBrandWarning(item.id);
                                        return (
                                        <tr key={item.id} className={`group transition-colors ${error ? 'bg-rose-50/40' : 'hover:bg-slate-50/50'}`}>
                                            <td className="px-4 py-3 border-r border-slate-300 align-top">
                                                <CellInput
                                                    type="number"
                                                    value={item.cantidad || ''}
                                                    onChange={v => onUpdateItem(item.id, 'cantidad', v)}
                                                    onKeyDown={blockNumericKeys}
                                                    readOnly={isReadOnly || isDependentService(item.id)}
                                                    inputRef={el => {
                                                        if (el) quantityRefs.current.set(item.id, el);
                                                        else quantityRefs.current.delete(item.id);
                                                    }}
                                                    className={`w-full bg-transparent border-none font-bold outline-none text-sm focus:bg-white/60 transition-colors rounded-lg px-1 ${(isReadOnly || isDependentService(item.id)) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700'}`}
                                                    placeholder="0"
                                                />
                                            </td>
                                            <td className="px-4 py-3 border-r border-slate-300 align-top">
                                                <span className="font-bold text-slate-400 text-[11px] uppercase tracking-widest">{item.unidad}</span>
                                            </td>
                                            <td className="px-4 py-3 border-r border-slate-300 align-top">
                                                {isReadOnly ? (
                                                     <span className="font-sans font-bold text-sm text-blue-700 px-1 py-0.5">
                                                         {bound?.sku_corto || '—'}
                                                     </span>
                                                                                                   ) : (
                                                      <input
                                                          type="text"
                                                          value={item.sku_corto || bound?.sku_corto || ''}
                                                          onChange={e => {
                                                              const val = e.target.value.toUpperCase();
                                                              onUpdateItem(item.id, 'sku_corto', val);
                                                          }}
                                                          onKeyDown={e => {
                                                              if (e.key === 'Enter') {
                                                                  e.preventDefault();
                                                                  const codeVal = e.currentTarget.value;
                                                                  if (codeVal.trim()) {
                                                                      const success = handleCodeSubmit(item.id, codeVal);
                                                                      if (success && idx === form.items.length - 1) {
                                                                          onAddRow();
                                                                      }
                                                                  }
                                                              } else if (e.key === 'Tab') {
                                                                  if (idx === form.items.length - 1) {
                                                                      const codeVal = e.currentTarget.value;
                                                                      if (codeVal.trim()) {
                                                                          const success = handleCodeSubmit(item.id, codeVal);
                                                                          if (success) {
                                                                              e.preventDefault();
                                                                              onAddRow();
                                                                          }
                                                                      }
                                                                  }
                                                              }
                                                          }}
                                                          onBlur={e => {
                                                              handleCodeSubmit(item.id, e.target.value);
                                                          }}
                                                          className="w-full bg-transparent border-none font-sans font-bold text-sm text-blue-700 outline-none uppercase placeholder:text-slate-300 focus:bg-white/60 transition-colors rounded-lg px-1.5 py-1"
                                                          placeholder="Código"
                                                      />
                                                  )}
                                            </td>
                                            <td className="px-4 py-3 border-r border-slate-300 min-w-[260px] align-top">
                                                 <div className="flex flex-col gap-1.5">
                                                     <div className="flex items-center gap-1">
                                                         <CellInput
                                                             type="text"
                                                             value={item.descripcion}
                                                             onChange={v => onUpdateItem(item.id, 'descripcion', v)}
                                                             readOnly={true}
                                                             className={`w-full bg-transparent border-none font-bold outline-none text-sm rounded-lg px-1 transition-colors cursor-default ${bound ? 'text-emerald-700' : 'text-slate-700'}`}
                                                             placeholder="Descripción del producto o servicio..."
                                                             title={item.descripcion}
                                                         />
                                                     </div>
                                                     {brandWarning && (
                                                         <p className="text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 flex items-center gap-1">
                                                             <span className="material-icons-round text-[11px]">warning</span>
                                                             {brandWarning}
                                                         </p>
                                                     )}
                                                     {error && (
                                                         <p className="text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-2 py-1 flex items-center gap-1">
                                                             <span className="material-icons-round text-[11px]">error</span>
                                                             {error}
                                                         </p>
                                                     )}
                                                 </div>
                                            </td>
                                            <td className="px-4 py-3 border-r border-slate-300 align-top">
                                                 <div className="flex flex-col items-end gap-1">
                                                     <div className="flex items-center justify-end gap-1">
                                                         <span className="text-slate-400 text-xs font-bold">S/</span>
                                                         <CellInput
                                                             type="number"
                                                             value={item.precio_unitario || ''}
                                                             onChange={v => onUpdateItem(item.id, 'precio_unitario', v)}
                                                             onKeyDown={blockNumericKeys}
                                                             readOnly={true}
                                                             className={`w-20 border-none font-black text-right outline-none text-base transition-colors rounded-lg cursor-default ${bound ? 'bg-emerald-50/40' : 'bg-transparent'} ${bound && item.precio_unitario > 0 && item.precio_unitario < bound.min_price ? 'text-rose-600' : 'text-[#366480]'} disabled:opacity-85`}
                                                             placeholder={bound ? `Mín: ${bound.min_price.toFixed(2)}` : '0.00'}
                                                         />
                                                     </div>
                                                 </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-base text-slate-800 align-top">
                                                 S/ {item.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-center align-top">
                                                 {!isReadOnly && !isDependentService(item.id) && (
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
                                        );
                                    })}
                                </tbody>
                            </table>
                            {!isReadOnly && (
                                <div className="p-3 border-t border-slate-300 flex justify-start">
                                    <button
                                        onClick={onAddRow}
                                        type="button"
                                        className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-500 hover:text-[#366480] hover:bg-slate-50 transition-all flex items-center gap-1 shadow-sm"
                                    >
                                        <span className="material-icons-round text-sm">add</span>
                                        AGREGAR FILA
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* 3. Totals */}
                        <div className="flex justify-end mt-4">
                            <div className="w-full md:w-80 bg-white p-6 rounded-3xl border-2 border-slate-400 shadow-sm">
                                {/* Two-column grid: label right-aligned | value right-aligned */}
                                <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 items-center">
                                    <span className="text-right text-xs text-slate-500 font-bold uppercase tracking-wider">Sub Total</span>
                                    <span className="text-right text-xs text-slate-700 font-bold tabular-nums">S/ {form.subtotal.toFixed(2)}</span>

                                    <span className="text-right text-xs text-rose-500 font-bold uppercase tracking-wider">Descuento</span>
                                    <div className="flex items-center justify-end gap-2">
                                        <div className="flex items-center justify-end gap-1 border-b border-rose-200">
                                            <span className="text-[10px] text-rose-500 font-bold">- S/</span>
                                            <span className="w-16 text-right font-black text-base text-rose-500 tabular-nums">
                                                {form.descuento ? form.descuento.toFixed(2) : '0.00'}
                                            </span>
                                        </div>
                                        {!isReadOnly && form.descuento_estado_aprobacion !== 'PENDIENTE' && (
                                            <button
                                                onClick={() => setShowRequestDiscountModal(true)}
                                                type="button"
                                                className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-100 rounded-lg hover:bg-rose-100 transition-colors"
                                            >
                                                Solicitar
                                            </button>
                                        )}
                                    </div>

                                    {form.descuento_solicitado && (
                                        <div className="col-span-2 mt-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-1.5 text-left text-xs font-semibold shadow-sm tracking-wide">
                                            {form.descuento_estado_aprobacion === 'PENDIENTE' && (
                                                <div className="text-amber-800 flex items-start gap-2">
                                                    <span className="material-icons-round text-sm mt-0.5 animate-pulse text-amber-500">pending</span>
                                                    <div>
                                                        <p className="font-black uppercase tracking-wider text-[9px]">Solicitud Pendiente de Aprobación</p>
                                                        <p className="text-[10px] font-bold text-slate-600 mt-0.5">Sugerido: S/ {form.descuento_sugerido?.toFixed(2)} ({form.descuento_sugerido_porcentaje}%)</p>
                                                        <p className="text-[10px] font-bold text-slate-400 italic mt-0.5">Motivo: "{form.descuento_motivo_solicitud}"</p>
                                                    </div>
                                                </div>
                                            )}
                                            {form.descuento_estado_aprobacion === 'APROBADO' && (
                                                <div className="text-emerald-800 flex items-start gap-2">
                                                    <span className="material-icons-round text-sm mt-0.5 text-emerald-600">check_circle</span>
                                                    <div>
                                                        <p className="font-black uppercase tracking-wider text-[9px] text-emerald-600">Descuento Aprobado por Admin</p>
                                                        {form.descuento_comentarios_admin && (
                                                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Comentario: "{form.descuento_comentarios_admin}"</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {form.descuento_estado_aprobacion === 'RECHAZADO' && (
                                                <div className="text-rose-800 flex items-start gap-2">
                                                    <span className="material-icons-round text-sm mt-0.5 text-rose-500">cancel</span>
                                                    <div>
                                                        <p className="font-black uppercase tracking-wider text-[9px] text-rose-600">Descuento Rechazado por Admin</p>
                                                        {form.descuento_comentarios_admin && (
                                                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Motivo: "{form.descuento_comentarios_admin}"</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {(form.tipo_documento === 'FACTURA' || form.tipo_documento === 'BOLETA' || form.tipo_documento === 'TICKET') && (
                                        <>
                                            <span className="text-right text-xs text-[#366480] font-bold uppercase tracking-wider">IGV (18%)</span>
                                            <span className="text-right text-xs text-[#366480] font-black tabular-nums">S/ {form.igv.toFixed(2)}</span>
                                        </>
                                    )}

                                    <div className="col-span-2 border-t-2 border-slate-300" />
                                    <span className="text-right text-xs font-black tracking-widest uppercase text-slate-400">Total</span>
                                    <span className="text-right text-2xl font-black text-[#366480] tabular-nums">
                                        S/ {form.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                    </span>

                                    <span className="text-right text-xs text-emerald-600 font-bold uppercase tracking-wider">Adelanto</span>
                                    <div className="flex items-center justify-end gap-1 bg-white border-2 border-emerald-500 rounded-lg px-2 py-1 shadow-sm">
                                        <span className="text-[10px] text-emerald-600">S/</span>
                                        <CellInput
                                            type="number"
                                            value={form.adelanto || ''}
                                            onChange={onAdelantoChange}
                                            onKeyDown={blockNumericKeys}
                                            readOnly={isReadOnly}
                                            className="w-16 bg-transparent border-none text-right font-black outline-none text-emerald-600"
                                            placeholder="0.00"
                                        />
                                    </div>

                                    <div className="col-span-2 border-t-2 border-dashed border-slate-300" />
                                    <span className="text-right text-[10px] font-black uppercase text-amber-600 tracking-widest">Saldo Pendiente</span>
                                    <span className="text-right text-lg font-black tracking-tighter text-amber-600 tabular-nums">
                                        S/ {(form.saldo_pendiente || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 4. Priority Block */}
                        <div className="mt-4">
                            <div className="bg-white p-6 rounded-3xl border-2 border-slate-400 shadow-sm flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Prioridad</span>
                                <div className="flex-1 flex justify-center gap-8">
                                    {(['NORMAL', 'ALTO', 'MUY ALTO'] as const).map((level) => (
                                        <label key={level} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={(form.prioridad || 'NORMAL') === level}
                                                onChange={() => onFormChange({ ...form, prioridad: level })}
                                                disabled={isReadOnly}
                                                className="accent-[#366480] disabled:cursor-not-allowed w-4 h-4"
                                            />
                                            <span className={`text-xs font-bold ${isReadOnly ? 'text-slate-400' : 'text-slate-600'} uppercase tracking-wide`}>
                                                {level === 'MUY ALTO' ? 'Muy Alto' : level === 'ALTO' ? 'Alto' : 'Normal'}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <div className="w-16 hidden md:block" />
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-5 border-t border-slate-200 flex justify-between items-center shrink-0">
                        <StatusBadge estado={form.estado} />
                        <div className="flex gap-3">
                            <button
                                onClick={handleClose}
                                className="px-6 py-3 rounded-2xl text-sm font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
                            >
                                {isReadOnly ? 'Cerrar' : 'Descartar'}
                            </button>
                            {!isReadOnly && (
                                <>
                                    <button
                                        onClick={() => onSaveBorrador()}
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

            {/* Solicitar Descuento Modal */}
            {showRequestDiscountModal && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[4px]">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 flex flex-col relative animate-premium-fade" style={{ fontFamily: "'Manrope', sans-serif" }}>
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <span className="material-icons-round text-rose-500 text-lg">loyalty</span>
                                Solicitar Descuento
                            </h3>
                            <button
                                onClick={() => { setShowRequestDiscountModal(false); setReqDiscountError(null); }}
                                className="text-slate-400 hover:text-slate-600 transition-colors font-bold text-xs p-1"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Descuento</label>
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    <button
                                        type="button"
                                        onClick={() => setReqDiscountType('MONEDA')}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${reqDiscountType === 'MONEDA' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Monto (S/)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setReqDiscountType('PORCENTAJE')}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${reqDiscountType === 'PORCENTAJE' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Porcentaje (%)
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                    Valor del Descuento ({reqDiscountType === 'MONEDA' ? 'S/' : '%'})
                                </label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="any"
                                    value={reqDiscountVal}
                                    onChange={e => setReqDiscountVal(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-rose-500 focus:bg-white transition-all text-slate-700"
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                    Motivo / Justificación *
                                </label>
                                <textarea
                                    value={reqDiscountReason}
                                    onChange={e => setReqDiscountReason(e.target.value)}
                                    rows={3}
                                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-rose-500 focus:bg-white transition-all text-slate-700 placeholder:font-normal"
                                    placeholder="Explica detalladamente por qué solicitas este descuento..."
                                />
                            </div>

                            {reqDiscountError && (
                                <p className="text-[10px] font-black text-rose-500 bg-rose-50 border border-rose-100 rounded-lg p-2 text-center">{reqDiscountError}</p>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowRequestDiscountModal(false); setReqDiscountError(null); }}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-all uppercase tracking-wider text-[11px]"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSendDiscountRequest}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 text-white font-black text-sm hover:bg-rose-600 transition-all uppercase tracking-wider text-[11px] shadow-lg shadow-rose-500/25"
                                >
                                    Enviar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
                    </div>
                </div>
            </div>

            {/* Close-without-saving confirm */}
            {showCloseConfirm && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[4px]">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center">
                        <span className="material-icons-round text-rose-500 text-4xl mb-4">warning</span>
                        <h3 className="text-lg font-black mb-2 text-slate-800">¿Cerrar sin guardar?</h3>
                        <p className="text-sm text-slate-500 mb-6">Se perderá todo el avance no guardado.</p>
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setShowCloseConfirm(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => { setShowCloseConfirm(false); setIsClosing(true); }}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 text-white font-black text-sm hover:bg-rose-600 transition-all"
                            >
                                Cerrar de todos modos
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Procesar confirmation modal */}
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
    const { user, profile } = useAuth();
    const isVentas = !profile || (profile.role !== 'admin' && profile.role !== 'administrador');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const prevEditingIdRef = useRef<string | null>(null);
    const [editingCode, setEditingCode] = useState('');

    // List state
    const [showDashboardLegend, setShowDashboardLegend] = useState(false);
    const [loading, setLoading] = useState(true);
    const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState<'TODOS' | 'BORRADOR' | 'LISTO' | 'ELIMINADO'>('TODOS');
    const now = new Date();
    const [startDate, setStartDate] = useState(format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(now, 'yyyy-MM-dd'));
    const [quickFilter, setQuickFilter] = useState<'HOY' | 'ULTIMOS_7' | 'MES_ACTUAL' | 'PERSONALIZADO'>('ULTIMOS_7');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const datePickerRef = useRef<HTMLDivElement>(null);

    // Editor state
    const [form, setForm] = useState<FormState>(emptyForm());
    const [isDirty, setIsDirty] = useState(false);
    const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [clientFromList, setClientFromList] = useState(false);
    const [doiLocked, setDoiLocked] = useState(false);
    const [nameLocked, setNameLocked] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [isSavingDiscount, setIsSavingDiscount] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [pendingInvalidationAction, setPendingInvalidationAction] = useState<(() => void) | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [voucherEditTarget, setVoucherEditTarget] = useState<Cotizacion | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 20;

    // ── Materiales Controlados (TABLEROS) ─────────────────────────────────────
    const [tablerosCatalog, setTablerosCatalog] = useState<TablerosProduct[]>([]);
    const [similarityThreshold, setSimilarityThreshold] = useState(0.75);
    const [boundProducts, setBoundProducts] = useState<Map<string, BoundProduct>>(new Map());
    const [saveErrors, setSaveErrors] = useState<Map<string, string>>(new Map());
    const [saveErrorKind, setSaveErrorKind] = useState<'material' | 'price' | 'client' | 'other'>('other');
    const [clientError, setClientError] = useState(false);

    // -- SKU Corto & Services State --
    const [allCatalogProducts, setAllCatalogProducts] = useState<any[]>([]);

    const fetchAllCatalogProducts = async (): Promise<any[]> => {
        const { data, error } = await supabase
            .from('catalog_products')
            .select('id, sku, sku_corto, base_name, presentation, brand, min_price, reference_cost, is_service, has_associated_service, associated_service_id, service_pricing_type, service_pricing_value, unit')
            .eq('status', 'Activo');
        if (!error && data) {
            setAllCatalogProducts(data);
            return data;
        }
        return [];
    };

    // Tracks which row IDs had their description edited in the current editor session.
    // Suggestions only show for touched rows — prevents auto-showing on reopen of borradores.
    const touchedDescriptionsRef = useRef<Set<string>>(new Set());
    // Always-current snapshot of form — used inside async callbacks to avoid stale closures.
    const formRef = useRef(form);
    useEffect(() => { formRef.current = form; }, [form]);
    // Stable refs for values used inside useCallback closures (avoids deps on frequently-changing state)
    const boundProductsRef = useRef(boundProducts);
    boundProductsRef.current = boundProducts;
    const allCatalogProductsRef = useRef(allCatalogProducts);
    allCatalogProductsRef.current = allCatalogProducts;
    const saveRef = useRef<((estadoOverride?: 'BORRADOR' | 'LISTO', isDiscount?: boolean) => Promise<void>) | null>(null);
    const editingIdRef = useRef(editingId);
    editingIdRef.current = editingId;
    const saveComprobanteRef = useRef<typeof saveComprobante | null>(null);
    const cotizacionesRef = useRef(cotizaciones);
    cotizacionesRef.current = cotizaciones;
        const fetchDataRef = useRef<(() => Promise<void>) | null>(null);

    const confirmDiscountInvalidation = useCallback((onConfirm: () => void) => {
        if (formRef.current.descuento_solicitado && formRef.current.descuento_estado_aprobacion === 'APROBADO') {
            setPendingInvalidationAction(() => () => {
                setForm(prev => {
                    const next: FormState = {
                        ...prev,
                        descuento_solicitado: false,
                        descuento_estado_aprobacion: 'NINGUNO',
                        descuento_sugerido: 0,
                        descuento_sugerido_porcentaje: 0,
                        descuento_motivo_solicitud: '',
                        descuento_comentarios_admin: '',
                        descuento: 0
                    };
                    return {
                        ...next,
                        ...recalc(next.items, 0, next.tipo_documento, next.adelanto)
                    };
                });
                onConfirm();
                setPendingInvalidationAction(null);
            });
            return true;
        }
        return false;
    }, []);

    const handleFormChange = useCallback((f: FormState) => {
        const proceed = () => {
            setForm(f);
            setIsDirty(true);
        };
        const isClientNameChanged = f.cliente_nombre !== formRef.current.cliente_nombre;
        if (isClientNameChanged) {
            const intercepted = confirmDiscountInvalidation(proceed);
            if (!intercepted) {
                proceed();
            }
        } else {
            proceed();
        }
    }, [confirmDiscountInvalidation]);

    const bindProduct = useCallback((lineId: string, product: TablerosProduct) => {
        setBoundProducts(prev => {
            const next = new Map(prev);
            next.set(lineId, {
                catalog_product_id: product.id,
                sku: product.sku,
                base_name: product.base_name,
                presentation: product.presentation,
                min_price: product.min_price,
            });
            return next;
        });
        setSaveErrors(prev => {
            if (!prev.has(lineId)) return prev;
            const next = new Map(prev);
            next.delete(lineId);
            return next;
        });
        // Fill description with canonical catalog name so what is saved matches the catalog
        setForm(prev => ({
            ...prev,
            items: prev.items.map(it => it.id !== lineId
                ? it
                : { ...it, descripcion: product.base_name }),
        }));
        setIsDirty(true);
    }, []);

    const unbindProduct = useCallback((lineId: string) => {
        setBoundProducts(prev => {
            if (!prev.has(lineId)) return prev;
            const next = new Map(prev);
            next.delete(lineId);
            return next;
        });
    }, []);

    const handleCodeSubmit = useCallback((lineId: string, code: string): boolean => {
        const proceed = () => {
            if (!code.trim()) {
                unbindProduct(lineId);
                return false;
            }

            const upperCode = code.trim().toUpperCase();
            const matchedProduct = allCatalogProducts.find(
                p => (p.sku_corto && p.sku_corto.toUpperCase() === upperCode) || p.sku.toUpperCase() === upperCode
            );

            if (matchedProduct) {
                // Check before binding — if same product already bound, skip service insertion
                const alreadyBound = boundProductsRef.current.get(lineId)?.catalog_product_id === matchedProduct.id;

                // Bind the product
                bindProduct(lineId, matchedProduct as any);

                // Clear any code-not-found error for this row
                setSaveErrors(prev => {
                    if (!prev.has(lineId)) return prev;
                    const next = new Map(prev);
                    next.delete(lineId);
                    return next;
                });

                // Set unit price automatically
                setForm(prev => {
                    const items = prev.items.map(it => {
                        if (it.id !== lineId) return it;

                        const unitPrice = matchedProduct.min_price || 0;
                        return {
                            ...it,
                            unidad: mapCatalogUnitToQuoteUnit(matchedProduct.unit),
                            precio_unitario: unitPrice,
                            total: parseFloat((it.cantidad * unitPrice).toFixed(2)),
                            sku_corto: matchedProduct.sku_corto || ''
                        };
                    });

                    let updatedForm = { ...prev, items, ...recalc(items, prev.descuento, prev.tipo_documento, prev.adelanto) };

                    // AUTOMATIC SERVICE ROW INSERTION:
                    // Only insert if not already bound to this product (prevents duplication on repeated Enter)
                    if (!alreadyBound && matchedProduct.has_associated_service && matchedProduct.associated_service_id) {
                        const serviceProd = allCatalogProducts.find(p => p.id === matchedProduct.associated_service_id);
                        if (serviceProd) {
                            const serviceRowId = crypto.randomUUID();

                            // Calculate service price
                            let servicePrice = serviceProd.min_price || 0;
                            if (matchedProduct.service_pricing_type === 'MONEDA') {
                                servicePrice = Number(matchedProduct.service_pricing_value) || 0;
                            } else if (matchedProduct.service_pricing_type === 'PORCENTAJE') {
                                const pct = Number(matchedProduct.service_pricing_value) || 0;
                                const parentItem = items.find(x => x.id === lineId);
                                const boardPrice = parentItem?.precio_unitario || Number(matchedProduct.min_price) || 0;
                                servicePrice = parseFloat(((pct * boardPrice) / 100).toFixed(2));
                            }

                            // Add service row
                            const parentItem = items.find(x => x.id === lineId);
                            const parentQty = parentItem ? parentItem.cantidad : 1;

                            const serviceRow: LineItem = {
                                id: serviceRowId,
                                cantidad: parentQty, // inherit parent quantity
                                unidad: mapCatalogUnitToQuoteUnit(serviceProd.unit),
                                descripcion: `${serviceProd.base_name} - Servicio para ${matchedProduct.base_name}`,
                                precio_unitario: servicePrice,
                                total: parseFloat((parentQty * servicePrice).toFixed(2)),
                                sku_corto: serviceProd.sku_corto || ''
                            };

                            // Bind the service product to the service row
                            setTimeout(() => {
                                setBoundProducts(prevBounds => {
                                    const next = new Map(prevBounds);
                                    next.set(serviceRowId, {
                                        catalog_product_id: serviceProd.id,
                                        sku: serviceProd.sku,
                                        sku_corto: serviceProd.sku_corto || undefined,
                                        base_name: serviceProd.base_name,
                                        presentation: serviceProd.presentation || null,
                                        min_price: servicePrice // lock it at calculated price
                                    });
                                    return next;
                                });
                            }, 0);

                            updatedForm.items = [...updatedForm.items, serviceRow];
                            updatedForm = {
                                ...updatedForm,
                                ...recalc(updatedForm.items, updatedForm.descuento, updatedForm.tipo_documento, updatedForm.adelanto)
                            };
                        }
                    }

                    return updatedForm;
                });
                return true;
            } else {
                // Set code-not-found error
                setSaveErrors(prev => {
                    const next = new Map(prev);
                    next.set(lineId, `El código "${code}" no existe en el catálogo.`);
                    return next;
                });
                return false;
            }
        };
        const intercepted = confirmDiscountInvalidation(proceed);
        if (intercepted) {
            return false;
        }
        return proceed();
    }, [allCatalogProducts, bindProduct, unbindProduct, confirmDiscountInvalidation]);

    const getBrandWarning = (itemId: string) => {
        const bound = boundProducts.get(itemId);
        if (!bound) return null;

        const catalogProd = allCatalogProducts.find(p => p.id === bound.catalog_product_id);
        if (!catalogProd || !catalogProd.is_service) return null;

        // Find the parent board product in the current items
        const parentItem = form.items.find(it => {
            const itBound = boundProducts.get(it.id);
            if (!itBound) return false;
            const parentProd = allCatalogProducts.find(p => p.id === itBound.catalog_product_id);
            return parentProd?.has_associated_service && parentProd?.associated_service_id === catalogProd.id;
        });

        if (parentItem) {
            const parentBound = boundProducts.get(parentItem.id);
            const parentProd = allCatalogProducts.find(p => p.id === parentBound?.catalog_product_id);
            if (parentProd && parentProd.brand && catalogProd.brand && parentProd.brand.toLowerCase() !== catalogProd.brand.toLowerCase()) {
                return `Advertencia: La marca del canto (${catalogProd.brand}) difiere de la del tablero (${parentProd.brand}).`;
            }
        }
        return null;
    };

    // Derived inline errors (price < min_price on bound lines)
    const priceErrors = useMemo(() => {
        const errors = new Map<string, string>();
        form.items.forEach(item => {
            const bound = boundProducts.get(item.id);
            if (bound && item.precio_unitario > 0 && item.precio_unitario < bound.min_price) {
                errors.set(item.id, `Precio mínimo de catálogo: S/ ${bound.min_price.toFixed(2)}`);
            }
        });
        return errors;
    }, [form.items, boundProducts]);

    // Combined errors shown in the modal
    const lineErrors = useMemo(() => {
        const combined = new Map<string, string>(priceErrors);
        saveErrors.forEach((v, k) => { if (!combined.has(k)) combined.set(k, v); });
        return combined;
    }, [priceErrors, saveErrors]);

    // Item IDs whose unit was manually selected by the user — auto-detection
    // from description keywords (CANTO→MTS, SERVICIO→SERV) is suppressed for these.
    const manualUnitsRef = useRef<Set<string>>(new Set());

    // Click outside date picker
    useEffect(() => {
        const fn = (e: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node))
                setShowDatePicker(false);
        };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, []);

    // Business info + contacts when editor opens
    useEffect(() => {
        if (editorOpen) {
            api.getBusinessInfo().then(setBusinessInfo).catch(() => {});
            api.getContacts('CLIENT').then(setContacts).catch(() => {});
        }
    }, [editorOpen]);

    // Fetches TABLEROS catalog + similarity threshold. Returns fresh values so save() can use
    // them immediately (React state updates are async and won't reflect in the same closure).
    const fetchCatalogAndThreshold = useCallback(async (): Promise<{ catalog: TablerosProduct[]; threshold: number }> => {
        let threshold = 0.75;
        try {
            appSettingsService.invalidate(SETTING_KEYS.CONTROLLED_SIMILARITY_THRESHOLD);
            const t = await appSettingsService.get<number>(
                SETTING_KEYS.CONTROLLED_SIMILARITY_THRESHOLD,
                0.75,
            );
            threshold = Number(t) || 0.75;
            setSimilarityThreshold(threshold);
        } catch { /* keep default */ }

        const { data, error } = await supabase
            .from('catalog_products')
            .select('id,sku,base_name,presentation,min_price')
            .like('sku', 'TAB%');
        let catalog: TablerosProduct[] = [];
        if (error) {
            console.error('[TABLEROS] Error cargando catálogo:', error.message);
        } else {
            catalog = (data as TablerosProduct[]) || [];
            setTablerosCatalog(catalog);
            if (!catalog.length) console.warn('[TABLEROS] Catálogo vacío: no hay productos con SKU "TAB...".');
        }
        return { catalog, threshold };
    }, []);

    useEffect(() => {
        if (!editorOpen) return;
        fetchCatalogAndThreshold();
        fetchAllCatalogProducts().then(catalog => {
            if (!catalog.length) return;
            setBoundProducts(prev => {
                const items = formRef.current.items;
                const toAdd: Array<[string, BoundProduct]> = [];
                items.forEach(item => {
                    if (prev.has(item.id)) return;

                    // Match catalog product by exact canonical name, sku_corto/sku, or service description inclusion
                    const match = catalog.find((p: any) => {
                        // 1. Check SKU match
                        if (item.sku_corto) {
                            const upperSkuCorto = item.sku_corto.trim().toUpperCase();
                            if ((p.sku_corto && p.sku_corto.toUpperCase() === upperSkuCorto) || p.sku.toUpperCase() === upperSkuCorto) {
                                return true;
                            }
                        }
                        // 2. Check service description inclusion
                        if (p.is_service) {
                            return item.descripcion.trim().toLowerCase().includes(p.base_name.trim().toLowerCase());
                        }
                        // 3. Check canonical description match for products
                        const fullName = p.presentation ? `${p.base_name} ${p.presentation}` : p.base_name;
                        return item.descripcion.trim().toLowerCase() === fullName.trim().toLowerCase();
                    });

                    if (match) {
                        toAdd.push([item.id, {
                            catalog_product_id: match.id,
                            sku: match.sku,
                            sku_corto: match.sku_corto || undefined,
                            base_name: match.base_name,
                            presentation: match.presentation || null,
                            min_price: match.is_service ? item.precio_unitario : (match.min_price || 0),
                        }]);
                    }
                });
                if (!toAdd.length) return prev;
                const next = new Map(prev);
                toAdd.forEach(([id, bp]) => next.set(id, bp));
                return next;
            });
        });
    }, [editorOpen, fetchCatalogAndThreshold]);

    // Realtime: keep TABLEROS catalog + bound min_prices in sync while the editor is open.
    // Requires catalog_products to have Realtime enabled in Supabase (see SQL note below).
    useEffect(() => {
        if (!editorOpen) return;
        const channel = supabase
            .channel('catalog-products-live')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'catalog_products' },
                (payload) => {
                    const updated = payload.new as TablerosProduct & Record<string, unknown>;
                    if (!updated.sku?.startsWith('TAB')) return;
                    // Refresh the local catalog entry
                    setTablerosCatalog(prev =>
                        prev.map(p => p.id === updated.id
                            ? { ...p, min_price: updated.min_price, base_name: updated.base_name, presentation: updated.presentation }
                            : p
                        )
                    );
                    // Update any bound row that references this product
                    setBoundProducts(prev => {
                        let changed = false;
                        const next = new Map(prev);
                        next.forEach((bp, lineId) => {
                            if (bp.catalog_product_id === updated.id && bp.min_price !== updated.min_price) {
                                next.set(lineId, { ...bp, min_price: updated.min_price });
                                changed = true;
                            }
                        });
                        return changed ? next : prev;
                    });
                },
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [editorOpen]);

    // Reset bindings + errors when editor closes
    useEffect(() => {
        if (!editorOpen) {
            setBoundProducts(new Map());
            setSaveErrors(new Map());
            setSaveErrorKind('other');
            setClientError(false);
            touchedDescriptionsRef.current.clear();
        }
    }, [editorOpen]);
    // Reset only when switching between two different existing cotizaciones.
    // Do NOT reset when going null → newId (first borrador save of a new cotización).
    useEffect(() => {
        const prev = prevEditingIdRef.current;
        prevEditingIdRef.current = editingId;
        if (prev !== null && editingId !== null && prev !== editingId) {
            setBoundProducts(new Map());
            setSaveErrors(new Map());
        }
    }, [editingId]);


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
            // Vendedores solo ven sus propias cotizaciones
            if (isVentas && user?.id) {
                q = q.eq('user_id', user.id);
            }
            if (filterEstado === 'ELIMINADO') {
                q = q.eq('estado', 'ELIMINADO');
            } else if (filterEstado !== 'TODOS') {
                q = q.eq('estado', filterEstado);
            } else {
                q = q.neq('estado', 'ELIMINADO');
            }
            const { data, error } = await q;
            if (error) throw error;
            setCotizaciones((data as Cotizacion[]) || []);
        } catch (e: any) {
            console.error(e);
            setFetchError(e?.message || 'Error desconocido al cargar cotizaciones');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, filterEstado, isVentas, user?.id]);
    fetchDataRef.current = fetchData;

    useEffect(() => {
        fetchData();
        fetchAllCatalogProducts();
    }, [fetchData]);

    useEffect(() => {
        const channel = supabase
            .channel('cotizaciones-comprobante-live')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'cotizaciones' },
                (payload) => {
                    const updated = payload.new as Cotizacion;
                    setCotizaciones(prev =>
                        prev.map(c => c.id === updated.id
                            ? {
                                ...c,
                                numero_comprobante: updated.numero_comprobante,
                                comprobante_locked: updated.comprobante_locked,
                                tipo_documento: updated.tipo_documento,
                                sustento_comprobante_url: updated.sustento_comprobante_url,
                                descuento: updated.descuento,
                                descuento_estado_aprobacion: updated.descuento_estado_aprobacion as any,
                                descuento_comentarios_admin: updated.descuento_comentarios_admin,
                                igv: updated.igv,
                                total: updated.total,
                                saldo_pendiente: updated.saldo_pendiente,
                              }
                            : c
                        )
                    );
                    // Update open modal form if it's this cotización
                    if (editingIdRef.current === updated.id) {
                        setForm(prev => ({
                            ...prev,
                            descuento: updated.descuento ?? prev.descuento,
                            descuento_estado_aprobacion: (updated.descuento_estado_aprobacion as any) || prev.descuento_estado_aprobacion,
                            descuento_comentarios_admin: updated.descuento_comentarios_admin ?? prev.descuento_comentarios_admin,
                            igv: updated.igv ?? prev.igv,
                            total: updated.total ?? prev.total,
                            saldo_pendiente: updated.saldo_pendiente ?? prev.saldo_pendiente,
                        }));
                    }
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterEstado, startDate, endDate]);

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return cotizaciones;
        const q = searchTerm.toLowerCase();
        return cotizaciones.filter(c =>
            c.codigo?.toLowerCase().includes(q) ||
            c.cliente_nombre?.toLowerCase().includes(q) ||
            c.cliente_doi?.toLowerCase().includes(q) ||
            c.numero_comprobante?.toLowerCase().includes(q)
        );
    }, [cotizaciones, searchTerm]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = useMemo(
        () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [filtered, currentPage]
    );

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
        document.body.style.overflow = 'hidden';
        setForm(emptyForm());
        setEditingId(null);
        setEditingCode('');
        setIsDirty(false);
        setClientFromList(false);
        setDoiLocked(false);
        setNameLocked(false);
        manualUnitsRef.current = new Set();
        setEditorOpen(true);
    };

    const openEdit = (c: Cotizacion) => {
        const tipo: TipoDoc = c.tipo_documento === 'BOLETA' ? 'BOLETA' : (c.tipo_documento === 'TICKET' ? 'TICKET' : 'FACTURA');
        const isPublicoGeneral = /^PÚBLICO GENERAL \((.+)\)$/.test(c.cliente_nombre || '');
        setClientFromList(!isPublicoGeneral);
        setForm({
            estado: c.estado,
            tipo_documento: tipo,
            cliente_nombre: stripPublicoGeneral(c.cliente_nombre || ''),
            cliente_doi: c.cliente_doi || '',
            cliente_direccion: c.cliente_direccion || '',
            cliente_telefono: c.cliente_telefono || '',
            cliente_email: c.cliente_email || '',
            fecha_emision: c.fecha_emision || format(new Date(), 'yyyy-MM-dd'),
            fecha_entrega: c.fecha_entrega || null,
            items: c.items?.length
                ? c.items
                : [{ id: crypto.randomUUID(), cantidad: 1, unidad: 'PLS', descripcion: '', precio_unitario: 0, total: 0 }],
            subtotal: c.subtotal || 0,
            descuento: c.descuento || 0,
            igv: c.igv || 0,
            total: c.total || 0,
            adelanto: c.adelanto || 0,
            saldo_pendiente: c.saldo_pendiente || 0,
            notas: c.notas || '',
            condiciones_pago: c.condiciones_pago || '',
            descripcion: c.descripcion || '',
            numero_comprobante: c.numero_comprobante || '',
            comprobante_locked: c.comprobante_locked || false,
            descuento_sugerido: c.descuento_sugerido || 0,
            descuento_sugerido_porcentaje: c.descuento_sugerido_porcentaje || 0,
            descuento_solicitado: c.descuento_solicitado || false,
            descuento_estado_aprobacion: (c.descuento_estado_aprobacion as any) || 'NINGUNO',
            descuento_motivo_solicitud: c.descuento_motivo_solicitud || '',
            descuento_comentarios_admin: c.descuento_comentarios_admin || '',
            prioridad: c.prioridad || 'NORMAL',
        });
        setEditingId(c.id);
        setEditingCode(c.codigo || '');
        setIsDirty(false);
        setDoiLocked(false);
        setNameLocked(false);
        // Existing items came from the DB → treat their units as manually chosen
        manualUnitsRef.current = new Set((c.items || []).map(it => it.id));
        document.body.style.overflow = 'hidden';
        setEditorOpen(true);
    };

    const closeEditor = useCallback(() => setEditorOpen(false), []);

    const updateItem = useCallback((id: string, field: keyof LineItem, raw: string) => {
        // Prevent manual edits to quantity of a dependent service row
        if (field === 'cantidad') {
            const bound = boundProductsRef.current.get(id);
            if (bound) {
                const catalogProd = allCatalogProductsRef.current.find(p => p.id === bound.catalog_product_id);
                if (catalogProd && catalogProd.is_service) {
                    const isDependent = formRef.current.items.some(it => {
                        if (it.id === id) return false;
                        const itBound = boundProductsRef.current.get(it.id);
                        if (!itBound) return false;
                        const parentProd = allCatalogProductsRef.current.find(p => p.id === itBound.catalog_product_id);
                        return parentProd?.has_associated_service && parentProd?.associated_service_id === catalogProd.id;
                    });
                    if (isDependent) return; // ignore manual updates to service quantity
                }
            }
        }

        const proceed = () => {
            setIsDirty(true);
            if (field === 'unidad') manualUnitsRef.current.add(id);
            if (field === 'descripcion') touchedDescriptionsRef.current.add(id);
            // Editing description unbinds the line — text no longer represents the bound product
            if (field === 'descripcion' && boundProductsRef.current.has(id)) {
                setBoundProducts(prev => {
                    const next = new Map(prev);
                    next.delete(id);
                    return next;
                });
            }
            // Clear save-time error for this line on any edit
            setSaveErrors(prev => {
                if (!prev.has(id)) return prev;
                const next = new Map(prev);
                next.delete(id);
                return next;
            });
            setForm(prev => {
                const items = prev.items.map(it => {
                    if (it.id !== id) return it;
                    const val = (field === 'cantidad' || field === 'precio_unitario') ? parseFloat(raw) || 0 : raw;
                    const updated = { ...it, [field]: val } as LineItem;
                    if (field === 'cantidad' || field === 'precio_unitario') {
                        updated.total = parseFloat((updated.cantidad * updated.precio_unitario).toFixed(2));
                    }
                    // Auto-pick unit from description keywords if user hasn't chosen one.
                    // SERVICIO has higher priority than CANTO so "servicio de canto" → SERV.
                    const bound = boundProductsRef.current.get(id);
                    if (field === 'descripcion' && !manualUnitsRef.current.has(id) && !bound) {
                        const upper = String(val).toUpperCase();
                        if (upper.includes('SERVICIO')) updated.unidad = 'SERV';
                        else if (upper.includes('CANTO')) updated.unidad = 'MTS';
                        else updated.unidad = 'PLS';
                    }
                    return updated;
                });

                if (field === 'cantidad') {
                    const bound = boundProductsRef.current.get(id);
                    const catalogProd = bound
                        ? allCatalogProductsRef.current.find(p => p.id === bound.catalog_product_id)
                        : null;

                    if (catalogProd && catalogProd.has_associated_service && catalogProd.associated_service_id) {
                        const val = parseFloat(raw) || 0;

                        // Find all parents of this product type in the list of items
                        const parentItems = items.filter(it => {
                            const itBound = boundProductsRef.current.get(it.id);
                            return itBound && itBound.catalog_product_id === catalogProd.id;
                        });

                        // Find our parent's relative index
                        const parentIdx = parentItems.findIndex(it => it.id === id);

                        // Find all service rows of this associated service product type
                        const serviceItems = items.filter(it => {
                            const itBound = boundProductsRef.current.get(it.id);
                            return itBound && itBound.catalog_product_id === catalogProd.associated_service_id;
                        });

                        // Pair them: only update the service row at the same relative index
                        if (parentIdx >= 0 && parentIdx < serviceItems.length) {
                            const targetServiceId = serviceItems[parentIdx].id;
                            const updatedItems = items.map(it => {
                                if (it.id === targetServiceId) {
                                    const updatedService = { ...it, cantidad: val };
                                    updatedService.total = parseFloat((val * updatedService.precio_unitario).toFixed(2));
                                    return updatedService;
                                }
                                return it;
                            });
                            return { ...prev, items: updatedItems, ...recalc(updatedItems, prev.descuento, prev.tipo_documento, prev.adelanto) };
                        }
                    }
                }

                return { ...prev, items, ...recalc(items, prev.descuento, prev.tipo_documento, prev.adelanto) };
            });
        };

        const intercepted = confirmDiscountInvalidation(proceed);
        if (!intercepted) {
            proceed();
        }
    }, [confirmDiscountInvalidation]);

    const addRow = useCallback(() => {
        const proceed = () => {
            setIsDirty(true);
            const newId = crypto.randomUUID();
            setForm(prev => ({
                ...prev,
                items: [...prev.items, { id: newId, cantidad: 1, unidad: 'PLS', descripcion: '', precio_unitario: 0, total: 0 }],
            }));
            setPendingFocusRowId(newId);
        };
        const intercepted = confirmDiscountInvalidation(proceed);
        if (!intercepted) {
            proceed();
        }
    }, [confirmDiscountInvalidation]);

    const removeRow = useCallback((id: string) => {
        const proceed = () => {
            setIsDirty(true);
            const bound = boundProductsRef.current.get(id);
            const catalogProd = bound
                ? allCatalogProductsRef.current.find(p => p.id === bound.catalog_product_id)
                : null;

            // Product→Service: get the associated service product ID
            let serviceProductId: string | null = catalogProd?.associated_service_id ?? null;

            // Fallback: if the row is unbound but has sku_corto, look up catalog to find service
            if (!serviceProductId && !catalogProd?.is_service) {
                const item = formRef.current.items.find(it => it.id === id);
                if (item?.sku_corto) {
                    const fallbackProd = allCatalogProductsRef.current.find(
                        p => p.sku_corto === item.sku_corto && !p.is_service
                    );
                    serviceProductId = fallbackProd?.associated_service_id ?? null;
                }
            }

            setForm(prev => {
                const idsToRemove = new Set<string>([id]);

                // Cascade: remove the associated service row when removing a product
                if (serviceProductId) {
                    prev.items.forEach(it => {
                        if (it.id === id) return;
                        const itBound = boundProductsRef.current.get(it.id);
                        if (itBound?.catalog_product_id === serviceProductId) idsToRemove.add(it.id);
                    });
                }

                // Cascade: remove the parent product row when removing a service
                if (catalogProd?.is_service && bound) {
                    prev.items.forEach(it => {
                        if (it.id === id) return;
                        const itBound = boundProductsRef.current.get(it.id);
                        if (!itBound) return;
                        const itProd = allCatalogProductsRef.current.find(p => p.id === itBound.catalog_product_id);
                        if (itProd?.associated_service_id === bound.catalog_product_id) idsToRemove.add(it.id);
                    });
                }

                const items = prev.items.filter(it => !idsToRemove.has(it.id));
                return { ...prev, items, ...recalc(items, prev.descuento, prev.tipo_documento, prev.adelanto) };
            });

            setBoundProducts(prev => {
                const next = new Map(prev);
                next.delete(id);
                // Remove bound entries for cascade-deleted service rows
                if (serviceProductId) {
                    prev.forEach((bp, rowId) => {
                        if (bp.catalog_product_id === serviceProductId) next.delete(rowId);
                    });
                }
                // Remove bound entries for cascade-deleted parent product rows
                if (catalogProd?.is_service && bound) {
                    prev.forEach((bp, rowId) => {
                        if (rowId === id) return;
                        const bpProd = allCatalogProductsRef.current.find(p => p.id === bp.catalog_product_id);
                        if (bpProd?.associated_service_id === bound.catalog_product_id) next.delete(rowId);
                    });
                }
                return next;
            });
        };
        const intercepted = confirmDiscountInvalidation(proceed);
        if (!intercepted) {
            proceed();
        }
    }, [confirmDiscountInvalidation]);

    const handleDescuentoChange = useCallback((val: string) => {
        setIsDirty(true);
        const d = parseFloat(val) || 0;
        setForm(prev => ({ ...prev, descuento: d, ...recalc(prev.items, d, prev.tipo_documento, prev.adelanto) }));
    }, []);

    const handleAdelantoChange = useCallback((val: string) => {
        setIsDirty(true);
        const a = parseFloat(val) || 0;
        setForm(prev => ({
            ...prev,
            adelanto: a,
            saldo_pendiente: parseFloat((prev.total - a).toFixed(2)),
        }));
    }, []);

    const handleTipoDocumento = useCallback((tipo: TipoDoc) => {
        setIsDirty(true);
        setForm(prev => ({
            ...prev,
            tipo_documento: tipo,
            ...recalc(prev.items, prev.descuento, tipo, prev.adelanto),
        }));
    }, []);



    const buildExportData = () => ({
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
            doi: form.cliente_doi,
            address: form.cliente_direccion,
            deliveryDate: form.fecha_entrega,
            descripcion: form.descripcion,
            notas: form.notas,
        },
        businessInfo,
        prioridad: form.prioridad || 'NORMAL',
    });

    const handleExportPDF = async () => {
        try {
            await generateQuotePDF(buildExportData(), `Cotizacion_${editingCode || 'Nueva'}`);
        } catch (e) {
            console.error('Failed to export PDF:', e);
        }
    };
    const handlePrintPDF  = async () => {
        try {
            await printQuotePDF(buildExportData());
        } catch (e) {
            console.error('Failed to print PDF:', e);
        }
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

    const save = async (estadoOverride?: 'BORRADOR' | 'LISTO', isDiscount?: boolean) => {
        // ── Validate required fields ──────────────────────────────────────────
        if (!form.cliente_nombre.trim()) {
            setClientError(true);
            setSaveStatus('error');
            setSaveErrorKind('client');
            window.setTimeout(() => setSaveStatus('idle'), 3500);
            return;
        }
        setClientError(false);

        // ── Validate minimum prices on bound products ─────────────────────────
        const errors = new Map<string, string>();
        form.items.forEach(item => {
            const bound = boundProducts.get(item.id);
            if (bound && item.precio_unitario > 0 && item.precio_unitario < bound.min_price) {
                errors.set(item.id, `Precio mínimo de catálogo: S/ ${bound.min_price.toFixed(2)}`);
            }
        });
        if (errors.size > 0) {
            setSaveErrorKind('price');
            setSaveErrors(errors);
            setSaveStatus('error');
            window.setTimeout(() => setSaveStatus('idle'), 3500);
            return;
        }

        if (isDiscount) {
            setIsSavingDiscount(true);
        } else if (estadoOverride === 'BORRADOR') {
            setIsSavingDraft(true);
        }
        setSaveStatus('saving');
        try {
            // Recalcular si el nombre coincide con un contacto registrado: el flag
            // clientFromList puede quedar desincronizado (p.ej. el onChange del input
            // lo pone en false antes de que el usuario decida cancelar el diálogo de
            // invalidación de descuento), causando que un cliente real se grabe como
            // "PÚBLICO GENERAL (...)".
            const trimmedClientName = form.cliente_nombre.trim();
            const alreadyPublicoGeneral = /^PÚBLICO GENERAL \(.+\)$/.test(trimmedClientName);
            const isRegisteredContact = trimmedClientName.length > 0 && contacts.some(
                c => c.name.toLowerCase().trim() === trimmedClientName.toLowerCase()
            );
            const clienteNombreFinal = (!isRegisteredContact && !alreadyPublicoGeneral && trimmedClientName)
                ? `PÚBLICO GENERAL (${trimmedClientName})`
                : form.cliente_nombre;
            // Al procesar (LISTO) persistimos los datos SIN cambiar aún el estado. Solo
            // marcamos LISTO después de crear la venta con éxito, para no dejar una
            // cotización LISTO (solo lectura) sin venta asociada si la RPC falla.
            const processingToListo = estadoOverride === 'LISTO';
            const estadoToPersist = processingToListo ? form.estado : (estadoOverride ?? form.estado);
            const payload = { ...form, cliente_nombre: clienteNombreFinal, estado: estadoToPersist };
            let cotizacionId = editingId;

            const { comprobante_locked, ...payloadWithoutLock } = payload;

            if (editingId) {
                let { error } = await supabase.from('cotizaciones').update(payload).eq('id', editingId);
                if (error && (error.message.includes('comprobante_locked') || error.code === '42703')) {
                    console.warn("comprobante_locked column does not exist, retrying without it...");
                    const { error: retryError } = await supabase.from('cotizaciones').update(payloadWithoutLock).eq('id', editingId);
                    if (retryError) throw retryError;
                } else if (error) {
                    throw error;
                }
            } else {
                let { data: inserted, error } = await supabase
                    .from('cotizaciones')
                    .insert({ ...payload, user_id: user?.id ?? null })
                    .select('id, codigo')
                    .maybeSingle();
                if (error && (error.message.includes('comprobante_locked') || error.code === '42703')) {
                    console.warn("comprobante_locked column does not exist, retrying without it...");
                    const { data: retryInserted, error: retryError } = await supabase
                        .from('cotizaciones')
                        .insert({ ...payloadWithoutLock, user_id: user?.id ?? null })
                        .select('id, codigo')
                        .maybeSingle();
                    if (retryError) throw retryError;
                    inserted = retryInserted;
                } else if (error) {
                    throw error;
                }
                if (inserted) {
                    cotizacionId = inserted.id;
                    setEditingCode(inserted.codigo);
                    setEditingId(inserted.id);
                }
            }

            if (cotizacionId) {
                await syncItemsTable(cotizacionId, form.items);
            }

            if (processingToListo && cotizacionId) {
                const { error: rpcError } = await supabase.rpc('cotizacion_to_venta', { p_cotizacion_id: cotizacionId }).maybeSingle();
                if (rpcError) throw rpcError;
                // La venta se creó correctamente: ahora sí marcamos la cotización como LISTO.
                const { error: estadoError } = await supabase.from('cotizaciones').update({ estado: 'LISTO' }).eq('id', cotizacionId);
                if (estadoError) throw estadoError;
            }

            setSaveStatus('success');
            await fetchData();
            if (estadoOverride === 'LISTO') {
                setFilterEstado('TODOS');
                setTimeout(() => { setSaveStatus('idle'); setIsSavingDiscount(false); setIsSavingDraft(false); closeEditor(); }, 1500);
            } else {
                setIsDirty(false);
                setTimeout(() => { setSaveStatus('idle'); setIsSavingDiscount(false); setIsSavingDraft(false); }, 1500);
            }
        } catch (e) {
            console.error(e);
            setSaveErrorKind('other');
            setSaveStatus('error');
            setTimeout(() => { setSaveStatus('idle'); setIsSavingDiscount(false); setIsSavingDraft(false); }, 3000);
        }
    };

    // Keep saveRef always pointing to the latest save closure (enables stable callbacks below)
    saveRef.current = save;
    const handleSaveBorrador = useCallback((isDiscount?: boolean) => { saveRef.current?.('BORRADOR', isDiscount); }, []);
    const handleSaveListo    = useCallback(() => { saveRef.current?.('LISTO'); }, []);

    const deleteCot = async (id: string) => {
        const { error } = await supabase.from('cotizaciones').update({ estado: 'ELIMINADO' }).eq('id', id);
        if (!error) { setDeleteConfirmId(null); fetchData(); }
    };

    const saveComprobante = async (id: string, val: string) => {
        const cot = cotizaciones.find(c => c.id === id);
        const valorAnterior = cot?.numero_comprobante || null;
        const valorNuevo = val.trim() || null;
        const { error } = await supabase
            .from('cotizaciones')
            .update({ numero_comprobante: valorNuevo })
            .eq('id', id);
        if (error) throw error;
        if (valorAnterior !== valorNuevo) {
            try {
                await supabase.from('cotizaciones_audit_log').insert({
                    cotizacion_id: id,
                    cotizacion_codigo: cot?.codigo,
                    campo: 'numero_comprobante',
                    valor_anterior: valorAnterior,
                    valor_nuevo: valorNuevo,
                });
            } catch (e) { console.error(e); }
        }
        await fetchData();
    };

    saveComprobanteRef.current = saveComprobante;
    const handleSaveComprobante = useCallback((val: string): Promise<void> => {
        const id = editingIdRef.current;
        return id ? saveComprobanteRef.current!(id, val) : Promise.resolve();
    }, []);

    const duplicateFromModal = useCallback(async () => {
        const eid = editingIdRef.current;
        if (!eid) return;
        const cot = cotizacionesRef.current.find(c => c.id === eid);
        if (!cot) return;
        const { codigo: _c, id: _i, created_at: _d, ...rest } = cot;
        await supabase.from('cotizaciones').insert({ ...rest, estado: 'BORRADOR', user_id: user?.id ?? null });
        await fetchDataRef.current?.();
        closeEditor();
    }, [closeEditor]);

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
                isDirty={isDirty}
                contacts={contacts}
                onClose={closeEditor}
                onSaveBorrador={handleSaveBorrador}
                onSaveListo={handleSaveListo}
                onFormChange={handleFormChange}
                onClientSelect={setClientFromList}
                onUpdateItem={updateItem}
                onAddRow={addRow}
                onRemoveRow={removeRow}
                onDescuentoChange={handleDescuentoChange}
                onAdelantoChange={handleAdelantoChange}
                onTipoDocumento={handleTipoDocumento}
                onExportPDF={handleExportPDF}
                onPrint={handlePrintPDF}
                onDuplicate={editingId ? duplicateFromModal : undefined}
                isReadOnly={form.estado === 'LISTO' || form.descuento_estado_aprobacion === 'PENDIENTE'}
                isSavingDiscount={isSavingDiscount}
                isSavingDraft={isSavingDraft}
                pendingFocusRowId={pendingFocusRowId}
                doiLocked={doiLocked}
                nameLocked={nameLocked}
                onDoiLocked={setDoiLocked}
                onNameLocked={setNameLocked}
                cotizacionId={editingId}
                onSaveComprobante={handleSaveComprobante}
                tablerosCatalog={tablerosCatalog}
                similarityThreshold={similarityThreshold}
                boundProducts={boundProducts}
                lineErrors={lineErrors}
                saveErrorKind={saveErrorKind}
                touchedDescriptionsRef={touchedDescriptionsRef}
                onBindProduct={bindProduct}
                onUnbindProduct={unbindProduct}
                clientError={clientError}
                allCatalogProducts={allCatalogProducts}
                isVentas={isVentas}
                handleCodeSubmit={handleCodeSubmit}
                getBrandWarning={getBrandWarning}
            />

            {/* Discount Invalidation Warning Modal */}
            {pendingInvalidationAction && (
                <div
                    className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in"
                >
                    <div
                        className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col items-center gap-6 animate-scale-in"
                    >
                        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center animate-bounce">
                            <span className="material-icons-round text-4xl">warning</span>
                        </div>

                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-black text-slate-800 tracking-tight">
                                ¿Deseas invalidar el descuento?
                            </h3>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                Modificar los valores de la tabla o el cliente invalidará el descuento de
                                <span className="font-extrabold text-slate-700"> S/ {form.descuento_sugerido?.toFixed(2)} </span>
                                que fue aprobado previamente por el administrador.
                            </p>
                        </div>

                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setPendingInvalidationAction(null)}
                                className="flex-1 py-3 border-2 border-slate-200 hover:border-slate-300 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (pendingInvalidationAction) {
                                        pendingInvalidationAction();
                                    }
                                }}
                                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 rounded-2xl text-sm font-bold text-white shadow-lg shadow-amber-500/25 transition-all"
                            >
                                Sí, continuar
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowDashboardLegend(v => !v)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all text-[11px] font-black uppercase tracking-widest ${showDashboardLegend ? 'bg-[#366480] text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            <span className="material-icons-round text-sm">list_alt</span>
                            Leyenda de SKU
                        </button>
                        <button
                            onClick={openNew}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#366480] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#2c5268] transition-all shadow-md"
                        >
                            <Plus className="w-4 h-4" /> Nueva Cotización
                        </button>
                    </div>
                </div>

                {/* Filter bar */}
                <div className="px-8 py-5 flex flex-wrap items-center gap-3 shrink-0 border-b border-[#f0f5f4]">
                    <div className="relative flex-1 min-w-[260px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b9ba5]" />
                        <SearchInput
                            value={searchTerm}
                            onSearch={setSearchTerm}
                            placeholder="Buscar por código, cliente, DOI..."
                            className="w-full pl-11 pr-5 py-3 bg-white border border-[#c8d8de] shadow-sm rounded-full text-[12px] font-bold text-[#2c3434] outline-none focus:border-[#366480] focus:ring-2 focus:ring-[#366480]/10 transition-all placeholder:text-[#8b9ba5] placeholder:font-normal"
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
                            <option value="ELIMINADO">Eliminados</option>
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

                {/* Table view */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {fetchError && (
                        <div className="m-6 flex items-start gap-3 px-5 py-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700">
                            <span className="material-icons-round text-sm mt-0.5">error_outline</span>
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest mb-0.5">Error al cargar cotizaciones</p>
                                <p className="text-xs font-medium">{fetchError}</p>
                                <button onClick={fetchData} className="mt-2 text-xs font-black text-rose-600 underline underline-offset-2">Reintentar</button>
                            </div>
                        </div>
                    )}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center h-40">
                                <div className="w-8 h-8 border-2 border-[#366480] border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : !fetchError && filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-60 gap-4 text-[#8b9ba5]">
                                <Receipt className="w-12 h-12 opacity-30" />
                                <p className="text-[12px] font-bold uppercase tracking-widest">Sin cotizaciones</p>
                                <button onClick={openNew} className="text-[11px] font-black text-[#366480] underline underline-offset-2">Crear la primera</button>
                            </div>
                        ) : (
                            <div className="mx-6 my-4 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                <table className="w-full text-left" style={{ fontFamily: "'Manrope', sans-serif" }}>
                                    <thead>
                                        <tr className="text-[13px] font-black uppercase tracking-[0.2em] text-[#366480]/60 bg-slate-50 border-b border-slate-200">
                                            <th className="px-5 py-4">ID De Cotización</th>
                                            <th className="px-5 py-4">Cliente / Título</th>
                                            <th className="px-5 py-4">Fecha</th>
                                            <th className="px-5 py-4">Prioridad</th>
                                            <th className="px-5 py-4">Estado</th>
                                            <th className="px-5 py-4 text-right">Total</th>
                                            <th className="px-4 py-4 w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {paginated.map(c => (
                                            <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-4">
                                                    <button
                                                        onClick={() => openEdit(c)}
                                                        className="text-[15px] font-[900] text-[#4A90E2] hover:text-[#366480] hover:underline underline-offset-2 transition-colors"
                                                    >
                                                        {c.codigo}
                                                    </button>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <p className="text-[14px] font-[900] text-[#2c3434] uppercase tracking-tight">
                                                        {stripPublicoGeneral(c.cliente_nombre) || '—'}
                                                    </p>
                                                    {c.descripcion && (
                                                        <p className="text-[12px] font-extrabold text-slate-400 truncate max-w-[200px] mt-0.5" title={c.descripcion}>
                                                            {c.descripcion}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <p className="text-[13px] font-medium text-[#2c3434]/70">
                                                        {c.fecha_emision ? format(new Date(c.fecha_emision + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                                                    </p>
                                                    <p className="text-[11px] font-medium text-slate-400 mt-0.5 tabular-nums">
                                                        {fmtLimaTime(c.created_at)}
                                                    </p>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                        c.prioridad === 'MUY ALTO' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                        c.prioridad === 'ALTO' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                        'bg-slate-50 text-slate-500 border border-slate-100'
                                                    }`}>
                                                        {c.prioridad || 'NORMAL'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <StatusBadge estado={c.estado} />
                                                </td>
                                                <td className="px-5 py-4 text-right text-[16px] font-[900] text-[#2c3434] tabular-nums">
                                                    {fmtSol(c.total)}
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    {c.estado === 'BORRADOR' && c.descuento_estado_aprobacion !== 'PENDIENTE' && (
                                                        <button
                                                            onClick={() => setDeleteConfirmId(c.id)}
                                                            className="w-7 h-7 flex items-center justify-center rounded-xl bg-slate-50 text-slate-300 hover:text-rose-400 hover:bg-rose-50 transition-all"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    {!loading && !fetchError && filtered.length > 0 && (
                        <div className="flex items-center justify-between px-8 py-4 border-t border-slate-100 bg-white/60 shrink-0">
                            <span className="text-[11px] font-bold text-slate-400">
                                Mostrando {paginated.length} de {filtered.length} registros
                            </span>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition-all"
                                    >
                                        <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                                    </button>
                                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                        const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                                        return start + i;
                                    }).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-8 h-8 rounded-lg text-[11px] font-black transition-all ${
                                                currentPage === page
                                                    ? 'bg-[#2c3434] text-white shadow-sm'
                                                    : 'text-slate-500 hover:bg-slate-100'
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition-all"
                                    >
                                        <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Voucher (comprobante) inline edit modal */}
                <VoucherEditModal
                    isOpen={!!voucherEditTarget}
                    cotizacion={voucherEditTarget}
                    onClose={() => setVoucherEditTarget(null)}
                    onSave={val => voucherEditTarget ? saveComprobante(voucherEditTarget.id, val) : Promise.resolve()}
                />

                {/* Delete confirmation modal */}
                {deleteConfirmId && createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                        <div className="bg-white/80 backdrop-blur-[24px] rounded-[32px] p-8 border border-white/50 shadow-2xl max-w-sm w-full mx-4">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center">
                                    <Trash2 className="w-5 h-5 text-red-500" />
                                </div>
                                <div>
                                    <p className="text-[14px] font-black text-[#2c3434]">Mover a eliminados</p>
                                    <p className="text-[11px] font-bold text-[#8b9ba5]">Podrás verla en el filtro "Eliminados"</p>
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

                {/* Dashboard-level SKU Legend Slide-over drawer */}
                {showDashboardLegend && createPortal(
                    <div className="fixed inset-0 z-[1500] flex justify-end bg-black/20 backdrop-blur-[3px] animate-backdrop">
                        <div className="w-96 bg-white shadow-2xl flex flex-col h-full animate-premium-slide-in p-6 relative border-l border-slate-100" style={{ fontFamily: "'Manrope', sans-serif" }}>
                            <div className="flex justify-between items-center mb-6 shrink-0 border-b border-slate-100 pb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-[#366480]/10 flex items-center justify-center">
                                        <span className="material-icons-round text-lg text-[#366480]">list_alt</span>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                                            Leyenda de SKU Cortos
                                        </h4>
                                        <p className="text-[10px] font-bold text-[#8b9ba5] uppercase tracking-widest">Catálogo de Productos</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowDashboardLegend(false)}
                                    className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex items-center justify-center transition-all font-bold text-xs"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="overflow-y-auto space-y-3.5 flex-1 pr-1 custom-scrollbar">
                                {allCatalogProducts.filter(p => p.sku_corto).map(p => (
                                    <div key={p.id} className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl hover:border-[#366480] hover:bg-[#eef4f7]/40 transition-all flex flex-col gap-2 shadow-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="px-2.5 py-0.5 bg-[#366480]/10 border border-[#366480]/20 rounded-md text-[10px] font-black text-[#366480] font-mono tracking-wider">
                                                {p.sku_corto}
                                            </span>
                                        </div>
                                        <p className="text-xs font-black text-[#2c3434] leading-snug">
                                            {p.base_name}{p.presentation ? ` ${p.presentation}` : ''}
                                        </p>
                                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase pt-0.5 border-t border-slate-200/40">
                                            <span>Marca: {p.brand || '—'}</span>
                                            <span>{p.unit || 'UND'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </>
    );
}
