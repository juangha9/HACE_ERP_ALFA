import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';
import { generateQuotePDF } from '../../../services/pdfExport';

interface BudgetPreviewProps {
    onEditStep: (step: number) => void;
    onSave: () => void;
    totals: any; // Receive totals from parent
}

export function BudgetPreview({ onEditStep, onSave, totals }: BudgetPreviewProps) {

    const handleExportPDF = () => {
        const mockData = {
            projectNumber: 'DRAFT-001',
            clientName: 'Cliente',
            projectName: 'Proyecto',
            date: new Date(),
            validityDays: 15,
            items: [
                { description: 'Materiales Generales', unit: 'GLB', quantity: 1, unitPrice: totals.materials, total: totals.materials },
                { description: 'Mano de Obra', unit: 'GLB', quantity: 1, unitPrice: totals.labor, total: totals.labor },
                { description: 'Logística Obra', unit: 'GLB', quantity: 1, unitPrice: totals.siteLogistics, total: totals.siteLogistics },
            ],
            totals: {
                subtotal: totals.subtotal,
                igv: totals.igv,
                total: totals.total
            },
            terms: []
        };
        generateQuotePDF(mockData);
    };

    // Visualization Data
    const costBreakdown = [
        { name: 'Materiales', costo: totals.materials || 0, color: '#f59e0b' },
        { name: 'Mano de Obra', costo: totals.labor || 0, color: '#3b82f6' },
        { name: 'Maquinaria', costo: totals.equipment || 0, color: '#6366f1' },
        { name: 'Logística Obra', costo: totals.siteLogistics || 0, color: '#10b981' },
        { name: 'Flete Proveedor', costo: totals.supplierLogistics || 0, color: '#14b8a6' }, // Added separate item
        { name: 'Servicios', costo: totals.services || 0, color: '#8b5cf6' },
    ];

    const timelineData = [
        { day: 'Día 1', avance: 10, costo: (totals.subtotalDirecto || 0) * 0.1 },
        { day: 'Día 5', avance: 35, costo: (totals.subtotalDirecto || 0) * 0.35 },
        { day: 'Día 10', avance: 60, costo: (totals.subtotalDirecto || 0) * 0.6 },
        { day: 'Día 15', avance: 85, costo: (totals.subtotalDirecto || 0) * 0.85 },
        { day: 'Día 20', avance: 100, costo: totals.subtotalDirecto || 0 },
    ];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="size-16 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
                    <span className="material-symbols-outlined">fact_check</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Revisión Final del Presupuesto</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Verifica todos los detalles antes de generar y enviar la cotización.</p>
            </div>

            {/* Top Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                    <div className="relative z-10">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Costo Directo Total</p>
                        <h3 className="text-3xl font-black text-slate-800 dark:text-white">S/ {(totals.subtotalDirecto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
                    </div>
                    <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-slate-100 dark:text-slate-800 text-8xl z-0">monetization_on</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                    <div className="relative z-10">
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Margen de Utilidad ({totals.margin || 0}%)</p>
                        <h3 className="text-3xl font-black text-emerald-500 dark:text-emerald-400">S/ {(totals.marginValue || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
                    </div>
                    <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-emerald-50 dark:text-emerald-900/20 text-8xl z-0">trending_up</span>
                </div>
                <div className="bg-slate-900 dark:bg-slate-950 p-6 rounded-2xl shadow-lg relative overflow-hidden text-white border border-slate-800">
                    <div className="relative z-10">
                        <p className="text-xs font-bold opacity-60 uppercase tracking-wider mb-1">Precio Final (Inc. IGV)</p>
                        <h3 className="text-3xl font-black text-white">S/ {(totals.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
                    </div>
                    <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-white/10 text-8xl z-0">verified</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Cost Distribution Chart */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h4 className="font-bold text-slate-800 dark:text-white mb-6 flex items-center justify-between">
                        <span>Estructura de Costos</span>
                        <button onClick={() => onEditStep(3)} className="text-xs text-primary dark:text-indigo-400 font-bold hover:underline">Editar Materiales</button>
                    </h4>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={costBreakdown} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" className="dark:stroke-slate-700" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: '#64748b' }} className="dark:fill-slate-400" />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    formatter={(value: number | undefined) => `S/ ${(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`}
                                />
                                <Bar dataKey="costo" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20}>
                                    {costBreakdown.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Timeline / Gantt Preview */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h4 className="font-bold text-slate-800 dark:text-white mb-6 flex items-center justify-between">
                        <span>Proyección de Flujo</span>
                        <button onClick={() => onEditStep(1)} className="text-xs text-primary dark:text-indigo-400 font-bold hover:underline">Editar Fechas</button>
                    </h4>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={timelineData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-700" />
                                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} className="dark:fill-slate-400" />
                                <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#64748b' }} className="dark:fill-slate-400" />
                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#64748b' }} className="dark:fill-slate-400" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    formatter={(value: number | undefined, name: any) => [name === 'Costo Acumulado' ? `S/ ${(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : `${(value || 0).toFixed(0)}%`, name]}
                                />
                                <Legend wrapperStyle={{ color: '#94a3b8' }} />
                                <Line yAxisId="left" type="monotone" dataKey="costo" name="Costo Acumulado" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                <Line yAxisId="right" type="monotone" dataKey="avance" name="% Avance" stroke="#10b981" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                    onClick={handleExportPDF}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                    <span className="material-symbols-outlined">print</span>
                    Vista Previa PDF
                </button>
                <button
                    onClick={onSave}
                    className="flex items-center gap-2 px-8 py-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all shadow-lg shadow-black/20"
                >
                    <span className="material-symbols-outlined">save</span>
                    Guardar y Finalizar
                </button>
            </div>
        </div>
    );
}
