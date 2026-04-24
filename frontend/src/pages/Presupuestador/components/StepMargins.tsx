import React, { useState } from 'react';

interface StepMarginsProps {
    directCost: number;
    formData: any;
    onChange: (field: string, value: any) => void;
    onNext: () => void;
    onPrev: () => void;
}

export function StepMargins({ directCost, formData, onChange, onNext, onPrev }: StepMarginsProps) {
    const [margins, setMargins] = useState(formData.margins || {
        fixedExpenses: 15,
        utility: 25,
        igv: 18
    });

    // Update parent when margins change
    React.useEffect(() => {
        onChange('margins', margins);
    }, [margins]);

    const rFixed = margins.fixedExpenses / 100;
    const rUtility = margins.utility / 100;
    const denominator = 1 - (rFixed + rUtility);
    
    // Profit margin formula: Price = Cost / (1 - %sum_of_margins)
    const subtotal = denominator > 0 ? directCost / denominator : directCost;
    
    const fixedExpensesCost = subtotal * rFixed;
    const utilityCost = subtotal * rUtility;
    const igvCost = subtotal * (margins.igv / 100);
    const total = subtotal + igvCost;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="size-16 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
                    <span className="material-symbols-outlined">percent</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Márgenes y Utilidad</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Configura los porcentajes de rentabilidad y gastos administrativos para este proyecto.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Inputs */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm uppercase tracking-wider mb-4">Parámetros Generales</h4>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm text-slate-600 dark:text-slate-400 font-medium">Gastos Fijos (%)</label>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number"
                                        className="w-16 px-2 py-1 text-right border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        value={margins.fixedExpenses}
                                        onChange={(e) => setMargins({ ...margins, fixedExpenses: Math.max(0, Math.min(100, Number(e.target.value))) })}
                                        min="0" max="100"
                                    />
                                    <span className="text-slate-500 dark:text-slate-400 font-bold">%</span>
                                </div>
                            </div>
                            <input
                                type="range"
                                className="w-full accent-primary h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                                min="0" max="50" step="1"
                                value={margins.fixedExpenses}
                                onChange={(e) => setMargins({ ...margins, fixedExpenses: Number(e.target.value) })}
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm text-slate-600 dark:text-slate-400 font-medium">Utilidad Deseada (%)</label>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number"
                                        className="w-16 px-2 py-1 text-right border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        value={margins.utility}
                                        onChange={(e) => setMargins({ ...margins, utility: Math.max(0, Math.min(100, Number(e.target.value))) })}
                                        min="0" max="100"
                                    />
                                    <span className="text-slate-500 dark:text-slate-400 font-bold">%</span>
                                </div>
                            </div>
                            <input
                                type="range"
                                className="w-full accent-emerald-500 h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                                min="0" max="100" step="1"
                                value={margins.utility}
                                onChange={(e) => setMargins({ ...margins, utility: Number(e.target.value) })}
                            />
                        </div>
                    </div>
                </div>

                {/* Summary Preview */}
                <div className="bg-slate-900 dark:bg-slate-950 rounded-2xl p-8 text-white space-y-6 h-fit border border-slate-800">
                    <h4 className="font-bold opacity-80 uppercase tracking-wider text-sm border-b border-white/10 pb-4">Resumen Financiero Est.</h4>

                    <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="opacity-70">Costo Directo</span>
                            <span className="font-medium">S/ {directCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="opacity-70">Gastos Fijos ({margins.fixedExpenses}%)</span>
                            <span className="font-medium">S/ {fixedExpensesCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-emerald-400">
                            <span className="font-bold">Utilidad ({margins.utility}%)</span>
                            <span className="font-bold">S/ {utilityCost.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/10 space-y-2">
                        <div className="flex justify-between items-end">
                            <span className="text-sm opacity-70">Subtotal</span>
                            <span className="text-xl font-bold">S/ {subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-end">
                            <span className="text-sm opacity-70">IGV ({margins.igv}%)</span>
                            <span className="text-lg font-bold">S/ {igvCost.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-white/20">
                        <div className="flex justify-between items-end">
                            <span className="font-bold text-lg">Total Final</span>
                            <span className="text-3xl font-black text-emerald-400">S/ {total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
                <button
                    onClick={onPrev}
                    className="px-6 py-2 rounded-xl text-slate-500 hover:text-slate-800 font-bold transition-colors"
                >
                    Atrás
                </button>
                <button
                    onClick={onNext}
                    className="px-8 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                    Continuar al Resumen
                </button>
            </div>
        </div>
    );
}
