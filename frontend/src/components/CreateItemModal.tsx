
import React, { useState, useMemo, useEffect } from 'react';
import { api } from '../services/api';
import type { ProjectItem } from '../services/types';

interface Props {
    isOpen: boolean;
    projectId: string;
    onClose: () => void;
    onSuccess: () => void;
}

type CategoryTab = 'MATERIAL' | 'MANO_OBRA' | 'MOVILIDAD';
type SubTab = 'PRINCIPAL' | 'ADICIONAL';
type ViewMode = 'BUDGET' | 'REAL';

const DEFAULT_ITEM = (projectId: string, category: ProjectItem['category']): Partial<ProjectItem> => ({
    project_id: projectId,
    category,
    description: '',
    unit: 'UND',
    planned_qty: 0,
    planned_unit_price: 0,
    real_qty: 0,
    real_unit_price: 0,
    origin: '',
    transaction_date: new Date().toISOString().split('T')[0],
    supplier: ''
});

const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['e', 'E', '+', '-', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
    }
};

const NumberInput = ({ value, onChange, disabled, className, placeholder }: any) => (
    <input
        type="number"
        step="any"
        disabled={disabled}
        className={`${className} appearance-none bg-transparent border-none focus:ring-0 p-0`}
        value={value === 0 ? '' : value}
        placeholder={placeholder || '0'}
        onKeyDown={handleNumberKeyDown}
        onWheel={(e) => e.currentTarget.blur()}
        onChange={e => {
            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
            onChange(val);
        }}
    />
);

export function CreateItemModal({ isOpen, projectId, onClose, onSuccess }: Props) {
    const [items, setItems] = useState<Partial<ProjectItem>[]>([]);
    const [deletedIds, setDeletedIds] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<CategoryTab>('MATERIAL');
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('PRINCIPAL');
    const [viewMode, setViewMode] = useState<ViewMode>('BUDGET');
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(false);

    useEffect(() => {
        if (isOpen && projectId) {
            loadExistingItems();
        } else {
            setItems([]);
            setDeletedIds([]);
        }
    }, [isOpen, projectId]);

    const loadExistingItems = async () => {
        setInitialLoading(true);
        try {
            const existing = await api.getItems(projectId);
            setItems(existing);
        } catch (err) {
            console.error('Error loading items:', err);
        } finally {
            setInitialLoading(false);
        }
    };

    const currentCategory = useMemo((): ProjectItem['category'] => {
        if (activeSubTab === 'PRINCIPAL') return activeTab;
        return `ADICIONAL_${activeTab}` as ProjectItem['category'];
    }, [activeTab, activeSubTab]);

    const visibleItemsWithIndex = useMemo(() => {
        return items.map((item, index) => ({ item, index })).filter(
            ({ item }) => item.category === currentCategory
        );
    }, [items, currentCategory]);

    const addRow = () => {
        const lastItemInCat = visibleItemsWithIndex[visibleItemsWithIndex.length - 1]?.item;
        if (lastItemInCat) {
            const hasDesc = (lastItemInCat.description || '').trim() !== '';
            const hasPlannedValue = (lastItemInCat.planned_unit_price || 0) > 0;
            const hasRealValue = (lastItemInCat.real_unit_price || 0) > 0;

            if (!hasDesc || (!hasPlannedValue && !hasRealValue)) {
                alert('Por favor complete la descripción y el monto del ítem actual antes de añadir uno nuevo.');
                return;
            }
        }
        setItems([...items, DEFAULT_ITEM(projectId, currentCategory)]);
    };

    const removeRow = (indexInItems: number) => {
        const itemToRemove = items[indexInItems];
        if (itemToRemove.id) {
            setDeletedIds([...deletedIds, itemToRemove.id]);
        }
        setItems(items.filter((_, i) => i !== indexInItems));
    };

    const updateItem = (indexInItems: number, field: keyof ProjectItem, value: any) => {
        const newItems = [...items];
        newItems[indexInItems] = { ...newItems[indexInItems], [field]: value };
        setItems(newItems);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        for (const it of items) {
            const isManoObraOrMovilidad = it.category?.includes('MANO_OBRA') || it.category?.includes('MOVILIDAD');
            const hasRealValue = (it.real_qty || (isManoObraOrMovilidad ? 1 : 0)) * (it.real_unit_price || 0) > 0;

            if (hasRealValue) {
                if (!it.origin || it.origin.trim() === '') {
                    alert(`El campo "ORIGEN" es obligatorio para el ítem con gasto real: ${it.description || 'Sin descripción'}`);
                    return;
                }
                if (isManoObraOrMovilidad && (!it.supplier || it.supplier.trim() === '')) {
                    alert(`El campo "PROVEEDOR" es obligatorio para el personal/movilidad con gasto real: ${it.description || 'Sin descripción'}`);
                    return;
                }
            }
        }

        setLoading(true);
        try {
            if (deletedIds.length > 0) await api.deleteItems(deletedIds);

            if (items.length > 0) {
                // BIMODAL SAVE LOGIC to 100% fix SQL constraint errors
                const newItemsToInsert: any[] = [];
                const existingItemsToUpdate: any[] = [];

                items.filter(it => it.description && it.description.trim() !== '').forEach(it => {
                    if (it.id && it.id.trim() !== '') {
                        existingItemsToUpdate.push(it);
                    } else {
                        const { id, ...newRecord } = it;
                        newItemsToInsert.push(newRecord);
                    }
                });

                // Execute sequentially but strictly separated
                if (newItemsToInsert.length > 0) {
                    await api.addItems(newItemsToInsert);
                }
                if (existingItemsToUpdate.length > 0) {
                    await api.addItems(existingItemsToUpdate);
                }
            }
            onSuccess();
            onClose();
        } catch (err) {
            alert('Error crítico de guardado: ' + (err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const tabs = [
        { id: 'MATERIAL', label: 'Materiales', icon: 'inventory_2' },
        { id: 'MANO_OBRA', label: 'Mano de Obra', icon: 'engineering' },
        { id: 'MOVILIDAD', label: 'Movilidad', icon: 'local_shipping' },
    ];

    const isLaborOrMobility = activeTab === 'MANO_OBRA' || activeTab === 'MOVILIDAD';

    return (
        <>
            <style>{`
        @keyframes subtle-pulse {
          0% { box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); border-color: rgba(16, 185, 129, 0.5); }
          50% { box-shadow: 0 0 25px rgba(16, 185, 129, 0.8); border-color: rgba(16, 185, 129, 1); }
          100% { box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); border-color: rgba(16, 185, 129, 0.5); }
        }
        .animate-pulse-halo {
          animation: subtle-pulse 2s infinite ease-in-out;
        }
      `}</style>

            <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={onClose}>
                <div
                    className="modal-content !max-w-7xl !p-0 overflow-hidden flex flex-col bg-white dark:bg-slate-900 transition-all duration-300 shadow-2xl border border-slate-200 dark:border-slate-800 h-[90vh]"
                    onClick={e => e.stopPropagation()}
                >
                    {/* STICKY HEADER AREA */}
                    <div className="flex flex-col bg-white dark:bg-slate-900 z-50 border-b border-slate-200 dark:border-slate-800 shrink-0">
                        <div className="px-8 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                                Gestión Masiva de Partidas <span className="text-indigo-600 dark:text-indigo-400 text-[10px] font-black border-2 border-indigo-100 dark:border-indigo-900/30 px-2.5 py-0.5 rounded-full uppercase">v1.14</span>
                            </h1>
                            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors">
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        <div className="px-8 py-4 flex flex-row items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-50 dark:border-slate-800">
                            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-fit">
                                {tabs.map(tab => {
                                    const isActive = activeTab === tab.id;
                                    const count = items.filter(it => it.category === tab.id || it.category === `ADICIONAL_${tab.id}`).length;
                                    return (
                                        <button key={tab.id} onClick={() => setActiveTab(tab.id as CategoryTab)} className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs transition-all duration-300 ${isActive ? 'bg-indigo-600 shadow-[0_4px_15px_rgba(79,70,229,0.3)] text-white font-black active:scale-95' : 'font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700'}`}>
                                            <span className="material-icons-round text-sm">{tab.icon}</span>{tab.label}
                                            <span className={`${isActive ? 'bg-white/30 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} px-2 py-0.5 rounded-md text-[10px] ml-1 font-black`}>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-fit">
                                <button onClick={() => setViewMode('BUDGET')} className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs transition-all duration-300 ${viewMode === 'BUDGET' ? 'bg-indigo-600 text-white shadow-[0_4px_15px_rgba(79,70,229,0.3)] font-black' : 'font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700'}`}>
                                    <span className="material-icons-round text-sm">payments</span>Vista Presupuesto
                                </button>
                                <button onClick={() => setViewMode('REAL')} className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs transition-all duration-300 ${viewMode === 'REAL' ? 'bg-indigo-600 text-white shadow-[0_4px_15px_rgba(79,70,229,0.3)] font-black' : 'font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700'}`}>
                                    <span className="material-icons-round text-sm">receipt_long</span>Vista Real (Gasto)
                                </button>
                            </div>
                        </div>

                        <div className="px-8 py-4 flex flex-row items-center justify-between bg-slate-50/80 dark:bg-slate-800/80">
                            <div className="flex gap-1.5 p-1 bg-white/50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-full h-fit">
                                <button onClick={() => setActiveSubTab('PRINCIPAL')} className={`px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'PRINCIPAL' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>Principal</button>
                                <button onClick={() => setActiveSubTab('ADICIONAL')} className={`px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'ADICIONAL' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>Adicionales Externos</button>
                            </div>
                            <div className="flex items-center gap-4">
                                <button onClick={onClose} className="px-6 py-2 text-xs font-black text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider">Cancelar</button>
                                <button type="button" onClick={addRow} className="flex items-center gap-2 px-8 py-3.5 border-2 border-slate-900 dark:border-slate-400 rounded-full text-xs font-black text-slate-900 dark:text-slate-200 hover:bg-slate-900 hover:text-white dark:hover:bg-slate-400 dark:hover:text-slate-900 transition-all shadow-xl shadow-slate-200 dark:shadow-none active:scale-95 group">
                                    <span className="material-symbols-outlined text-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-white/20 p-1 rounded-full transition-colors leading-none">add</span>Añadir {tabs.find(t => t.id === activeTab)?.label}
                                </button>
                                <button onClick={handleSubmit} disabled={loading} className="flex items-center gap-3 px-10 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl shadow-indigo-200 dark:shadow-indigo-900/20 transition-all active:scale-95 disabled:opacity-70 group">
                                    {loading ? (
                                        <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest">
                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></div>Sincronizando...
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3 text-white font-black text-xs uppercase tracking-widest">
                                            <span className="material-icons-round text-xl">cloud_upload</span>GUARDAR TODO ({items.length})
                                        </div>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* SCROLLABLE TABLE BODY */}
                    <div className="flex-1 overflow-y-auto px-8 py-6 bg-slate-50 dark:bg-slate-900/50 relative">
                        {initialLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                                <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-100 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-500"></div>
                                <p className="font-bold text-slate-600 dark:text-slate-400 tracking-tight">Cargando base de datos...</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-separate border-spacing-y-2">
                                <thead className="sticky top-[-25px] z-40 bg-slate-50 dark:bg-slate-900">
                                    <tr className="text-slate-400 dark:text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] px-4">
                                        {isLaborOrMobility ? (
                                            <>
                                                <th className="pb-3 pl-6 min-w-[150px]">Proveedor</th>
                                                <th className="pb-3">Descripción</th>
                                                <th className="pb-3 text-center">Fecha</th>
                                                <th className="pb-3 text-right pr-6">Monto Planif.</th>
                                                {viewMode === 'REAL' && (
                                                    <>
                                                        <th className="pb-3 text-right pr-6">Monto Real</th>
                                                        <th className="pb-3 pl-6">Origen</th>
                                                    </>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <th className="pb-3 pl-6">Descripción</th>
                                                <th className="pb-3 text-center">Unidad</th>
                                                <th className="pb-3 text-center">Cant. PPTO.</th>
                                                <th className="pb-3 text-right pr-6">P.U. PPTO.</th>
                                                {viewMode === 'REAL' && (
                                                    <>
                                                        <th className="pb-3 text-right pr-6">Tot. PPTO.</th>
                                                        <th className="pb-3 text-center">Cant. Real</th>
                                                        <th className="pb-3 text-right pr-6">P.U. Real</th>
                                                        <th className="pb-3 pl-6">Origen</th>
                                                    </>
                                                )}
                                            </>
                                        )}
                                        <th className="pb-3 pr-8 text-right font-black">{viewMode === 'BUDGET' ? 'Subtotal (S/)' : 'Total Real (S/)'}</th>
                                        <th className="pb-3 w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="pb-32">
                                    {visibleItemsWithIndex.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="py-28 text-center bg-white dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[2.5rem] shadow-inner shadow-slate-50 dark:shadow-none">
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                                                        <span className="material-icons-round text-5xl text-slate-200">post_add</span>
                                                    </div>
                                                    <h2 className="text-slate-600 font-black text-lg tracking-tight">Sección vacía</h2>
                                                    <p className="text-slate-400 text-sm max-w-xs mx-auto mb-4">Añade ítems para empezar la gestión masiva.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : visibleItemsWithIndex.map(({ item, index }) => {
                                        const plannedTotal = (item.planned_qty || (isLaborOrMobility ? 1 : 0)) * (item.planned_unit_price || 0);
                                        const realTotal = (item.real_qty || (isLaborOrMobility ? 1 : 0)) * (item.real_unit_price || 0);
                                        const displayTotal = viewMode === 'BUDGET' ? plannedTotal : realTotal;
                                        const isNewItem = !item.id;

                                        return (
                                            <tr key={index} className={`group transition-all duration-300 hover:translate-x-1 ${isNewItem ? 'animate-pulse-halo ring-2 ring-emerald-500/50 rounded-[1.25rem]' : ''}`}>
                                                {isLaborOrMobility ? (
                                                    <>
                                                        <td className={`bg-white dark:bg-slate-800 py-5 pl-6 rounded-l-[1.25rem] border-y border-l border-slate-100 dark:border-slate-700 shadow-sm ${isNewItem ? 'bg-emerald-50/30' : ''}`}>
                                                            <select className="w-full bg-slate-50 dark:bg-slate-900 rounded-lg px-2 py-1 border-none focus:ring-2 focus:ring-indigo-100 text-sm font-black text-indigo-900 dark:text-indigo-400 transition-all font-mono" value={item.supplier || ''} onChange={e => updateItem(index, 'supplier', e.target.value)}>
                                                                <option value="">Selección...</option>
                                                                <option value="PLANILLA">PLANILLA</option>
                                                                <option value="TERCEROS">TERCEROS</option>
                                                            </select>
                                                        </td>
                                                        <td className={`bg-white dark:bg-slate-800 py-5 border-y border-slate-100 dark:border-slate-700 shadow-sm ${isNewItem ? 'bg-emerald-50/30' : ''}`}>
                                                            <input type="text" className="w-full bg-transparent border-none focus:ring-0 text-sm p-0 font-bold text-slate-700 dark:text-slate-200 placeholder:text-slate-300" placeholder="Descripción de labor/movilidad..." value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} />
                                                        </td>
                                                        <td className={`bg-white dark:bg-slate-800 py-5 border-y border-slate-100 dark:border-slate-700 shadow-sm text-center ${isNewItem ? 'bg-emerald-50/30' : ''}`}>
                                                            <input type="date" className="bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded text-[10px] border-none focus:ring-0 text-slate-500 dark:text-slate-400 font-black" value={item.transaction_date?.split('T')[0]} onChange={e => updateItem(index, 'transaction_date', e.target.value)} />
                                                        </td>
                                                        <td className={`bg-white dark:bg-slate-800 py-5 border-y border-slate-100 dark:border-slate-700 shadow-sm text-right px-6 ${isNewItem ? 'bg-emerald-50/30' : ''}`}>
                                                            <NumberInput disabled={viewMode === 'REAL'} className={`w-28 text-right font-black ${viewMode === 'REAL' ? 'text-slate-200 dark:text-slate-600' : 'text-slate-900 dark:text-white border-b-2 border-slate-50 dark:border-slate-700'}`} value={item.planned_unit_price} onChange={(val: any) => updateItem(index, 'planned_unit_price', val)} />
                                                        </td>
                                                        {viewMode === 'REAL' && (
                                                            <>
                                                                <td className="bg-white py-5 border-y border-slate-100 shadow-sm text-right bg-rose-50/20 px-6">
                                                                    <NumberInput className="w-28 text-right text-rose-600 font-black border-b-2 border-rose-100" value={item.real_unit_price} onChange={(val: any) => updateItem(index, 'real_unit_price', val)} />
                                                                </td>
                                                                <td className="bg-white py-5 border-y border-slate-100 shadow-sm pl-6 bg-rose-50/20">
                                                                    <select className="w-full bg-white rounded-lg px-2 py-1 border-none focus:ring-2 focus:ring-rose-200 text-xs font-black text-rose-900 transition-all uppercase tracking-tighter" value={item.origin || ''} onChange={e => updateItem(index, 'origin', e.target.value)}>
                                                                        <option value="">Origen...</option>
                                                                        <option value="EFECTIVO">EFECTIVO</option>
                                                                        <option value="YAPE">YAPE</option>
                                                                        <option value="ALMACÉN">ALMACÉN</option>
                                                                        <option value="2049">Cta. 2049</option>
                                                                    </select>
                                                                </td>
                                                            </>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className={`bg-white dark:bg-slate-800 py-5 pl-6 rounded-l-[1.25rem] border-y border-l border-slate-100 dark:border-slate-700 shadow-sm ${isNewItem ? 'bg-emerald-50/30' : ''}`}>
                                                            <input type="text" className="w-full bg-transparent border-none focus:ring-0 text-sm font-black p-0 text-slate-800 dark:text-slate-200 placeholder:text-slate-300" placeholder="Nombre del material..." value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} />
                                                        </td>
                                                        <td className={`bg-white dark:bg-slate-800 py-5 border-y border-slate-100 dark:border-slate-700 shadow-sm text-center ${isNewItem ? 'bg-emerald-50/30' : ''}`}>
                                                            <input type="text" className="w-12 bg-slate-50 dark:bg-slate-900 rounded-md py-1 border-none focus:ring-0 text-[9px] text-center font-black tracking-widest text-slate-400 capitalize" value={item.unit} onChange={e => updateItem(index, 'unit', e.target.value)} />
                                                        </td>
                                                        <td className={`bg-white dark:bg-slate-800 py-5 border-y border-slate-100 dark:border-slate-700 shadow-sm text-center ${isNewItem ? 'bg-emerald-50/30' : ''}`}>
                                                            <NumberInput disabled={viewMode === 'REAL'} className={`w-16 text-center font-black ${viewMode === 'REAL' ? 'text-slate-200 dark:text-slate-600' : 'text-slate-900 dark:text-white'}`} value={item.planned_qty} onChange={(val: any) => updateItem(index, 'planned_qty', val)} />
                                                        </td>
                                                        <td className={`bg-white dark:bg-slate-800 py-5 border-y border-slate-100 dark:border-slate-700 shadow-sm text-right px-6 ${isNewItem ? 'bg-emerald-50/30' : ''}`}>
                                                            <NumberInput disabled={viewMode === 'REAL'} className={`w-28 text-right font-black ${viewMode === 'REAL' ? 'text-slate-200 dark:text-slate-600' : 'text-slate-900 dark:text-white border-b-2 border-slate-50 dark:border-slate-700'}`} value={item.planned_unit_price} onChange={(val: any) => updateItem(index, 'planned_unit_price', val)} />
                                                        </td>
                                                        {viewMode === 'REAL' && (
                                                            <>
                                                                <td className="bg-white dark:bg-slate-800 py-5 border-y border-slate-100 dark:border-slate-700 shadow-sm text-right px-4 text-[10px] font-black text-slate-300 dark:text-slate-600 tabular-nums">
                                                                    {plannedTotal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                                                </td>
                                                                <td className="bg-white dark:bg-slate-800 py-5 border-y border-slate-100 dark:border-slate-700 shadow-sm text-center bg-rose-50/20 dark:bg-rose-900/10">
                                                                    <NumberInput className="w-16 text-center text-rose-600 dark:text-rose-400 font-black" value={item.real_qty} onChange={(val: any) => updateItem(index, 'real_qty', val)} />
                                                                </td>
                                                                <td className="bg-white dark:bg-slate-800 py-5 border-y border-slate-100 dark:border-slate-700 shadow-sm text-right bg-rose-50/20 dark:bg-rose-900/10 px-6">
                                                                    <NumberInput className="w-28 text-right text-rose-600 dark:text-rose-400 font-black border-b-2 border-rose-100 dark:border-rose-900/30" value={item.real_unit_price} onChange={(val: any) => updateItem(index, 'real_unit_price', val)} />
                                                                </td>
                                                                <td className="bg-white dark:bg-slate-800 py-5 border-y border-slate-100 dark:border-slate-700 shadow-sm pl-6 bg-rose-50/20 dark:bg-rose-900/10">
                                                                    <select className="w-full bg-white dark:bg-slate-900 rounded-lg px-2 py-1 border-none focus:ring-2 focus:ring-rose-200 text-xs font-black text-rose-900 dark:text-rose-400 transition-all uppercase tracking-tighter" value={item.origin || ''} onChange={e => updateItem(index, 'origin', e.target.value)}>
                                                                        <option value="">Origen...</option>
                                                                        <option value="EFECTIVO">EFECTIVO</option>
                                                                        <option value="YAPE">YAPE</option>
                                                                        <option value="ALMACÉN">ALMACÉN</option>
                                                                        <option value="2049">Cta. 2049</option>
                                                                    </select>
                                                                </td>
                                                            </>
                                                        )}
                                                    </>
                                                )}

                                                <td className={`bg-white dark:bg-slate-800 py-5 pr-8 border-y border-slate-100 dark:border-slate-700 shadow-sm text-right font-black tabular-nums text-sm ${viewMode === 'REAL' ? 'text-rose-700 dark:text-rose-400' : 'text-indigo-900 dark:text-indigo-400'} ${!isLaborOrMobility && viewMode === 'BUDGET' ? 'rounded-r-[1.25rem] border-r pr-12' : ''} ${isNewItem ? 'bg-emerald-50/30 font-black' : ''}`}>
                                                    {displayTotal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                                </td>

                                                <td className={`bg-white dark:bg-slate-800 py-5 pr-6 rounded-r-[1.25rem] border-y border-r border-slate-100 dark:border-slate-700 shadow-sm text-center ${isNewItem ? 'bg-emerald-50/30' : ''}`}>
                                                    <button onClick={() => removeRow(index)} className="p-2.5 rounded-2xl text-slate-200 dark:text-slate-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 dark:hover:text-rose-400 transition-all opacity-0 group-hover:opacity-100 active:scale-95">
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <div className="px-8 py-2 bg-white flex justify-center border-t border-slate-50">
                        <span className="text-[10px] font-black text-slate-200 tracking-[0.4em] uppercase">Advanced ERP Logic 1.14</span>
                    </div>
                </div>
            </div>
        </>
    );
}
