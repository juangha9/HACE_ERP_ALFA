import React, { useEffect, useState } from 'react';
import type { OptimizationFlow } from '../../../services/types';
import { API_URL } from '../../../services/apiConfig';
import { useScrollLock } from '../../../hooks/useScrollLock';

interface OptimizationHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoadOptimization: (optimization: OptimizationFlow) => void;
    filterCode?: string;
}

const OptimizationHistoryModalComponent: React.FC<OptimizationHistoryModalProps> = ({ isOpen, onClose, onLoadOptimization, filterCode }) => {
    const [history, setHistory] = useState<OptimizationFlow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useScrollLock(isOpen);

    useEffect(() => {
        if (!isOpen) return;

        const fetchHistory = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${API_URL}/optimizations`);
                if (!res.ok) throw new Error('Error al cargar historial.');
                const data: OptimizationFlow[] = await res.json();
                
                // If filterCode is provided, only show related versions
                if (filterCode) {
                    const baseCode = filterCode.split('-V')[0];
                    setHistory(data.filter(opt => opt.code && opt.code.startsWith(baseCode)));
                } else {
                    setHistory(data);
                }
            } catch (err: any) {
                console.error(err);
                setError(err.message || 'Error de conexión');
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [isOpen]);

    if (!isOpen) return null;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'BORRADOR':
                return <span className="px-2 py-0.5 text-[10px] font-black tracking-wider bg-slate-100 text-slate-500 rounded-md">BORRADOR</span>;
            case 'PENDIENTE_PAGO':
                return <span className="px-2 py-0.5 text-[10px] font-black tracking-wider bg-amber-100 text-amber-700 rounded-md">PEND. PAGO</span>;
            case 'LISTO_CORTE':
                return <span className="px-2 py-0.5 text-[10px] font-black tracking-wider bg-emerald-100 text-emerald-700 rounded-md">LISTO CORTE</span>;
            default:
                return <span className="px-2 py-0.5 text-[10px] font-black tracking-wider bg-slate-100 text-slate-500 rounded-md">{status}</span>;
        }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/20" style={{ backdropFilter: 'blur(6px)' }}>
            <div className="bg-white/90 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-4xl border border-white/50 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 md:p-6 border-b border-slate-200/30 flex justify-between items-center rounded-t-2xl">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-icons-round text-indigo-500">history</span>
                        Historial de Optimizaciones
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-2">
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 md:p-6 overflow-y-auto flex-1">
                    {error && (
                        <div className="mb-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center p-12 text-slate-400">
                            <span className="material-icons-round animate-spin text-4xl mb-2">autorenew</span>
                            <p>Cargando historial...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center p-12 text-slate-500 dark:text-slate-400">
                            <span className="material-icons-round text-6xl mb-4 opacity-50">inbox</span>
                            <p className="text-lg font-bold">Sin optimizaciones</p>
                            <p className="text-sm">Aún no hay optimizaciones guardadas en el historial.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {history.map((opt) => (
                                <div key={opt.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all flex flex-col group">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900 dark:text-white leading-none">
                                                {opt.code ? opt.code.split('-V')[0] : 'Sin Código'}
                                            </span>
                                            {opt.data.version && (
                                                <span className="text-[10px] font-black text-emerald-500 mt-1 uppercase tracking-wider">Versión {opt.data.version}</span>
                                            )}
                                        </div>
                                        {getStatusBadge(opt.status)}
                                    </div>
                                    <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1 truncate" title={opt.data.projectName}>
                                        {opt.data.projectName}
                                    </h4>

                                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mb-4 flex-1">
                                        <p className="flex items-center gap-1">
                                            <span className="material-icons-round text-[14px]">storefront</span>
                                            {opt.origin_type === 'VENTA_DIRECTA' ? 'Venta Directa' : 'Proyecto'}
                                        </p>
                                        <p className="flex items-center gap-1">
                                            <span className="material-icons-round text-[14px]">calendar_today</span>
                                            {new Date(opt.created_at || '').toLocaleDateString()}
                                        </p>
                                        <p className="flex items-center gap-1">
                                            <span className="material-icons-round text-[14px]">layers</span>
                                            Tableros: {opt.data.stats?.boards || 0}
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => {
                                            onLoadOptimization(opt);
                                            onClose();
                                        }}
                                        className="w-full py-2 bg-slate-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-bold rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        Cargar Optimización
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const OptimizationHistoryModal = React.memo(OptimizationHistoryModalComponent);
