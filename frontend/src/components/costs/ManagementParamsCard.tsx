import { useState, useEffect } from 'react';
import Modal from '../Modal';
import { API_URL } from '../../services/apiConfig';

export function ManagementParamsCard() {
    const [params, setParams] = useState({
        adminExpenses: 15,
        utility: 25,
        contingency: 5,
        igv: 18
    });
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingParams, setEditingParams] = useState(params);

    useEffect(() => {
        fetch(`${API_URL}/management-parameters`)
            .then(res => res.json())
            .then(data => {
                if (data && data.id) {
                    setParams({
                        adminExpenses: Number(data.admin_expenses_percentage),
                        utility: Number(data.desired_utility_percentage),
                        contingency: Number(data.contingency_percentage),
                        igv: Number(data.igv_percentage)
                    });
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load management params", err);
                setLoading(false);
            });
    }, []);

    const handleOpenModal = () => {
        setEditingParams({ ...params });
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleSave = async () => {
        // Validation for IGV change
        if (editingParams.igv !== params.igv) {
            const confirmed = window.confirm('¿Estás seguro que desea cambiar el porcentaje del IGV?');
            if (!confirmed) return;
        }

        try {
            const response = await fetch(`${API_URL}/management-parameters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    admin_expenses_percentage: editingParams.adminExpenses,
                    desired_utility_percentage: editingParams.utility,
                    contingency_percentage: editingParams.contingency,
                    igv_percentage: editingParams.igv
                })
            });

            if (!response.ok) throw new Error('Failed to save');

            setParams(editingParams);
            handleCloseModal();
        } catch (err) {
            console.error("Failed to save params", err);
            alert("Error al guardar los cambios.");
        }
    };

    return (
        <>
            {/* UNIFIED SUMMARY CARD */}
            <div
                onClick={handleOpenModal}
                className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 cursor-pointer group hover:border-indigo-200 hover:scale-[1.01] transition-all h-full flex flex-col justify-center"
            >
                <div className="flex items-center justify-between mb-6 pointer-events-none">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-3xl">monitoring</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase group-hover:text-indigo-700 transition-colors">Márgenes y Gestión</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                                4 Parámetros Financieros
                            </p>
                        </div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                        <span className="material-symbols-outlined">edit</span>
                    </div>
                </div>

                {/* Mini Grid of Parameters inside the Card */}
                {/* Summary only - details hidden as per user request */}
                <div className="mt-2 pl-3 border-l-4 border-indigo-100">
                    <p className="text-sm font-bold text-slate-500">Configuración global de gastos y utilidades</p>
                    <p className="text-xs text-slate-400 mt-1">Clic para visualizar y editar porcentajes</p>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={handleCloseModal}>
                <div className="w-full">
                    <div className="mb-6">
                        <h2 className="text-xl font-black text-slate-800">Editar Márgenes y Gestión</h2>
                        <p className="text-sm text-slate-400">Define los porcentajes globales para el cálculo de presupuestos.</p>
                    </div>

                    <div className="space-y-6">
                        <ParamInput
                            label="Gastos Administrativos"
                            value={editingParams.adminExpenses}
                            onChange={(v) => setEditingParams(p => ({ ...p, adminExpenses: v }))}
                            unit="%"
                        />
                        <ParamInput
                            label="Utilidad Deseada"
                            value={editingParams.utility}
                            onChange={(v) => setEditingParams(p => ({ ...p, utility: v }))}
                            unit="%"
                        />
                        <ParamInput
                            label="Contingencia / Imprevistos"
                            value={editingParams.contingency}
                            onChange={(v) => setEditingParams(p => ({ ...p, contingency: v }))}
                            unit="%"
                        />
                        <div className="pt-4 border-t border-slate-50">
                            <ParamInput
                                label="Impuesto General (IGV)"
                                value={editingParams.igv}
                                onChange={(v) => setEditingParams(p => ({ ...p, igv: v }))}
                                unit="%"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-50">
                        <button
                            onClick={handleCloseModal}
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

function ParamInput({ label, value, onChange, unit, disabled = false }: { label: string, value: number, onChange: (val: number) => void, unit: string, disabled?: boolean }) {
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-baseline px-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
                <span className="text-[10px] font-bold text-slate-300">{unit}</span>
            </div>
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                disabled={disabled}
                className={`w-full bg-slate-50 border-none rounded-2xl px-5 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
        </div>
    );
}
