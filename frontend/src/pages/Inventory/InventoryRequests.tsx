import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { InventoryProduct } from '../../services/types';

export default function InventoryRequests() {
    const [products, setProducts] = useState<InventoryProduct[]>([]);
    const [myRequests, setMyRequests] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionSuccess, setActionSuccess] = useState<string | null>(null);

    // Filters for history
    const [filterDate, setFilterDate] = useState('');
    const [filterReason, setFilterReason] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    // Form State
    const [formData, setFormData] = useState<{
        product_id: string;
        quantity: number | '';
        reason_type: string;
        reason: string;
    }>({
        product_id: '',
        quantity: '',
        reason_type: '',
        reason: ''
    });

    const MERMA_REASONS = [
        "Daño por Manipulación",
        "Daño por Transporte",
        "Humedad / Deterioro",
        "Error de Fabricación",
        "Vencimiento",
        "Error de Corte/Proceso",
        "Siniestro",
        "Otros"
    ];

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const prods = await api.getInventoryProducts();
            setProducts(prods);
            const reqs = await api.getMyMermas();
            setMyRequests(reqs);
        } catch (e) {
            console.error(e);
        }
    };

    const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (['e', 'E', '+', '-', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionError(null);
        setActionSuccess(null);
        try {
            if (!formData.product_id) throw new Error("Debe seleccionar un producto");
            if (!formData.reason_type) throw new Error("Debe seleccionar un motivo principal");
            if (!formData.quantity || Number(formData.quantity) <= 0) throw new Error("Debe ingresar una cantidad válida");

            const isOthers = formData.reason_type === 'Otros';
            if (isOthers && !formData.reason.trim()) {
                throw new Error("Debe especificar la explicación cuando selecciona 'Otros'");
            }

            await api.createMermaRequest({
                product_id: formData.product_id,
                quantity: Number(formData.quantity),
                reason_type: formData.reason_type,
                reason: formData.reason.trim() || undefined,
                status: 'PENDING'
            });

            setActionSuccess('Solicitud de merma enviada para su aprobación.');
            setFormData({ product_id: '', quantity: '', reason_type: '', reason: '' });
            setTimeout(() => {
                setIsModalOpen(false);
                setActionSuccess(null);
            }, 2000);
        } catch (error: any) {
            setActionError(error.message || 'Error al guardar solicitud de merma');
        }
    };

    const filtered = products.filter(p =>
        p.stock_current > 0 &&
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const filteredRequests = myRequests.filter(req => {
        const matchesDate = !filterDate || new Date(req.created_at).toISOString().split('T')[0] === filterDate;
        const matchesReason = !filterReason || req.reason.toLowerCase().includes(filterReason.toLowerCase());
        const matchesStatus = !filterStatus || req.status === filterStatus;
        return matchesDate && matchesReason && matchesStatus;
    });

    const getStatusText = (status: string) => {
        switch (status) {
            case 'APPROVED': return 'Aprobado';
            case 'REJECTED': return 'Rechazado';
            default: return 'Pendiente';
        }
    };

    const getStatusClasses = (status: string) => {
        switch (status) {
            case 'APPROVED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'REJECTED': return 'bg-rose-100 text-rose-700 border-rose-200';
            default: return 'bg-amber-100 text-amber-700 border-amber-200';
        }
    };

    const selectedProductDetail = products.find(p => p.id === formData.product_id);

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Solicitudes de Almacén</h2>
                    <p className="text-slate-500 text-sm font-medium">Reportar mermas y ajustes de inventario</p>
                </div>
                <button
                    onClick={() => { setFormData({ product_id: '', quantity: '', reason_type: '', reason: '' }); setIsModalOpen(true); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all"
                >
                    <span className="material-symbols-outlined text-lg">warning</span>
                    Reportar Merma
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 border border-slate-200 p-4 rounded-2xl mb-6">
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Filtrar por Fecha</label>
                    <input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Motivo</label>
                    <input type="text" placeholder="Buscar en motivo..." className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={filterReason} onChange={e => setFilterReason(e.target.value)} />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Estado</label>
                    <select className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="">Todos</option>
                        <option value="PENDING">Pendientes</option>
                        <option value="APPROVED">Aprobados</option>
                        <option value="REJECTED">Rechazados</option>
                    </select>
                </div>
            </div>

            {filteredRequests.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-8 text-center text-slate-500">
                    <span className="material-symbols-outlined text-6xl text-slate-200 mb-4 block">assignment</span>
                    <p>Las solicitudes realizadas aparecerán aquí o serán gestionadas por el administrador.</p>
                    <p className="text-sm mt-2">Usa el botón "Reportar Merma" para notificar inventario dañado o perdido.</p>
                </div>
            ) : (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Producto</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Cantidad</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Motivo / Rechazo</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredRequests.map((req: any) => (
                                <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-bold text-slate-900">{req.catalog_products?.base_name || 'Desconocido'}</div>
                                        <div className="text-xs text-slate-500 font-mono">{req.catalog_products?.sku || 'SIN SKU'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-mono font-bold text-rose-600">{req.quantity}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-xs text-slate-600 max-w-[200px] truncate">
                                            <strong className="block text-slate-900">{req.reason_type}</strong>
                                            {req.reason && <span className="text-slate-500" title={req.reason}>{req.reason}</span>}
                                        </div>
                                        {req.status === 'REJECTED' && req.rejection_reason && (
                                            <div className="text-xs text-rose-600 bg-rose-50 p-1.5 rounded mt-1 border border-rose-100 line-clamp-2" title={req.rejection_reason}>
                                                <strong>Rechazo:</strong> {req.rejection_reason}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        {new Date(req.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${getStatusClasses(req.status)}`}>
                                            {getStatusText(req.status)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal de Merma */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <span className="material-symbols-outlined text-rose-500">warning</span>
                                Reportar Merma
                            </h3>
                            <button onClick={() => { setIsModalOpen(false); setActionError(null); setActionSuccess(null); }} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {actionError && (
                            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-sm flex items-start gap-3">
                                <span className="material-symbols-outlined">error</span>
                                <p>{actionError}</p>
                            </div>
                        )}
                        {actionSuccess && (
                            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-sm flex items-start gap-3 animate-pulse">
                                <span className="material-symbols-outlined">check_circle</span>
                                <p>{actionSuccess}</p>
                            </div>
                        )}

                        <form onSubmit={handleSave} className="space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Buscar Producto</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                                        <input
                                            type="text"
                                            placeholder="Filtrar productos..."
                                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Seleccionar Producto *</label>
                                    <select
                                        required
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                                        value={formData.product_id}
                                        onChange={e => setFormData({ ...formData, product_id: e.target.value })}
                                    >
                                        <option value="" disabled hidden>Seleccione de la lista...</option>
                                        {filtered.map(p => (
                                            <option key={p.id} value={p.id}>
                                                [{p.sku || 'SIN SKU'}] {p.name} - Stock Actual: {p.stock_current} {p.unit}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {selectedProductDetail && (
                                <div className="grid grid-cols-2 gap-4 bg-rose-50 p-4 rounded-xl border border-rose-100">
                                    <div>
                                        <label className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Cantidad a dar de baja *</label>
                                        <input
                                            type="number"
                                            required
                                            min="0.01"
                                            step="0.01"
                                            max={selectedProductDetail.stock_current}
                                            className="w-full p-3 bg-white border border-rose-200 rounded-xl text-sm font-bold text-rose-700 mt-1 focus:ring-2 focus:ring-rose-500"
                                            value={formData.quantity}
                                            onKeyDown={handleNumberKeyDown}
                                            onWheel={(e) => e.currentTarget.blur()}
                                            onChange={e => setFormData({ ...formData, quantity: e.target.value === '' ? '' : Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="flex flex-col justify-end">
                                        <div className="text-right">
                                            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest block">Unidad</span>
                                            <span className="text-lg font-black text-rose-700">{selectedProductDetail.unit}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Motivo Principal *</label>
                                <select
                                    required
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm"
                                    value={formData.reason_type}
                                    onChange={e => setFormData({ ...formData, reason_type: e.target.value })}
                                >
                                    <option value="" disabled>Seleccione un motivo...</option>
                                    {MERMA_REASONS.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                    Explicación Adicional {formData.reason_type === 'Otros' && <span className="text-rose-500">*</span>}
                                </label>
                                <textarea
                                    required={formData.reason_type === 'Otros'}
                                    rows={3}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:bg-white"
                                    placeholder={formData.reason_type === 'Otros' ? "Especifique el motivo detalladamente..." : "Opcional. Añada más detalles si lo considera necesario..."}
                                    value={formData.reason}
                                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                />
                            </div>

                            <div className="pt-4 flex gap-3 border-t border-slate-100">
                                <button type="button" onClick={() => { setIsModalOpen(false); setActionError(null); setActionSuccess(null); }} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                                <button type="submit" className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-sm">send</span>
                                    Solicitar Aprobación
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
