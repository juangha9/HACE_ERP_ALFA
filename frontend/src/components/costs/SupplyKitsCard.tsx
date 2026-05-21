import { useState, useEffect } from 'react';
import Modal from '../Modal';
import { API_URL } from '../../services/apiConfig';

interface SupplyItem {
    id: string;
    baseName: string;
    specificMaterial: string;
    quantity: number;
    unit: string;
    unitPrice: number;
}

interface Kit {
    id: string; // UUID from DB
    name: string;
    description: string;
    icon: string;
    items: SupplyItem[];
}

export function SupplyKitsCard() {
    const [kits, setKits] = useState<Kit[]>([]);
    const [loading, setLoading] = useState(true);

    const [viewMode, setViewMode] = useState<'LIST' | 'EDIT'>('LIST');

    // Fetch Kits on Mount
    useEffect(() => {
        fetch(`${API_URL}/supply-kits`)
            .then(res => res.json())
            .then(data => {
                // Transform DB data if needed
                // DB returns: id, name, description, items (jsonb), icon
                const loadedKits = data.map((k: any) => ({
                    id: k.id,
                    name: k.name,
                    description: k.description,
                    icon: k.icon || 'inventory_2',
                    items: k.items || []
                }));
                setKits(loadedKits);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load kits", err);
                setLoading(false);
            });
    }, []);


    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedKit, setSelectedKit] = useState<Kit | null>(null);
    const [editingItems, setEditingItems] = useState<SupplyItem[]>([]);

    const handleOpenMainModal = () => {
        setViewMode('LIST');
        setIsModalOpen(true);
    };

    const handleEditKit = (kit: Kit) => {
        setSelectedKit(kit);
        setEditingItems(JSON.parse(JSON.stringify(kit.items)));
        setViewMode('EDIT');
    };

    const handleBackToList = () => {
        setViewMode('LIST');
        setSelectedKit(null);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedKit(null);
        setViewMode('LIST');
    };

    const [isSaving, setIsSaving] = useState(false);

    const handleCreateKit = () => {
        const newKit: Kit = {
            id: 'temp-' + Date.now(),
            name: 'NUEVO KIT',
            description: 'Descripción del nuevo kit',
            icon: 'inventory_2',
            items: []
        };
        setSelectedKit(newKit);
        setEditingItems([]);
        setViewMode('EDIT');
    };

    const handleSaveChanges = async () => {
        if (!selectedKit) return;

        setIsSaving(true);
        try {
            // Backend Update
            const response = await fetch(`${API_URL}/supply-kits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedKit.id.startsWith('temp-') ? undefined : selectedKit.id,
                    name: selectedKit.name,
                    description: selectedKit.description,
                    icon: selectedKit.icon,
                    items: editingItems,
                    total_base_cost: calculateTotal(editingItems)
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Backend Error Details:", errorText);
                throw new Error(`Failed to save kit: ${errorText}`);
            }

            // Get the saved kit from response (with real ID)
            const savedKit = await response.json();

            // Update state
            setKits(prev => {
                const existingIndex = prev.findIndex(k => k.id === savedKit.id || k.id === selectedKit.id); // check both new ID and temp ID
                if (existingIndex >= 0) {
                    // Update existing
                    const newKits = [...prev];
                    newKits[existingIndex] = {
                        id: savedKit.id,
                        name: savedKit.name,
                        description: savedKit.description, // Ensure description is updated
                        icon: savedKit.icon || 'inventory_2',
                        items: savedKit.items || []
                    };
                    return newKits;
                } else {
                    // Start fresh or append
                    return [...prev, {
                        id: savedKit.id,
                        name: savedKit.name,
                        description: savedKit.description,
                        icon: savedKit.icon || 'inventory_2',
                        items: savedKit.items || []
                    }];
                }
            });

            handleBackToList();
        } catch (err) {
            console.error("Error saving kit", err);
            alert("Error al guardar el kit.");
        } finally {
            setIsSaving(false);
        }
    };

    const calculateTotal = (items: SupplyItem[]) => {
        return items.reduce((sum, item) => {
            const qty = Number.isNaN(item.quantity) ? 0 : item.quantity;
            const price = Number.isNaN(item.unitPrice) ? 0 : item.unitPrice;
            return sum + (qty * price);
        }, 0);
    };

    const addItem = () => {
        const newItem: SupplyItem = {
            id: Date.now().toString(),
            baseName: 'Nuevo Insumo',
            specificMaterial: '',
            quantity: 1,
            unit: 'Unids',
            unitPrice: 0
        };
        setEditingItems([...editingItems, newItem]);
    };

    const updateItem = (id: string, field: keyof SupplyItem, value: any) => {
        setEditingItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const removeItem = (id: string) => {
        setEditingItems(prev => prev.filter(item => item.id !== id));
    };
    return (
        <>
            {/* SUMMARY CARD (Dashboard Widget) */}
            <div
                onClick={handleOpenMainModal}
                className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 cursor-pointer group hover:border-indigo-200 hover:scale-[1.01] transition-all"
            >
                <div className="flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-3xl">inventory_2</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase group-hover:text-indigo-700 transition-colors">Kits de Insumos</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                                {kits.length} Kits Configurados
                            </p>
                        </div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                        <span className="material-symbols-outlined">edit</span>
                    </div>
                </div>
            </div>

            {/* MAIN MODAL */}
            <Modal isOpen={isModalOpen} onClose={handleCloseModal}>
                <div className="w-[900px] max-w-full">
                    {/* MODAL HEADER */}
                    <div className="mb-8 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase italic flex items-center gap-3">
                                {viewMode === 'EDIT' && (
                                    <button onClick={handleBackToList} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                                    </button>
                                )}
                                {viewMode === 'LIST' ? 'Gestión de Kits Automáticos' : `Editando: ${selectedKit?.name}`}
                            </h2>
                            <p className="text-sm font-bold text-slate-400 mt-1 ml-1">
                                {viewMode === 'LIST'
                                    ? 'Selecciona un kit para editar sus materiales y costos base.'
                                    : 'Modifica los insumos, cantidades y precios unitarios.'}
                            </p>
                        </div>
                    </div>

                    {/* VIEW: LIST OF KITS */}
                    {viewMode === 'LIST' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex justify-end mb-4">
                                <button
                                    onClick={handleCreateKit}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
                                >
                                    <span className="material-symbols-outlined text-lg">add</span>
                                    Crear Nuevo Kit
                                </button>
                            </div>

                            {kits.length === 0 ? (
                                <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                    <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">inventory_2</span>
                                    <p className="text-slate-500 font-medium">No hay kits configurados.</p>
                                    <p className="text-sm text-slate-400">Crea uno nuevo para comenzar.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {kits.map(kit => {
                                        const total = calculateTotal(kit.items);
                                        return (
                                            <div
                                                key={kit.id}
                                                onClick={() => handleEditKit(kit)}
                                                className="border border-slate-100 rounded-3xl p-6 hover:shadow-xl hover:shadow-indigo-500/10 hover:border-indigo-500/30 transition-all group/card relative bg-white cursor-pointer"
                                            >
                                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover/card:bg-indigo-600 group-hover/card:text-white transition-colors mb-4">
                                                    <span className="material-symbols-outlined text-2xl">{kit.icon}</span>
                                                </div>
                                                <h3 className="font-black text-slate-800 text-sm uppercase tracking-tight mb-2 group-hover/card:text-indigo-700 transition-colors">{kit.name}</h3>
                                                <p className="text-xs text-slate-400 mb-6 font-medium leading-relaxed min-h-[40px] line-clamp-2">{kit.description}</p>

                                                <div className="flex items-end justify-between border-t border-slate-50 pt-4">
                                                    <span className="text-[10px] font-bold text-slate-400">Total Base</span>
                                                    <span className="font-black text-lg text-slate-800">S/ {total.toFixed(2)}</span>
                                                </div>

                                                <div className="absolute top-4 right-4 opacity-0 group-hover/card:opacity-100 transition-opacity">
                                                    <span className="material-symbols-outlined text-indigo-400">edit_note</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* VIEW: EDIT KIT */}
                    {viewMode === 'EDIT' && selectedKit && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            {/* Kit Metadata Inputs */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nombre del Kit</label>
                                    <input
                                        type="text"
                                        value={selectedKit.name}
                                        onChange={(e) => setSelectedKit({ ...selectedKit, name: e.target.value })}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Descripción</label>
                                    <input
                                        type="text"
                                        value={selectedKit.description}
                                        onChange={(e) => setSelectedKit({ ...selectedKit, description: e.target.value })}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-600 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Listado de Insumos</h3>
                                <button onClick={addItem} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                                    <span className="material-symbols-outlined text-sm">add_circle</span>
                                    <span className="text-xs font-bold">Añadir Item</span>
                                </button>
                            </div>

                            <div className="bg-slate-50 rounded-2xl overflow-hidden border border-slate-200/60 mb-6 shadow-sm">
                                <table className="w-full">
                                    <thead className="bg-slate-100/50 border-b border-slate-200">
                                        <tr>
                                            <th className="text-left py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Insumo Base</th>
                                            <th className="text-left py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Material Específico</th>
                                            <th className="text-center py-3 px-2 text-[10px] font-black text-slate-500 uppercase tracking-wider w-16">Cant.</th>
                                            <th className="text-center py-3 px-2 text-[10px] font-black text-slate-500 uppercase tracking-wider w-20">U.M.</th>
                                            <th className="text-right py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">P. Unit</th>
                                            <th className="text-right py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Total</th>
                                            <th className="w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200/60">
                                        {editingItems.map(item => (
                                            <tr key={item.id} className="hover:bg-white transition-colors group/row">
                                                <td className="p-2 pl-4">
                                                    <input
                                                        type="text"
                                                        value={item.baseName}
                                                        onChange={(e) => updateItem(item.id, 'baseName', e.target.value)}
                                                        className="w-full bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 p-0 placeholder:font-normal"
                                                        placeholder="Nombre..."
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <input
                                                        type="text"
                                                        value={item.specificMaterial}
                                                        onChange={(e) => updateItem(item.id, 'specificMaterial', e.target.value)}
                                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-indigo-400 outline-none transition-all shadow-sm"
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <input
                                                        type="number"
                                                        value={item.quantity || ''}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value);
                                                            updateItem(item.id, 'quantity', isNaN(val) ? 0 : val);
                                                        }}
                                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center text-xs font-bold text-slate-700 focus:border-indigo-400 outline-none transition-all shadow-sm"
                                                    />
                                                </td>
                                                <td className="p-2 text-center">
                                                    <span className="inline-block px-2 py-1 bg-slate-200/50 rounded text-[10px] font-bold text-slate-500">{item.unit}</span>
                                                </td>
                                                <td className="p-2 text-right">
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">S/</span>
                                                        <input
                                                            type="number"
                                                            value={item.unitPrice || ''}
                                                            onChange={(e) => {
                                                                const val = parseFloat(e.target.value);
                                                                updateItem(item.id, 'unitPrice', isNaN(val) ? 0 : val);
                                                            }}
                                                            className="w-24 bg-white border border-slate-200 rounded-lg pl-6 pr-3 py-1.5 text-right text-xs font-bold text-slate-700 focus:border-indigo-400 outline-none transition-all shadow-sm"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-2 pr-4 text-right">
                                                    <span className="font-black text-slate-800 text-sm">S/ {(item.quantity * item.unitPrice).toFixed(2)}</span>
                                                </td>
                                                <td className="p-2 text-center">
                                                    <button onClick={() => removeItem(item.id)} className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors opacity-0 group-hover/row:opacity-100">
                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100">
                                <button
                                    onClick={handleBackToList}
                                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveChanges}
                                    disabled={isSaving}
                                    className={`px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-indigo-300 transition-all transform hover:-translate-y-0.5 active:translate-y-0 ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-lg">{isSaving ? 'sync' : 'save'}</span>
                                        <span>{isSaving ? 'Guardando...' : 'Guardar Cambios'}</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </Modal>
        </>
    );
}


