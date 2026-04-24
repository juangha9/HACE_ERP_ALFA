import React, { useState } from 'react';

interface Item {
    id: string;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    category: 'MATERIAL' | 'CONSUMIBLE';
}

interface StepMaterialsProps {
    items: Item[];
    setItems: (items: Item[]) => void;
    onNext: () => void;
    onPrev: () => void;
}

export function StepMaterials({ items, setItems, onNext, onPrev }: StepMaterialsProps) {
    const [newItem, setNewItem] = useState<Partial<Item>>({
        description: '',
        unit: 'UND',
        quantity: 1,
        unitPrice: 0,
        category: 'MATERIAL'
    });

    const addItem = () => {
        if (!newItem.description) return;
        setItems([...items, { ...newItem, id: crypto.randomUUID() } as Item]);
        setNewItem({ description: '', unit: 'UND', quantity: 1, unitPrice: 0, category: 'MATERIAL' });
    };

    const removeItem = (id: string) => {
        setItems(items.filter(i => i.id !== id));
    };

    const totalMaterials = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="size-16 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
                    <span className="material-symbols-outlined">inventory_2</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Selección de Materiales</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Agrega los insumos y materiales necesarios para la ejecución del proyecto.</p>
            </div>

            {/* Add Item Form */}
            <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Descripción</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#463acb]/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            placeholder="Ej. Tablero Melamina 18mm"
                            value={newItem.description}
                            onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                        />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Unidad</label>
                        <select
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#463acb]/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            value={newItem.unit}
                            onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                        >
                            <option value="UND">UND</option>
                            <option value="M">M</option>
                            <option value="M2">M2</option>
                            <option value="GLB">GLB</option>
                        </select>
                    </div>
                    <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Cant.</label>
                        <input
                            type="number"
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#463acb]/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            value={newItem.quantity}
                            onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                        />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">P. Unit</label>
                        <input
                            type="number"
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#463acb]/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            value={newItem.unitPrice}
                            onChange={(e) => setNewItem({ ...newItem, unitPrice: Number(e.target.value) })}
                        />
                    </div>
                    <div className="md:col-span-1">
                        <button
                            onClick={addItem}
                            className="size-10 flex items-center justify-center bg-[#463acb] text-white rounded-xl hover:bg-[#372da0] transition-colors shadow-lg shadow-indigo-500/20"
                        >
                            <span className="material-symbols-outlined">add</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Items List */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-bold uppercase text-xs">
                        <tr>
                            <th className="px-6 py-4">Descripción</th>
                            <th className="px-6 py-4 text-center">Unidad</th>
                            <th className="px-6 py-4 text-center">Cantidad</th>
                            <th className="px-6 py-4 text-right">P. Unit</th>
                            <th className="px-6 py-4 text-right">Total</th>
                            <th className="px-6 py-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-slate-400 dark:text-slate-500 italic">
                                    No hay materiales agregados
                                </td>
                            </tr>
                        ) : (
                            items.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                    <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-200">{item.description}</td>
                                    <td className="px-6 py-4 text-center text-slate-500 dark:text-slate-400">{item.unit}</td>
                                    <td className="px-6 py-4 text-center font-bold dark:text-slate-300">{item.quantity}</td>
                                    <td className="px-6 py-4 text-right dark:text-slate-300">S/ {item.unitPrice.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">S/ {(item.quantity * item.unitPrice).toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => removeItem(item.id)}
                                            className="text-rose-400 hover:text-rose-600 transition-colors"
                                        >
                                            <span className="material-symbols-outlined">delete</span>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800">
                        <tr>
                            <td colSpan={4} className="px-6 py-4 text-right font-bold text-slate-500 dark:text-slate-400 uppercase">Total Materiales</td>
                            <td className="px-6 py-4 text-right font-black text-xl text-slate-900 dark:text-white">S/ {totalMaterials.toFixed(2)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
