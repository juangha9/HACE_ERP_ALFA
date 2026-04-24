import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { InventoryLocation } from '../../services/types';

export default function InventoryLocations() {
    const [locations, setLocations] = useState<InventoryLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<InventoryLocation>>({ name: '', description: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const data = await api.getInventoryLocations();
            setLocations(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.saveInventoryLocation(formData);
            await loadData();
            setIsModalOpen(false);
            setFormData({ name: '', description: '' });
        } catch (error) {
            alert('Error al guardar ubicación');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar ubicación? Si hay productos asignados, quedarán sin ubicación.')) return;
        try {
            await api.deleteInventoryLocation(id);
            loadData();
        } catch (e) {
            alert('Error al eliminar');
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Ubicaciones</h2>
                    <p className="text-slate-500 text-sm font-medium">Mapa físico del almacén (Estantes, Niveles)</p>
                </div>
                <button
                    onClick={() => { setFormData({}); setIsModalOpen(true); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
                >
                    <span className="material-symbols-outlined text-lg">add_location_alt</span>
                    Nueva Ubicación
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {locations.map(loc => (
                    <div key={loc.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative">
                        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setFormData(loc); setIsModalOpen(true); }} className="p-1 hover:bg-slate-100 rounded text-indigo-600">
                                <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                            <button onClick={() => handleDelete(loc.id)} className="p-1 hover:bg-slate-100 rounded text-rose-600">
                                <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                        </div>
                        <div className="size-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
                            <span className="material-symbols-outlined">shelves</span>
                        </div>
                        <h3 className="font-bold text-lg text-slate-900">{loc.name}</h3>
                        <p className="text-slate-500 text-sm mt-1">{loc.description || 'Sin descripción'}</p>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95">
                        <h3 className="text-lg font-black text-slate-900 mb-4 uppercase tracking-tight">
                            {formData.id ? 'Editar Ubicación' : 'Nueva Ubicación'}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre (Ej: Estante A-2)</label>
                                <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                                    value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descripción</label>
                                <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" rows={3}
                                    value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                            </div>
                            <div className="pt-2 flex gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-xl hover:bg-slate-200">Cancelar</button>
                                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
