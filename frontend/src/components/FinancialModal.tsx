import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useScrollLock } from '../hooks/useScrollLock';
import type { Project, Collection } from '../services/types';

interface Props {
    isOpen: boolean;
    project: Project;
    onClose: () => void;
    onSuccess: () => void;
}

export function FinancialModal({ isOpen, project, onClose, onSuccess }: Props) {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    useScrollLock(isOpen);

    // Helper to get local date string YYYY-MM-DD
    const getLocalDate = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // Form state for new collection
    const [formData, setFormData] = useState({
        date: getLocalDate(),
        description: '',
        account: '2049' as Collection['account'],
        amount: ''
    });

    useEffect(() => {
        if (isOpen && project) {
            loadCollections();
        }
    }, [isOpen, project]);

    const loadCollections = async () => {
        try {
            const data = await api.getCollections(project.id);
            setCollections(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.saveCollections([{
                ...formData,
                project_id: project.id,
                amount: parseFloat(formData.amount)
            }]);
            setIsAdding(false);
            setFormData({
                date: getLocalDate(),
                description: '',
                account: '2049',
                amount: ''
            });
            loadCollections();
            onSuccess(); // Refresh project totals in parent
        } catch (err) {
            alert('Error al guardar cobranza: ' + (err as Error).message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar este registro financiero?')) return;
        try {
            await api.deleteCollection(id);
            loadCollections();
            onSuccess();
        } catch (err) {
            alert('Error al eliminar');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={onClose}>
            <div
                className="modal-content !max-w-4xl bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm">
                            <span className="material-icons-round text-2xl">account_balance</span>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic">Registro Bancario / Financiero</h2>
                            <p className="text-slate-400 dark:text-slate-500 text-xs font-bold tracking-widest uppercase mt-0.5">Control de Cobranzas e Ingresos</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* LEFT: Summary & Add Form */}
                    <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 text-center">Resumen de Cobros</p>
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Presupuesto</span>
                                    <span className="text-sm font-black text-slate-900 dark:text-white">S/ {project.budget_total?.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Total Cobrado</span>
                                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">S/ {project.amount_collected?.toLocaleString()}</span>
                                </div>
                                {(() => {
                                    const pendingBalance = (project.budget_total || 0) - (project.amount_collected || 0);
                                    return (
                                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-end">
                                            <span className={`text-[10px] font-bold uppercase tracking-tighter ${pendingBalance < 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                {pendingBalance < 0 ? 'Sobrante' : 'Por Cobrar'}
                                            </span>
                                            <span className={`text-xl font-black font-mono italic ${pendingBalance < 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                S/ {pendingBalance < 0 ? '+' : ''}{Math.abs(pendingBalance).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {!isAdding ? (
                            <button
                                onClick={() => setIsAdding(true)}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-icons-round text-lg">add</span>
                                Registrar Cobranza
                            </button>
                        ) : (
                            <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-6 rounded-3xl border-2 border-indigo-100 dark:border-indigo-900 shadow-xl space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                <h3 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase mb-4">Nuevo Ingreso</h3>
                                <div className="form-group">
                                    <label className="text-slate-600 dark:text-slate-400">Fecha</label>
                                    <input
                                        type="date" required className="form-input text-xs bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white"
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="text-slate-600 dark:text-slate-400">Descripción</label>
                                    <input
                                        required className="form-input text-xs bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500" placeholder="Ej: Abono 50% Adelanto"
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="text-slate-600 dark:text-slate-400">Cuenta</label>
                                    <select
                                        className="form-input text-xs font-bold bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white"
                                        value={formData.account}
                                        onChange={e => setFormData({ ...formData, account: e.target.value as Collection['account'] })}
                                    >
                                        <option value="2049">2049</option>
                                        <option value="8059">8059</option>
                                        <option value="9001">9001</option>
                                        <option value="4071">4071</option>
                                        <option value="EFECTIVO">EFECTIVO</option>
                                        <option value="YAPE">YAPE</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="text-slate-600 dark:text-slate-400">Monto (S/)</label>
                                    <input
                                        type="number" step="0.01" required className="form-input text-lg font-black text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600"
                                        value={formData.amount}
                                        onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                    />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button
                                        type="button" onClick={() => setIsAdding(false)}
                                        className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100"
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>

                    {/* RIGHT: Ledger Table */}
                    <div className="lg:col-span-2">
                        <div className="bg-slate-50/50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden min-h-[400px]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-900 text-white">
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic">Fecha</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic">Descripción</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic">Cuenta</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic text-right">Monto</th>
                                        <th className="px-6 py-4 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {loading ? (
                                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">Cargando transacciones...</td></tr>
                                    ) : collections.length === 0 ? (
                                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No hay registros financieros para este proyecto.</td></tr>
                                    ) : (
                                        collections.map(item => (
                                            <tr key={item.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group">
                                                <td className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                                                    {new Date(item.date + 'T00:00:00').toLocaleDateString('es-PE')}
                                                </td>
                                                <td className="px-6 py-4 text-xs font-black text-slate-800 dark:text-slate-200">
                                                    {item.description}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-3 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-[10px] font-black text-slate-600 dark:text-slate-300 shadow-sm">
                                                        {item.account}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm font-black text-emerald-600 dark:text-emerald-400 text-right font-mono">
                                                    S/ {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleDelete(item.id)}
                                                        className="p-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                                    >
                                                        <span className="material-icons-round text-sm">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
