import { useState, useEffect } from 'react';
import Modal from '../Modal';
import { API_URL } from '../../services/apiConfig';

/* Database Interfaces */
interface MachineryWearItem {
    id: string; // UUID
    name: string;
    type: 'MACHINERY' | 'CONSUMABLE';
    cost_per_unit: number;
    lifespan_hours?: number; // Only for CONSUMABLE
}

export function MachineryWearCard() {
    // State for Machinery Items
    const [machinery, setMachinery] = useState<any[]>([]);
    const [consumables, setConsumables] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch Data on Mount
    useEffect(() => {
        fetch(`${API_URL}/machinery-wear`)
            .then(res => res.json())
            .then((data: MachineryWearItem[]) => {
                const machines = data.filter(d => d.type === 'MACHINERY').map(m => ({
                    id: m.id,
                    name: m.name,
                    cost: Number(m.cost_per_unit)
                }));

                const cons = data.filter(d => d.type === 'CONSUMABLE').map(c => ({
                    id: c.id,
                    name: c.name,
                    life: `${c.lifespan_hours || 0} h`,
                    cost: Number(c.cost_per_unit),
                    lifespan_hours: c.lifespan_hours // Keep raw value
                }));

                setMachinery(machines);
                setConsumables(cons);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load machinery", err);
                setLoading(false);
            });
    }, []);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Temp state for editing
    const [tempMachinery, setTempMachinery] = useState<any[]>([]);
    const [tempConsumables, setTempConsumables] = useState<any[]>([]);
    const [deletedIds, setDeletedIds] = useState<string[]>([]); // Track deletions

    const handleOpenModal = () => {
        setTempMachinery([...machinery]);
        setTempConsumables([...consumables]);
        setDeletedIds([]);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // 1. Handle Deletions
            for (const id of deletedIds) {
                // Check if it's a UUID (existing item) or temp ID (new item not saved yet).
                // If it's a number (temp ID from Date.now() logic below), we don't need to delete from backend.
                if (typeof id === 'string' && id.length > 20) {
                    await fetch(`${API_URL}/machinery-wear?id=${id}`, { method: 'DELETE' });
                }
            }

            // 2. Prepare Upserts
            const machineryUpserts = tempMachinery.map(m => ({
                id: (typeof m.id === 'string' && m.id.length > 20) ? m.id : crypto.randomUUID(),
                name: m.name,
                type: 'MACHINERY',
                cost_per_unit: m.cost,
            }));

            const consumableUpserts = tempConsumables.map(c => ({
                id: (typeof c.id === 'string' && c.id.length > 20) ? c.id : crypto.randomUUID(),
                name: c.name,
                type: 'CONSUMABLE',
                cost_per_unit: c.cost,
                lifespan_hours: parseFloat(c.life?.replace(' h', '') || '0')
            }));

            // 3. Send Upserts
            const allUpserts = [...machineryUpserts, ...consumableUpserts];
            if (allUpserts.length > 0) {
                const response = await fetch(`${API_URL}/machinery-wear`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(allUpserts)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error("Backend Error Machinery:", errorText);
                    throw new Error(`Failed to save machinery: ${errorText}`);
                }
            }

            // 4. Refresh State
            // Instead of reloading, we should ideally fetch again or just trust the local state + upsert response
            // For now, let's just close modal and let the user see if it persists on manual refresh,
            // or we could trigger a re-fetch.
            handleCloseModal();
            window.location.reload();

        } catch (err) {
            console.error("Error saving machinery", err);
            alert("Error al guardar cambios.");
        } finally {
            setIsSaving(false);
        }
    };

    // Temp Handlers - Modified to use string IDs for new items to distinguish
    const addTempMachinery = () => {
        const newId = `temp-${Date.now()}`;
        setTempMachinery([...tempMachinery, { id: newId, name: 'Nueva Maquinaria', cost: 0 }]);
    };
    const removeTempMachinery = (id: string) => {
        setDeletedIds(prev => [...prev, id]);
        setTempMachinery(tempMachinery.filter(m => m.id !== id));
    };
    const updateTempMachinery = (id: string, field: 'name' | 'cost', value: string | number) => {
        setTempMachinery(tempMachinery.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    const addTempConsumable = () => {
        const newId = `temp-${Date.now()}`;
        setTempConsumables([...tempConsumables, { id: newId, name: 'Nuevo Insumo', life: '0 h', cost: 0 }]);
    };
    const removeTempConsumable = (id: string) => {
        setDeletedIds(prev => [...prev, id]);
        setTempConsumables(tempConsumables.filter(c => c.id !== id));
    };
    const updateTempConsumable = (id: string, field: 'name' | 'life' | 'cost', value: string | number) => {
        setTempConsumables(tempConsumables.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    return (
        <>
            {/* SUMMARY CARD */}
            <div
                onClick={handleOpenModal}
                className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 cursor-pointer group hover:border-purple-200 hover:scale-[1.01] transition-all h-full flex flex-col justify-center"
            >
                <div className="flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-3xl">settings_suggest</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase group-hover:text-purple-700 transition-colors">Desgaste Maquinaria</h3>
                            <div className="flex gap-3 mt-1">
                                <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">
                                    {machinery.length} Máquinas
                                </span>
                                <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">
                                    {consumables.length} Insumos
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-purple-50 group-hover:text-purple-600 transition-colors">
                        <span className="material-symbols-outlined">edit</span>
                    </div>
                </div>
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={handleCloseModal}>
                <div className="w-[1000px] max-w-full">
                    <div className="mb-8">
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase italic flex items-center gap-2">
                            <span className="material-symbols-outlined text-purple-600">settings_suggest</span>
                            Configuración de Desgaste
                        </h2>
                        <p className="text-sm font-bold text-slate-400 mt-1">
                            Administra los costos operativos de maquinaria y vida útil de consumibles críticos.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
                        {/* Machinery Column */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Maquinaria (Costo x Hora)</h3>
                                <button
                                    onClick={addTempMachinery}
                                    className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 hover:bg-purple-600 hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">add</span>
                                </button>
                            </div>
                            <div className="bg-slate-50/50 rounded-2xl overflow-hidden border border-slate-100 max-h-[400px] overflow-y-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                        <tr>
                                            <th className="text-left py-3 px-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Maquinaria</th>
                                            <th className="text-right py-3 px-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Costo Uso (H)</th>
                                            <th className="w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {tempMachinery.map(m => (
                                            <tr key={m.id} className="hover:bg-white transition-colors group">
                                                <td className="py-2 px-5">
                                                    <input
                                                        type="text"
                                                        value={m.name}
                                                        onChange={(e) => updateTempMachinery(m.id, 'name', e.target.value)}
                                                        className="w-full bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 p-0"
                                                    />
                                                </td>
                                                <td className="py-2 px-5 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <span className="text-xs font-bold text-slate-400">S/</span>
                                                        <input
                                                            type="number"
                                                            value={m.cost}
                                                            onChange={(e) => updateTempMachinery(m.id, 'cost', parseFloat(e.target.value))}
                                                            className="w-20 bg-transparent border-none text-right font-black text-purple-600 text-sm focus:ring-0 p-0"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="py-2 px-5 text-center">
                                                    <button
                                                        onClick={() => removeTempMachinery(m.id)}
                                                        className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Consumables Column */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Insumos Críticos (Cuchillas)</h3>
                                <button
                                    onClick={addTempConsumable}
                                    className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 hover:bg-purple-600 hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">add</span>
                                </button>
                            </div>
                            <div className="bg-slate-50/50 rounded-2xl overflow-hidden border border-slate-100 max-h-[400px] overflow-y-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                        <tr>
                                            <th className="text-left py-3 px-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Insumo</th>
                                            <th className="text-left py-3 px-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Vida Útil</th>
                                            <th className="text-right py-3 px-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Costo</th>
                                            <th className="w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {tempConsumables.map(c => (
                                            <tr key={c.id} className="hover:bg-white transition-colors group">
                                                <td className="py-2 px-5">
                                                    <input
                                                        type="text"
                                                        value={c.name}
                                                        onChange={(e) => updateTempConsumable(c.id, 'name', e.target.value)}
                                                        className="w-full bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 p-0"
                                                    />
                                                </td>
                                                <td className="py-2 px-5">
                                                    <input
                                                        type="text"
                                                        value={c.life}
                                                        onChange={(e) => updateTempConsumable(c.id, 'life', e.target.value)}
                                                        className="w-full bg-transparent border-none text-sm font-medium text-slate-500 focus:ring-0 p-0"
                                                    />
                                                </td>
                                                <td className="py-2 px-5 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <span className="text-xs font-bold text-slate-400">S/</span>
                                                        <input
                                                            type="number"
                                                            value={c.cost}
                                                            onChange={(e) => updateTempConsumable(c.id, 'cost', parseFloat(e.target.value))}
                                                            className="w-20 bg-transparent border-none text-right font-black text-purple-600 text-sm focus:ring-0 p-0"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="py-2 px-5 text-center">
                                                    <button
                                                        onClick={() => removeTempConsumable(c.id)}
                                                        className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                        <button
                            onClick={handleCloseModal}
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`px-6 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold shadow-lg shadow-purple-200 hover:bg-purple-700 hover:shadow-purple-300 transition-all transform hover:-translate-y-0.5 ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">{isSaving ? 'sync' : 'save'}</span>
                                <span>{isSaving ? 'Guardando...' : 'Guardar Cambios'}</span>
                            </div>
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
