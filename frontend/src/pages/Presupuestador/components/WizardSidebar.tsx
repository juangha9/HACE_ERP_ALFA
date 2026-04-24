import React from 'react';

export function WizardSidebar({ totals }: { totals: any }) {
    return (
        <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col h-full overflow-y-auto transition-colors duration-300">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">assistant</span>
                Asistente de Costos
            </h3>

            <div className="space-y-6 flex-1">
                {/* Real-time Summary */}
                <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resumen en Tiempo Real</p>

                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Costo Materiales</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">S/ {(totals.materials || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Mano de Obra</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">S/ {(totals.labor || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Equipos y Herramientas</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">S/ {(totals.equipment || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Logística / Flete</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">S/ {(totals.logistics || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Servicios Terceros</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">S/ {(totals.services || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>

                {/* Margins */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-3 border border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Márgenes Estimados</p>

                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Utilidad Bruta</span>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{totals.margin || 0}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(totals.margin || 0, 100)}%` }}></div>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-slate-500">Valor Utilidad</span>
                        <span className="text-xs font-bold text-emerald-600">S/ {(totals.marginValue || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>

                {/* Grand Total */}
                <div className="mt-auto pt-6 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Subtotal Directo</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">S/ {(totals.subtotalDirecto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Gastos Fijos + Util.</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">S/ {(totals.subtotal - totals.subtotalDirecto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-end mb-4">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">IGV (18%)</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">S/ {(totals.igv || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex justify-between items-end p-4 bg-primary/5 rounded-xl border border-primary/10">
                        <span className="font-bold text-primary">Total Presupuesto</span>
                        <span className="text-2xl font-black text-primary">S/ {(totals.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
