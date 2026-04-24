
import React, { useState } from 'react';
import { api } from '../services/api';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function CreateProjectModal({ isOpen, onClose, onSuccess }: Props) {
    const [formData, setFormData] = useState({
        project_number: '',
        name: '',
        client_name: '',
        budget_total: '',
        start_date_planned: new Date().toISOString().split('T')[0],
        end_date_planned: ''
    });
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.createProject({
                ...formData,
                budget_total: parseFloat(formData.budget_total) || 0,
                amount_collected: 0,
                amount_pending: 0
            });
            onSuccess();
            onClose();
        } catch (err) {
            alert('Error al crear proyecto: ' + (err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Nueva Orden de Producción</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>N° Orden / Proyecto</label>
                        <input
                            required
                            className="form-input"
                            placeholder="Ej: 1028"
                            value={formData.project_number}
                            onChange={e => setFormData({ ...formData, project_number: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label>Nombre del Proyecto</label>
                        <input
                            required
                            className="form-input"
                            placeholder="Ej: Estructuras Metálicas"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label>Cliente</label>
                        <input
                            required
                            className="form-input"
                            placeholder="Ej: Metal-Corp S.A."
                            value={formData.client_name}
                            onChange={e => setFormData({ ...formData, client_name: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-group">
                            <label>Presupuesto (S/)</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                className="form-input"
                                placeholder="0.00"
                                value={formData.budget_total}
                                onChange={e => setFormData({ ...formData, budget_total: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Fecha Entrega</label>
                            <input
                                required
                                type="date"
                                className="form-input"
                                value={formData.end_date_planned}
                                onChange={e => setFormData({ ...formData, end_date_planned: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="flex gap-4 mt-8">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-primary hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                            style={{ backgroundColor: 'var(--primary)' }}
                        >
                            {loading ? 'Guardando...' : <>
                                <span className="material-symbols-outlined text-sm">save</span>
                                Guardar Orden
                            </>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
