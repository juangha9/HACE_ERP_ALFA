
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { Project } from '../services/types';

interface Props {
    isOpen: boolean;
    project: Project;
    mode: 'dates' | 'status' | 'observations';
    onClose: () => void;
    onSuccess: () => void;
}

export function EditProjectModal({ isOpen, project, mode, onClose, onSuccess }: Props) {
    const [formData, setFormData] = useState({
        start_date_planned: '',
        end_date_planned: '',
        start_date_real: '',
        end_date_real: '',
        status: 'INICIO' as Project['status'],
        observations: ''
    });
    const [loading, setLoading] = useState(false);

    // Logic: Disable status change if delivery is in the past
    // Calculated outside early return to satisfy Rules of Hooks
    const isPastDelivery = useMemo(() => {
        if (!formData.end_date_real) return false;

        // GMT-5 Comparison
        const now = new Date();
        const peruDateStr = now.toLocaleString("en-US", { timeZone: "America/Lima" });
        const peruDate = new Date(peruDateStr);
        peruDate.setHours(0, 0, 0, 0);

        const deliveryDate = new Date(formData.end_date_real);
        deliveryDate.setHours(0, 0, 0, 0);

        return deliveryDate <= peruDate;
    }, [formData.end_date_real]);

    useEffect(() => {
        if (isOpen && project) {
            setFormData({
                start_date_planned: project.start_date_planned?.split('T')[0] || '',
                end_date_planned: project.end_date_planned?.split('T')[0] || '',
                start_date_real: project.start_date_real?.split('T')[0] || '',
                end_date_real: project.end_date_real?.split('T')[0] || '',
                status: project.status || 'INICIO',
                observations: project.observations || ''
            });
        }
    }, [isOpen, project]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Get Current Date in GMT-5
            const now = new Date();
            const peruDateStr = now.toLocaleString("en-US", { timeZone: "America/Lima" });
            const peruDate = new Date(peruDateStr);
            peruDate.setHours(0, 0, 0, 0);

            let finalStatus = formData.status;

            // Automatic Status Logic (Always runs regardless of mode)
            if (formData.end_date_real) {
                const deliveryDate = new Date(formData.end_date_real);
                deliveryDate.setHours(0, 0, 0, 0);

                if (deliveryDate <= peruDate) {
                    // Logic: If delivery is today or past -> Final logic based on balance
                    if (project.amount_pending <= 0) {
                        finalStatus = 'FINALIZADO';
                    } else {
                        finalStatus = 'PENDIENTE_COBRO';
                    }
                } else {
                    // Delivery in the future -> Revert to EN_EJECUCION if it was a final status
                    if (finalStatus === 'FINALIZADO' || finalStatus === 'PENDIENTE_COBRO') {
                        finalStatus = 'EN_EJECUCION';
                    }
                }
            } else {
                // No delivery date -> Revert to EN_EJECUCION if it was a final status
                if (finalStatus === 'FINALIZADO' || finalStatus === 'PENDIENTE_COBRO') {
                    finalStatus = 'EN_EJECUCION';
                }
            }

            // Sanitize dates: convert empty strings to null for PostgreSQL
            const sanitizedData = {
                start_date_planned: formData.start_date_planned || null,
                end_date_planned: formData.end_date_planned || null,
                start_date_real: formData.start_date_real || null,
                end_date_real: formData.end_date_real || null,
                status: finalStatus,
                observations: formData.observations
            };

            await api.updateProject(project.id, sanitizedData);
            onSuccess();
            onClose();
        } catch (err) {
            alert('Error updating project: ' + (err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const titles = {
        dates: 'Gestión de Tiempos',
        status: 'Actualizar Estado del Proyecto',
        observations: 'Editar Observaciones'
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
            <div
                className={`modal-content ${mode === 'observations' ? '!max-w-2xl' : '!max-w-md'} bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100`}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase italic whitespace-nowrap overflow-hidden text-ellipsis mr-4">
                        {titles[mode]}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 shrink-0">
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {mode === 'dates' && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-50 pb-2">Planificación Original</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="form-group">
                                        <label>Inicio Planificado</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={formData.start_date_planned}
                                            onChange={e => setFormData({ ...formData, start_date_planned: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Entrega Planificada</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={formData.end_date_planned}
                                            onChange={e => setFormData({ ...formData, end_date_planned: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-50 pb-2">Ejecución Real</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="form-group">
                                        <label>Inicio Real</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={formData.start_date_real}
                                            onChange={e => setFormData({ ...formData, start_date_real: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Entrega Real</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={formData.end_date_real}
                                            onChange={e => setFormData({ ...formData, end_date_real: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {mode === 'status' && (
                        <div className="form-group">
                            <label className="flex items-center justify-between mb-2">
                                <span>Cambiar Estado Manualmente</span>
                                <span className="text-[9px] font-bold text-slate-400 italic">Los estados finales son automáticos</span>
                            </label>
                            <select
                                disabled={isPastDelivery}
                                className={`form-input bg-slate-50 border-transparent font-black text-indigo-600 text-lg py-4 ${isPastDelivery ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value as Project['status'] })}
                            >
                                <option value="INICIO">INICIO PROYECTO</option>
                                <option value="EN_EJECUCION">EN PRODUCCIÓN / EJECUCIÓN</option>
                                <option value="CERRADO">CERRADO</option>
                            </select>
                            {isPastDelivery ? (
                                <div className="space-y-4 mt-4">
                                    {project.amount_pending > 0 ? (
                                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                                            <p className="text-[10px] text-rose-600 font-black leading-relaxed flex items-center gap-2 uppercase tracking-tight">
                                                <span className="material-icons-round text-sm">warning</span>
                                                Atención: Proyecto con Saldo Pendiente
                                            </p>
                                            <p className="text-[10px] text-rose-500 mt-1 font-medium">
                                                La fecha de entrega ya pasó, pero el sistema detecta un saldo de <b>S/ {project.amount_pending.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</b> por cobrar.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                                            <p className="text-[10px] text-emerald-600 font-black leading-relaxed flex items-center gap-2 uppercase tracking-tight">
                                                <span className="material-icons-round text-sm">check_circle</span>
                                                Proyecto Liquidado con Éxito
                                            </p>
                                            <p className="text-[10px] text-emerald-500 mt-1 font-medium">
                                                La entrega se realizó y el saldo es cero. El proyecto está en estado <b>FINALIZADO</b>.
                                            </p>
                                        </div>
                                    )}
                                    <p className="text-[9px] text-slate-400 italic">
                                        * No se puede editar el estado manualmente mientras la entrega esté registrada. El sistema gestiona el ciclo de vida automáticamente basado en el saldo.
                                    </p>
                                </div>
                            ) : (
                                <p className="mt-4 text-[10px] text-slate-400 leading-relaxed italic">
                                    * Nota: Si ingresas una "Fecha de Entrega Real" y el saldo es cero, el sistema cambiará el estado a "Finalizado" automáticamente.
                                </p>
                            )}
                        </div>
                    )}

                    {mode === 'observations' && (
                        <div className="form-group">
                            <label>Bitácora / Notas Técnicas</label>
                            <textarea
                                className="form-input min-h-[350px] resize-none text-sm leading-relaxed"
                                placeholder="Ingresa aquí los detalles técnicos, novedades o incidencias relevantes del proyecto..."
                                value={formData.observations}
                                onChange={e => setFormData({ ...formData, observations: e.target.value })}
                            />
                        </div>
                    )}

                    <div className="pt-6 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-3.5 bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-slate-100 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-6 py-3.5 bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
