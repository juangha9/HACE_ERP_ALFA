import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { StepDates } from './components/StepDates';
import { StepLocation } from './components/StepLocation';
import { StepMaterials } from './components/StepMaterials';
import { StepOperations } from './components/StepOperations';
import { StepMargins } from './components/StepMargins';
import { BudgetPreview } from './components/BudgetPreview';
import { WizardSidebar } from './components/WizardSidebar';

export default function PresupuestadorWizard() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [currentStep, setCurrentStep] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Logistics Data
    const [logisticsConfig, setLogisticsConfig] = useState({
        costZone: null as any,
        transportRates: null as any,
        rings: [] as any[]
    });

    // Global Wizard State
    const [allProjects, setAllProjects] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        dates: { projectNumber: '', projectName: '', clientName: '', plannedStart: '', plannedEnd: '' },
        location: null as any,
        items: [] as any[],
        operations: {},
        margins: { fixedExpenses: 15, utility: 25, igv: 18 },
        errors: {} as any
    });

    const updateFormData = (field, value) => {
        // Special validation for projectNumber in 'dates'
        if (field === 'dates' && value.projectNumber !== formData.dates.projectNumber) {
            const exists = allProjects.some(p =>
                p.project_number === value.projectNumber && p.id !== id
            );

            setFormData(prev => ({
                ...prev,
                [field]: value,
                errors: {
                    ...prev.errors,
                    projectNumber: exists ? 'El número de ficha ya se encuentra registrado.' : undefined
                }
            }));
        } else {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    // Load Data
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [zone, rates, mgmtParams] = await Promise.all([
                    api.getCostZoneDefault(),
                    api.getTransportRatesDefault(),
                    api.getManagementParameters()
                ]);

                let rings = [];
                if (rates && rates.bands_config) {
                    rings = typeof rates.bands_config === 'string'
                        ? JSON.parse(rates.bands_config)
                        : rates.bands_config;
                }

                setLogisticsConfig({
                    costZone: zone,
                    transportRates: rates,
                    rings: rings
                });

                // Default Margins from DB
                console.log("Raw Management Parameters from API:", mgmtParams);

                // Ensure we convert string percentages to numbers if needed, though they should be numbers.
                // Handle potential typos in column names (percentage vs percentege) as reported by user/legacy
                const defaultMargins = {
                    fixedExpenses: Number(mgmtParams?.admin_expenses_percentage || mgmtParams?.admin_expenses_percentege),
                    utility: Number(mgmtParams?.desired_utility_percentage || mgmtParams?.desired_utility_percentege),
                    igv: Number(mgmtParams?.igv_percentage || mgmtParams?.igv_percentege) || 18
                };

                // Fallback only if values are NaN or undefined/null (0 is valid so checks against null/undefined specifically or isNaN)
                if (isNaN(defaultMargins.fixedExpenses)) defaultMargins.fixedExpenses = 15;
                if (isNaN(defaultMargins.utility)) defaultMargins.utility = 25;

                console.log("Computed Default Margins:", defaultMargins);

                // Fetch all projects for validation (and editing if applicable)
                const projects = await api.getProjects();
                setAllProjects(projects);

                if (id) {
                    const project = projects.find((p: any) => p.id === id);

                    if (project) {
                        let obsData: any = {};
                        try {
                            if (project.observations) {
                                obsData = JSON.parse(project.observations);
                            }
                        } catch (e) { console.error("Error parsing observations", e); }

                        // Fetch Items separately as they are in a different table
                        const projectItems = await api.getItems(id);
                        const mappedItems = projectItems.map((item: any) => ({
                            id: item.id,
                            description: item.description,
                            unit: item.unit,
                            quantity: item.planned_qty,
                            unitPrice: item.planned_unit_price,
                            total: (item.planned_qty || 0) * (item.planned_unit_price || 0)
                        }));

                        // Handle location: check new column first, then fallback to observations (legacy)
                        let locationData = project.location;
                        if (!locationData && obsData.location) {
                            locationData = obsData.location;
                        }

                        // Handle metadata (operations, margins) from new column or fallback (legacy)
                        // If metadata column has data, favor it. Otherwise check observations.
                        const meta = (project.metadata && Object.keys(project.metadata).length > 0)
                            ? project.metadata
                            : obsData;

                        const savedMargins = meta?.margins;

                        setFormData({
                            dates: {
                                projectNumber: project.project_number,
                                projectName: project.name,
                                clientName: project.client_name,
                                plannedStart: project.start_date_planned || '',
                                plannedEnd: project.end_date_planned || ''
                            },
                            location: locationData || null,
                            items: mappedItems as any[], // Populated from DB
                            operations: meta?.operations || {},
                            // If editing, use saved margins. If saved margins are missing/empty, use defaults from DB.
                            margins: (savedMargins && Object.keys(savedMargins).length > 0) ? savedMargins : defaultMargins,
                            errors: {} as any
                        });
                    }
                } else {
                    // Initialize with defaults for new project
                    setFormData(prev => ({
                        ...prev,
                        margins: defaultMargins
                    }));
                }

            } catch (error) {
                console.error("Error loading wizard data", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [id]);


    // Determine Ring Rate based on Distance
    const activeRingRate = useMemo(() => {
        const dist = formData.location?.distance || 0;
        const rings = logisticsConfig.rings || [];

        for (const ring of rings) {
            // Parse range "0-5", "5-10", ">20", "+20"
            const range = ring.range;
            if (range.includes('-')) {
                const [min, max] = range.split('-').map(Number);
                if (dist >= min && dist < max) return ring.price;
            } else if (range.includes('+') || range.includes('>')) {
                const min = parseInt(range.replace(/\D/g, ''));
                if (dist >= min) return ring.price;
            }
        }
        // Fallback if no ring matches (or very far)
        // Ensure we handle the "Legacy" case where config might be simple
        return logisticsConfig.transportRates?.base_rate || 50;
    }, [formData.location?.distance, logisticsConfig.rings]);


    // Calculate Totals for Sidebar (and Preview)
    const totals = useMemo(() => {
        const materials = formData.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);

        // Operations costs from Step 3
        const ops = formData.operations || {};
        const labor = (ops as any).laborCost || 0;
        const equipment = (ops as any).machineryCost || 0;
        const services = (ops as any).servicesCost || 0;

        // Logistics now separated: Site vs Supplier
        const siteLogistics = (ops as any).siteLogisticsCost || 0;
        const supplierLogistics = (ops as any).supplierLogisticsCost || 0;
        const logistics = siteLogistics + supplierLogistics;

        // Note: For compatibility, we can keep using total 'logistics' in sidebar, but Step 6 wants split.
        // We'll pass granular object to Step 6.

        const subtotalDirecto = materials + labor + equipment + logistics + services;

        // Margins Formula: Precio = Costo Directo / (1 - (%Gastos Fijos + %Utilidad))
        const margins = formData.margins || { fixedExpenses: 15, utility: 25, igv: 18 };
        const rFixed = (margins.fixedExpenses || 0) / 100;
        const rUtility = (margins.utility || 0) / 100;
        
        const sumRates = rFixed + rUtility;
        const denominator = 1 - sumRates;
        
        // Final Subtotal (Pricing before IGV)
        const subtotal = denominator > 0 ? subtotalDirecto / denominator : subtotalDirecto;
        
        const fixedExpensesCost = subtotal * rFixed;
        const utilityCost = subtotal * rUtility;

        const igv = subtotal * (margins.igv / 100);
        const total = subtotal + igv;

        return {
            materials,
            labor,
            equipment,
            logistics, // Total for Sidebar
            siteLogistics,
            supplierLogistics,
            services,
            subtotalDirecto,
            fixedExpensesCost,
            utilityCost,
            subtotal,
            igv,
            total,
            margin: margins.utility,
            marginValue: utilityCost
        };
    }, [formData]);

    const validateStep = (step: number) => {
        switch (step) {
            case 1:
                const { projectNumber, projectName, clientName, plannedStart, plannedEnd } = formData.dates;
                if (!projectNumber || !projectName || !clientName || !plannedStart || !plannedEnd) {
                    return { isValid: false, message: "Por favor completa todos los campos obligatorios." };
                }
                if (formData.errors?.projectNumber) {
                    // If there's an error message for projectNumber, blocks progress
                    return { isValid: false, message: formData.errors.projectNumber };
                }
                if (new Date(plannedEnd) < new Date(plannedStart)) {
                    return { isValid: false, message: "La fecha fin no puede ser anterior al inicio." };
                }
                return { isValid: true, message: "" };
            case 2:
                return { isValid: true, message: '' };
            case 3:
                return {
                    isValid: formData.items.length > 0,
                    message: 'Debe agregar al menos un material o ítem al presupuesto.'
                };
            default:
                return { isValid: true, message: '' };
        }
    };

    const nextStep = () => {
        const validation = validateStep(currentStep);
        if (validation.isValid) {
            window.scrollTo(0, 0); // Scroll to top on step change
            setCurrentStep(prev => prev + 1);
        } else {
            alert(validation.message);
        }
    };

    const prevStep = () => setCurrentStep(prev => prev - 1);

    const handleSave = async () => {
        try {
            setIsSaving(true);
            const projectData: Partial<any> = {
                project_number: formData.dates.projectNumber,
                name: formData.dates.projectName,
                client_name: formData.dates.clientName,
                start_date_planned: formData.dates.plannedStart,
                end_date_planned: formData.dates.plannedEnd,
                budget_total: totals.total,
                status: id ? undefined : 'POR APROBAR', // Default status for new projects
                location: formData.location, // New dedicated column
                metadata: {
                    operations: formData.operations,
                    margins: formData.margins
                },
                observations: null // Clear this field so it's blank in Dashboard (unless used for actual text notes later)
            };

            let projectId = id;
            if (id) {
                await api.updateProject(id, projectData);
            } else {
                const newProject = await api.createProject(projectData as any);
                projectId = newProject.id;
            }

            if (formData.items.length > 0 && projectId) {
                const itemsToSave = formData.items.map((item: any) => ({
                    project_id: projectId,
                    description: item.description,
                    unit: item.unit,
                    planned_qty: item.quantity,
                    planned_unit_price: item.unitPrice,
                    category: 'MATERIAL' as const,
                    real_qty: 0,
                    real_unit_price: 0,
                    origin: 'PRESUPUESTO',
                    transaction_date: new Date().toISOString(),
                    supplier: 'Pendiente'
                }));
                if (!id) await api.addItems(itemsToSave);
            }

            navigate('/presupuestador');
        } catch (error: any) {
            console.error('Error saving project:', error);
            alert('Error al guardar el presupuesto: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return <StepDates formData={formData} onChange={updateFormData} onNext={nextStep} />;
            case 2:
                return <StepLocation
                    formData={formData}
                    onChange={updateFormData}
                    onNext={nextStep}
                    onPrev={prevStep}
                    logisticsConfig={{
                        planta: { lat: parseFloat(logisticsConfig.costZone?.latitude || '-16.4090'), lng: parseFloat(logisticsConfig.costZone?.longitude || '-71.5375') },
                        rings: logisticsConfig.rings
                    }}
                />;
            case 3:
                return <StepMaterials
                    items={formData.items}
                    setItems={(items) => updateFormData('items', items)}
                    onNext={nextStep}
                    onPrev={prevStep}
                />;
            case 4:
                return <StepOperations
                    formData={formData}
                    onChange={updateFormData}
                    onNext={nextStep}
                    onPrev={prevStep}
                    siteRingRate={activeRingRate} // Dynamic based on distance
                    supplierFreightRate={logisticsConfig.transportRates?.vehicle_freight_rate || 15} // Fixed from table
                />;
            case 5:
                return <StepMargins
                    directCost={totals.subtotalDirecto}
                    formData={formData}
                    onChange={updateFormData}
                    onNext={nextStep}
                    onPrev={prevStep}
                />;
            case 6:
                return <BudgetPreview onEditStep={(step) => setCurrentStep(step)} onSave={handleSave} totals={totals} />;
            default: return <div>Fin del Wizard</div>;
        }
    };

    if (isLoading) return <div className="flex justify-center items-center h-full">Cargando datos...</div>;

    return (
        <div className="flex h-full w-full">
            <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-900 rounded-tl-3xl shadow-sm border-l border-t border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
                <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-6 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{id ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Paso {currentStep} de 6</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-3xl mx-auto">
                        {renderStep()}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                    <button
                        type="button"
                        onClick={prevStep}
                        disabled={currentStep === 1}
                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        Atrás
                    </button>
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => {
                                if (currentStep === 1) {
                                    navigate('/presupuestador');
                                } else {
                                    if (window.confirm('¿Estás seguro de cancelar? Se perderá el progreso actual.')) {
                                        navigate('/presupuestador');
                                    }
                                }
                            }}
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                        >
                            Cancelar
                        </button>
                        {currentStep < 6 ? (
                            <button
                                type="button"
                                onClick={nextStep}
                                className="px-8 py-2.5 bg-[#463acb] text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-[#372da0] transition-all"
                            >
                                Siguiente Paso
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-8 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 transition-all disabled:opacity-70"
                            >
                                {isSaving ? 'Guardando...' : 'Finalizar Presupuesto'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <WizardSidebar totals={totals} />
        </div >
    );
}
