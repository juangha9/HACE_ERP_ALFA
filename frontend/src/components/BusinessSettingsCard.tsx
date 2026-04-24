import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { BusinessInfo } from '../services/types';
import Modal from './Modal';

export function BusinessSettingsCard() {
    const [info, setInfo] = useState<BusinessInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingInfo, setEditingInfo] = useState<Partial<BusinessInfo>>({});

    useEffect(() => {
        fetchInfo();
    }, []);

    const fetchInfo = async () => {
        try {
            const data = await api.getBusinessInfo();
            setInfo(data);
            setEditingInfo(data);
        } catch (error) {
            console.error("Error loading business info", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            await api.saveBusinessInfo(editingInfo);
            await fetchInfo();
            setIsModalOpen(false);
        } catch (error) {
            alert("Error al guardar la información");
        }
    };

    return (
        <>
            <div
                onClick={() => setIsModalOpen(true)}
                className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(6,11,40,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full cursor-pointer group"
            >
                <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 mb-6 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                    <span className="material-symbols-outlined text-2xl">business</span>
                </div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Datos de la Empresa</h3>
                <p className="text-sm text-slate-400 font-medium leading-relaxed mb-4">
                    Configura el nombre, RUC, dirección y otros datos que aparecerán en tus cotizaciones y documentos.
                </p>
                {info && (
                    <div className="pt-4 border-t border-slate-50 space-y-1">
                        <p className="text-xs font-bold text-slate-600 uppercase">{info.company_name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">RUC: {info.ruc}</p>
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                <div className="w-full">
                    <div className="mb-6 text-center">
                        <div className="size-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <span className="material-symbols-outlined text-2xl">store</span>
                        </div>
                        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Información de Negocio</h2>
                        <p className="text-sm text-slate-400 font-medium">Estos datos se usarán en el encabezado de las cotizaciones.</p>
                    </div>

                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Razón Social</label>
                            <input
                                type="text"
                                value={editingInfo.company_name || ''}
                                onChange={(e) => setEditingInfo({ ...editingInfo, company_name: e.target.value })}
                                className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                                placeholder="Ej: Avanza Melamina S.A.C."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">RUC / DOI</label>
                                <input
                                    type="text"
                                    value={editingInfo.ruc || ''}
                                    onChange={(e) => setEditingInfo({ ...editingInfo, ruc: e.target.value })}
                                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                                    placeholder="20XXXXXXXXX"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Teléfono</label>
                                <input
                                    type="text"
                                    value={editingInfo.phone || ''}
                                    onChange={(e) => setEditingInfo({ ...editingInfo, phone: e.target.value })}
                                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                                    placeholder="+51 987 654 321"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Dirección Fiscal</label>
                            <input
                                type="text"
                                value={editingInfo.address || ''}
                                onChange={(e) => setEditingInfo({ ...editingInfo, address: e.target.value })}
                                className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                                placeholder="Av. Los Pinos 123, Lima"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Email de Contacto</label>
                            <input
                                type="email"
                                value={editingInfo.email || ''}
                                onChange={(e) => setEditingInfo({ ...editingInfo, email: e.target.value })}
                                className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                                placeholder="ventas@empresa.com"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-50">
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-8 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold shadow-lg shadow-black/20 hover:bg-slate-800 transition-all"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
