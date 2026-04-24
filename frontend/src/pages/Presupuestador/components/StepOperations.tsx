import React, { useState, useEffect } from 'react';

interface StepOperationsProps {
    formData: any;
    onChange: (field: string, value: any) => void;
    onNext: () => void;
    onPrev: () => void;
    siteRingRate?: number; // Cost per trip based on RING (Distance)
    supplierFreightRate?: number; // Cost per trip for Supplier (Fixed from table)
}

export function StepOperations({ formData, onChange, onNext, onPrev, siteRingRate = 0, supplierFreightRate = 15 }: StepOperationsProps) {
    // Initialize State
    const ops = formData.operations || {};

    // Logística Obra (Visits to Site)
    const [siteTrips, setSiteTrips] = useState(ops.siteTrips !== undefined ? ops.siteTrips : (ops.trips || 1));

    // Logística Proveedor (Pickups)
    const [supplierTrips, setSupplierTrips] = useState(ops.supplierTrips || 0);

    // Labor
    const [workers, setWorkers] = useState(ops.workers || 2);
    const [hoursPerWorker, setHoursPerWorker] = useState(ops.hoursPerWorker || 8);
    const [hourlyRate, setHourlyRate] = useState(ops.hourlyRate || 20);

    // Machinery
    const [machineryHours, setMachineryHours] = useState(ops.machineryHours || 0);
    const [machineryRate, setMachineryRate] = useState(ops.machineryRate || 15);

    // External Services (Array)
    const [externalServices, setExternalServices] = useState<any[]>(
        Array.isArray(ops.externalServices) ? ops.externalServices :
            (ops.externalService ? [{
                id: Date.now(),
                description: ops.externalServiceDesc,
                provider: ops.externalServiceProvider,
                cost: ops.externalServiceCost
            }] : [])
    );

    // New Service Input State
    const [newService, setNewService] = useState({ description: '', provider: '', cost: '' });
    const [showServiceForm, setShowServiceForm] = useState(externalServices.length > 0);

    // --- Calculations ---

    // 1. Logística Obra: Depends on Rings/Distance (siteRingRate)
    const siteLogisticsCost = siteTrips * siteRingRate;

    // 2. Logística Proveedor: Depends on Fixed Rate from Table (supplierFreightRate)
    const supplierLogisticsCost = supplierTrips * supplierFreightRate;

    const totalFreightAndLogistics = siteLogisticsCost + supplierLogisticsCost;

    const laborCost = workers * hoursPerWorker * hourlyRate;
    const machineryCost = machineryHours * machineryRate;

    // Sum of all external services
    const servicesCost = externalServices.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);

    const totalOperations = totalFreightAndLogistics + laborCost + machineryCost + servicesCost;

    // Sync to parent
    useEffect(() => {
        onChange('operations', {
            siteTrips,
            supplierTrips,
            workers, hoursPerWorker, hourlyRate,
            machineryHours, machineryRate,

            // New Array Structure
            externalServices,

            // Legacy fields for backward compat (optional/cleared)
            externalService: externalServices.length > 0,

            // Costs for Wizard Summary
            siteLogisticsCost,
            supplierLogisticsCost,
            freightCost: totalFreightAndLogistics, // Aggregate
            laborCost,
            machineryCost,
            servicesCost,
            totalOperations
        });
    }, [siteTrips, supplierTrips, workers, hoursPerWorker, hourlyRate, machineryHours, machineryRate, externalServices, siteRingRate, supplierFreightRate]);

    const addService = () => {
        if (!newService.description || !newService.cost) return;
        setExternalServices([...externalServices, { ...newService, id: Date.now(), cost: Number(newService.cost) }]);
        setNewService({ description: '', provider: '', cost: '' });
    };

    const removeService = (id: number) => {
        setExternalServices(externalServices.filter(s => s.id !== id));
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="size-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
                    <span className="material-symbols-outlined">engineering</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Costos Operativos</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Define logística, mano de obra y servicios de terceros.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Logistics Section */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 dark:text-slate-500">local_shipping</span>
                        Logística y Fletes
                    </h4>

                    {/* Site Logistics */}
                    <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl space-y-3">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex justify-between">
                            <span>Visitas a Obra (Anillo Actual)</span>
                            <span className="text-blue-600 dark:text-blue-400">S/ {siteRingRate.toFixed(2)}/viaje</span>
                        </label>
                        <div className="flex gap-4 items-center">
                            <span className="text-sm text-slate-600 dark:text-slate-300">Viajes:</span>
                            <input
                                type="number"
                                className="w-20 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                value={siteTrips}
                                onChange={(e) => setSiteTrips(Number(e.target.value))}
                                min={0}
                            />
                            <span className="ml-auto font-bold text-slate-700 dark:text-slate-200">S/ {siteLogisticsCost.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Supplier Logistics */}
                    <div className="p-3 bg-amber-50/50 dark:bg-amber-900/10 rounded-xl space-y-3">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex justify-between">
                            <span>Recojo Proveedores</span>
                            <span className="text-amber-600 dark:text-amber-400">S/ {supplierFreightRate.toFixed(2)}/viaje</span>
                        </label>
                        <div className="flex gap-4 items-center">
                            <span className="text-sm text-slate-600 dark:text-slate-300">Viajes:</span>
                            <input
                                type="number"
                                className="w-20 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                value={supplierTrips}
                                onChange={(e) => setSupplierTrips(Number(e.target.value))}
                                min={0}
                            />
                            <span className="ml-auto font-bold text-slate-700 dark:text-slate-200">S/ {supplierLogisticsCost.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Logística</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">S/ {totalFreightAndLogistics.toFixed(2)}</span>
                    </div>
                </div>

                {/* Labor */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 dark:text-slate-500">group</span>
                        Mano de Obra
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">N° Operarios</label>
                            <input
                                type="number"
                                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:text-white"
                                value={workers}
                                onChange={(e) => setWorkers(Number(e.target.value))}
                                min={1}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Horas / Op.</label>
                            <input
                                type="number"
                                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:text-white"
                                value={hoursPerWorker}
                                onChange={(e) => setHoursPerWorker(Number(e.target.value))}
                                min={1}
                            />
                        </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Costo MO Est.</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">S/ {laborCost.toFixed(2)}</span>
                    </div>
                </div>

                {/* Machinery */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 dark:text-slate-500">handyman</span>
                        Desgaste Maquinaria
                    </h4>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Horas Máquina (Total)</label>
                        <input
                            type="number"
                            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:text-white"
                            value={machineryHours}
                            onChange={(e) => setMachineryHours(Number(e.target.value))}
                            min={0}
                        />
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Costo Desgaste</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">S/ {machineryCost.toFixed(2)}</span>
                    </div>
                </div>

                {/* External Services */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <div className="flex justify-between items-center">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <span className="material-symbols-outlined text-slate-400 dark:text-slate-500">construction</span>
                            Servicios Externos
                        </h4>

                        {/* Improved Toggle Switch */}
                        <button
                            onClick={() => setShowServiceForm(!showServiceForm)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${showServiceForm ? 'bg-[#463acb]' : 'bg-slate-200 dark:bg-slate-600'}`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showServiceForm ? 'translate-x-6' : 'translate-x-1'}`}
                            />
                        </button>
                    </div>

                    {showServiceForm && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            {/* List of Services */}
                            {externalServices.length > 0 && (
                                <ul className="space-y-2 mb-4">
                                    {externalServices.map((service, idx) => (
                                        <li key={service.id || idx} className="flex justify-between items-center text-sm p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                            <div>
                                                <div className="font-bold text-slate-700 dark:text-slate-200">{service.description}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400">{service.provider}</div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-slate-900 dark:text-white">S/ {Number(service.cost).toFixed(2)}</span>
                                                <button onClick={() => removeService(service.id)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {/* Add New Service Form */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 gap-3">
                                <p className="text-xs font-bold text-slate-400 uppercase">Agregar Nuevo Servicio</p>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    placeholder="Descripción (ej. Instalación)"
                                    value={newService.description}
                                    onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                        placeholder="Proveedor"
                                        value={newService.provider}
                                        onChange={(e) => setNewService({ ...newService, provider: e.target.value })}
                                    />
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">S/</span>
                                        <input
                                            type="number"
                                            className="w-full pl-7 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                            placeholder="Costo"
                                            value={newService.cost}
                                            onChange={(e) => setNewService({ ...newService, cost: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={addService}
                                    disabled={!newService.description || !newService.cost}
                                    className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors flex justify-center items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">add</span>
                                    Agregar Externo
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Subtotal Terceros</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">S/ {servicesCost.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 dark:bg-slate-950 rounded-2xl p-6 text-white flex justify-between items-center mt-6 border border-slate-800">
                <div>
                    <p className="text-sm text-slate-400">Total Costos Operativos Estimados</p>
                    <p className="text-xs opacity-50">Incluye IGV si aplica segun configuración</p>
                </div>
                <div className="text-3xl font-bold text-emerald-400">
                    S/ {totalOperations.toFixed(2)}
                </div>
            </div>
        </div>
    );
}
