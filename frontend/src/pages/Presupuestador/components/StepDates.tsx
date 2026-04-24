import React from 'react';

interface StepDatesProps {
    formData: any;
    onChange: (field: string, value: any) => void;
    onNext: () => void;
}

export function StepDates({ formData, onChange, onNext }: StepDatesProps) {
    const isInvalidDate = formData.dates.plannedStart && formData.dates.plannedEnd &&
        new Date(formData.dates.plannedEnd) < new Date(formData.dates.plannedStart);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-10">
                <div className="size-16 bg-blue-50 text-[#463acb] rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
                    <span className="material-symbols-outlined">calendar_month</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Datos Generales del Proyecto</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Ingresa la información básica y los plazos estimados.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* General Info */}
                <div className="space-y-4 p-6 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <h4 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 dark:text-slate-500">description</span>
                        Información Básica
                    </h4>

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Número de Ficha <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.dates.projectNumber || ''}
                                onChange={(e) => onChange('dates', { ...formData.dates, projectNumber: e.target.value })}
                                className={`w-full px-4 py-3 bg-white dark:bg-slate-800 border rounded-xl focus:outline-none focus:ring-2 transition-all dark:text-white ${formData.errors?.projectNumber ? 'border-rose-300 dark:border-rose-900/50 focus:ring-rose-500/20' : 'border-slate-200 dark:border-slate-700 focus:ring-[#463acb]/20'}`}
                                placeholder="Ej. 2024-001"
                            />
                            {formData.errors?.projectNumber && (
                                <p className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                                    <span className="material-symbols-outlined text-sm">error</span>
                                    {formData.errors.projectNumber}
                                </p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Nombre del Proyecto <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.dates.projectName || ''}
                                onChange={(e) => onChange('dates', { ...formData.dates, projectName: e.target.value })}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#463acb]/20 transition-all dark:text-white"
                                placeholder="Ej. Mantenimiento Faja 3"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Cliente <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.dates.clientName || ''}
                                onChange={(e) => onChange('dates', { ...formData.dates, clientName: e.target.value })}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#463acb]/20 transition-all dark:text-white"
                                placeholder="Ej. Minera Las Bambas"
                            />
                        </div>
                    </div>
                </div>

                {/* Planned Dates */}
                <div className="space-y-4 p-6 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <h4 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 dark:text-slate-500">event_note</span>
                        Fechas Planificadas
                    </h4>

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Inicio Estimado <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={formData.dates.plannedStart || ''}
                                onChange={(e) => onChange('dates', { ...formData.dates, plannedStart: e.target.value })}
                                className={`w-full px-4 py-3 bg-white dark:bg-slate-800 border rounded-xl focus:outline-none focus:ring-2 transition-all dark:text-white dark:[color-scheme:dark] ${isInvalidDate ? 'border-rose-300 dark:border-rose-900/50 focus:ring-rose-500/20' : 'border-slate-200 dark:border-slate-700 focus:ring-[#463acb]/20'}`}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Fin Estimado <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={formData.dates.plannedEnd || ''}
                                min={formData.dates.plannedStart}
                                onChange={(e) => onChange('dates', { ...formData.dates, plannedEnd: e.target.value })}
                                className={`w-full px-4 py-3 bg-white dark:bg-slate-800 border rounded-xl focus:outline-none focus:ring-2 transition-all dark:text-white dark:[color-scheme:dark] ${isInvalidDate ? 'border-rose-300 dark:border-rose-900/50 focus:ring-rose-500/20' : 'border-slate-200 dark:border-slate-700 focus:ring-[#463acb]/20'}`}
                            />
                            {isInvalidDate && (
                                <p className="text-xs text-rose-500 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">warning</span>
                                    La fecha fin no puede ser anterior al inicio
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
