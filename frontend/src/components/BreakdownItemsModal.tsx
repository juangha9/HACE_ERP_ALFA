
import type { ProjectItem } from '../services/types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    categoryLabel: string;
    items: {
        principal: ProjectItem[];
        interno: ProjectItem[];
    };
}

export function BreakdownItemsModal({ isOpen, onClose, categoryLabel, items }: Props) {
    if (!isOpen) return null;

    const renderItem = (it: ProjectItem, isInterno: boolean) => {
        const isLaborOrMobility = it.category.includes('MANO_OBRA') || it.category.includes('MOVILIDAD');
        const pQty = (it.planned_qty === 0 && isLaborOrMobility) ? 1 : (it.planned_qty || 0);
        const rQty = (it.real_qty === 0 && isLaborOrMobility) ? 1 : (it.real_qty || 0);
        const pTotal = pQty * (it.planned_unit_price || 0);
        const rTotal = rQty * (it.real_unit_price || 0);

        // Logic: Red > Plan, Green = Plan, Yellow < Plan
        let statusColor = 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'; // GREEN
        if (rTotal > pTotal) statusColor = 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'; // RED
        else if (rTotal < pTotal) statusColor = 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]'; // YELLOW

        return (
            <div key={it.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${isInterno ? 'bg-amber-50/30 dark:bg-amber-900/10 border-amber-100/50 dark:border-amber-900/20' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 shadow-sm'}`}>
                <div className={`w-3 h-3 rounded-full shrink-0 ${statusColor}`} title={rTotal > pTotal ? 'Sobre presupuesto' : rTotal < pTotal ? 'Ahorro' : 'En meta'}></div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-4">
                        <p className="text-xs font-black text-slate-700 dark:text-slate-200 leading-tight">{it.description}</p>
                        <p className={`text-xs font-black whitespace-nowrap ${rTotal > pTotal ? 'text-rose-500' : rTotal < pTotal ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            S/ {rTotal.toLocaleString('es-PE', { minimumFractionDigits: 1 })}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">Plan:</span>
                            <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 italic">{pQty} {it.unit} x S/ {it.planned_unit_price}</span>
                        </div>
                        <span className="text-slate-200 dark:text-slate-700 text-[10px]">|</span>
                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-tight">Real:</span>
                            <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 italic">{rQty} {it.unit} x S/ {it.real_unit_price}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-white dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-8 pb-6 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none">
                            <span className="material-icons-round text-2xl">analytics</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic">{categoryLabel}</h3>
                            <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold tracking-widest uppercase mt-0.5">Detalle de Partidas y Ejecución</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:border-rose-100 transition-all active:scale-95"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Legend */}
                <div className="px-8 py-3 bg-white dark:bg-slate-900 border-b border-slate-50 dark:border-slate-800 flex gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Excedido</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">En Meta</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ahorro</span>
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 pt-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="space-y-8">
                        {/* Principal */}
                        {items.principal.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1 rounded-full">Partidas Principales</p>
                                    <div className="flex-1 h-px bg-indigo-100/50 dark:bg-indigo-900/30"></div>
                                </div>
                                <div className="grid gap-3">
                                    {items.principal.map(it => renderItem(it, false))}
                                </div>
                            </div>
                        )}

                        {/* Internos */}
                        {items.interno.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-[0.2em] bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded-full">Adicionales Internos</p>
                                    <div className="flex-1 h-px bg-amber-100/50 dark:bg-amber-900/30"></div>
                                </div>
                                <div className="grid gap-3">
                                    {items.interno.map(it => renderItem(it, true))}
                                </div>
                            </div>
                        )}

                        {items.principal.length === 0 && items.interno.length === 0 && (
                            <div className="py-20 text-center">
                                <span className="material-icons-round text-slate-200 text-5xl mb-4">folder_open</span>
                                <p className="text-slate-400 text-sm italic">No hay registros en esta categoría.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-8 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end border-t border-slate-50 dark:border-slate-800">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-slate-900 dark:bg-slate-700 border border-slate-800 dark:border-slate-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-slate-600 transition-all active:scale-95 shadow-lg shadow-slate-200 dark:shadow-black/20"
                    >
                        Cerrar Detalle
                    </button>
                </div>
            </div>
        </div>
    );
}
