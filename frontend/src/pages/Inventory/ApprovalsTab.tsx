import { useState, useEffect } from 'react';
import { api } from '../../services/api';

export default function ApprovalsTab() {
    const [activeCategory, setActiveCategory] = useState<'mermas' | 'material'>('mermas');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionSuccess, setActionSuccess] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ id: string, action: 'approve' | 'reject' | 'purchase' } | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    // History View state
    const [view, setView] = useState<'pending' | 'history'>('pending');

    useEffect(() => {
        loadData();
    }, [view, activeCategory]);

    const loadData = async () => {
        try {
            setLoading(true);
            let data = [];
            if (activeCategory === 'mermas') {
                data = view === 'pending' ? await api.getPendingMermas() : await api.getAllMermas();
            } else {
                const allReqs = await api.getMaterialRequests();
                data = view === 'pending'
                    ? allReqs.filter((r: any) => r.status === 'PENDIENTE')
                    : allReqs;
            }
            setItems(data);
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (id: string, action: 'approve' | 'reject' | 'purchase') => {
        if (action === 'reject' && !rejectionReason.trim()) {
            setActionError('Debe ingresar un motivo de rechazo.');
            return;
        }

        setActionError(null);
        setActionSuccess(null);
        try {
            if (activeCategory === 'mermas') {
                await api.approveMermaRequest(id, action === 'approve', action === 'reject' ? rejectionReason : undefined);
            } else {
                const statusMap: Record<string, any> = {
                    approve: 'APROBADO',
                    reject: 'PENDIENTE', // For material requests, we might not have a hard reject yet, or just leave it pending
                    purchase: 'SOLICITAR_COMPRA'
                };
                await api.updateMaterialRequestStatus(id, statusMap[action]);
            }

            setActionSuccess(`Solicitud procesada exitosamente`);
            setConfirmDialog(null);
            setRejectionReason('');
            loadData();
            setTimeout(() => setActionSuccess(null), 3000);
        } catch (error: any) {
            setActionError(error.message || 'Error procesando solicitud');
            setConfirmDialog(null);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Cargando solicitudes...</div>;
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 shadow-sm relative">

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
                <div>
                    <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tight text-xl mb-1">Centro de Aprobaciones</h3>
                    <p className="text-slate-500 text-sm font-medium">Gestiona mermas y pedidos de material para producción</p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mr-4">
                        <button
                            onClick={() => setActiveCategory('mermas')}
                            className={`px-4 py-2 font-bold text-xs uppercase tracking-widest rounded-lg transition-all ${activeCategory === 'mermas' ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm' : 'text-slate-500'}`}
                        >
                            Mermas / Bajas
                        </button>
                        <button
                            onClick={() => setActiveCategory('material')}
                            className={`px-4 py-2 font-bold text-xs uppercase tracking-widest rounded-lg transition-all ${activeCategory === 'material' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'}`}
                        >
                            Material Optimización
                        </button>
                    </div>

                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <button
                            onClick={() => setView('pending')}
                            className={`px-4 py-2 font-bold text-xs uppercase tracking-widest rounded-lg transition-all ${view === 'pending' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500'}`}
                        >
                            Pendientes
                        </button>
                        <button
                            onClick={() => setView('history')}
                            className={`px-4 py-2 font-bold text-xs uppercase tracking-widest rounded-lg transition-all ${view === 'history' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500'}`}
                        >
                            Historial
                        </button>
                    </div>
                </div>
            </div>

            {actionError && (
                <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 rounded-2xl text-sm flex items-start gap-3">
                    <span className="material-symbols-outlined text-lg">error</span>
                    <p>{actionError}</p>
                </div>
            )}
            {actionSuccess && (
                <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-2xl text-sm flex items-start gap-3 animate-pulse">
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    <p>{actionSuccess}</p>
                </div>
            )}

            {items.length === 0 ? (
                <div className="text-center p-16 bg-slate-50 dark:bg-slate-800/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400">
                    <span className="material-symbols-outlined text-5xl mb-4 opacity-20">inventory_2</span>
                    <p className="font-bold">No hay solicitudes en esta sección</p>
                    <p className="text-sm">Todo está al día por el momento.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {items.map(item => (
                        <div key={item.id} className="p-5 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:border-slate-300 dark:hover:border-slate-600">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded ${item.status === 'PENDIENTE' || item.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                                        item.status === 'APPROVED' || item.status === 'APROBADO' ? 'bg-emerald-100 text-emerald-700' :
                                            'bg-rose-100 text-rose-700'
                                        }`}>
                                        {item.status.replace('_', ' ')}
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium">{new Date(item.created_at).toLocaleString()}</span>
                                </div>

                                <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    {activeCategory === 'mermas' ? item.catalog_products?.base_name : item.catalog_products?.name}
                                    <span className="px-3 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-black font-mono rounded-lg border border-slate-200 dark:border-slate-700">
                                        {item.catalog_products?.sku || 'SIN SKU'}
                                    </span>
                                </h4>

                                <div className="mt-2 space-y-1">
                                    {activeCategory === 'mermas' ? (
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                            <strong className="text-slate-900 dark:text-white">Motivo:</strong> {item.reason_type}
                                            {item.reason && <span className="block italic mt-0.5 text-xs text-slate-500">"{item.reason}"</span>}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                            <strong className="text-slate-900 dark:text-white">Proyecto:</strong> {item.projects?.name || 'Venta Directa'}
                                        </p>
                                    )}
                                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">
                                        Petición: {item.quantity} Unidades
                                    </p>
                                </div>

                                {item.rejection_reason && (
                                    <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/20 p-2 rounded-lg mt-2 inline-block border border-rose-100 dark:border-rose-800">
                                        <strong>Motivo de Rechazo:</strong> {item.rejection_reason}
                                    </p>
                                )}
                            </div>

                            {view === 'pending' && (
                                <div className="flex gap-2 shrink-0">
                                    {activeCategory === 'material' && (
                                        <button
                                            onClick={() => setConfirmDialog({ id: item.id, action: 'purchase' })}
                                            className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition-colors shadow-sm text-xs"
                                        >
                                            Pedir Compra
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setConfirmDialog({ id: item.id, action: 'reject' })}
                                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm text-xs"
                                    >
                                        Rechazar
                                    </button>
                                    <button
                                        onClick={() => setConfirmDialog({ id: item.id, action: 'approve' })}
                                        className="px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 shadow-md shadow-emerald-200 dark:shadow-none transition-all flex items-center gap-1 text-xs"
                                    >
                                        <span className="material-symbols-outlined text-sm">check</span>
                                        Aprobar
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Confirm Dialog */}
            {confirmDialog && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
                        <div className="text-center mb-6">
                            <span className={`material-symbols-outlined text-5xl mb-4 ${confirmDialog.action === 'approve' ? 'text-emerald-500' :
                                confirmDialog.action === 'purchase' ? 'text-indigo-500' : 'text-rose-500'
                                }`}>
                                {confirmDialog.action === 'approve' ? 'check_circle' :
                                    confirmDialog.action === 'purchase' ? 'shopping_cart' : 'cancel'}
                            </span>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                {confirmDialog.action === 'approve' ? '¿Aprobar Solicitud?' :
                                    confirmDialog.action === 'purchase' ? '¿Solicitar Compra?' : '¿Rechazar Solicitud?'}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                                {confirmDialog.action === 'approve' ? 'El material se descontará del inventario real.' :
                                    confirmDialog.action === 'purchase' ? 'Se notificará al área de compras para reposición.' : 'La solicitud será marcada como rechazada.'}
                            </p>

                            {confirmDialog.action === 'reject' && (
                                <div className="mt-4 text-left">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Motivo de Rechazo *</label>
                                    <textarea
                                        className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-sm"
                                        rows={3}
                                        placeholder="Ej: Material no disponible o error en medidas..."
                                        value={rejectionReason}
                                        onChange={e => setRejectionReason(e.target.value)}
                                        required
                                    />
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmDialog(null)}
                                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleAction(confirmDialog.id, confirmDialog.action)}
                                className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg transition-all ${confirmDialog.action === 'approve' ? 'bg-emerald-500 hover:bg-emerald-600' :
                                    confirmDialog.action === 'purchase' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-500 hover:bg-rose-600'
                                    }`}
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

