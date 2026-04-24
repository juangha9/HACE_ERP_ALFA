import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { exportToPDF, exportToExcel, exportProjectMasterPDF } from '../utils/exportUtils';
import Modal from '../components/Modal';

// Diccionario de Traducción de Columnas (Map Literal de DB a Humano)
const COLUMN_MAP: Record<string, string> = {
    // Proyectos
    project_number: "CÓDIGO PROY.",
    name: "NOMBRE",
    client_name: "CLIENTE",
    status: "ESTADO",
    budget_total: "PPTO TOTAL",
    amount_collected: "COBRADO",
    amount_pending: "PENDIENTE",
    start_date_planned: "INICIO PLAN.",
    end_date_planned: "FIN PLAN.",
    start_date_real: "INICIO REAL",
    end_date_real: "FIN REAL",
    observations: "OBSERVACIONES",
    location: "UBICACIÓN",
    retail_board: "TABLERO RETAIL",
    
    // Inventario / Catálogo
    sku: "CÓDIGO/SKU",
    base_name: "NOMBRE BASE",
    presentation: "PRESENTACIÓN",
    brand: "MARCA",
    features: "CARACTERÍSTICAS",
    min_stock: "STOCK MÍN.",
    stock_current: "STOCK ACT.",
    average_cost: "COSTO PROM.",
    last_purchase_price: "P. COMPRA",
    unit_price_sale: "P. VENTA",
    unit: "UNIDAD",
    quantity: "CANTIDAD",
    total_cost: "COSTO TOTAL",
    unit_cost: "COSTO UNIT.",
    date: "FECHA",
    type: "TIPO",
    invoice_number: "N° DOC/REF",
    category: "CATEGORÍA",
    family: "FAMILIA",
    subfamily: "SUBFAMILIA",
    
    // RRHH
    dni: "DNI/DOI",
    nombres: "NOMBRES",
    apellidos: "APELLIDOS",
    cargo: "CARGO",
    sueldo: "SUELDO",
    tipo: "TIPO CONTRATO",
    adelantos: "ADELANTOS",

    // Contactos
    tax_id: "RUC/DNI",
    contact_person: "CONTACTO",
    email: "CORREO",
    phone: "TELÉFONO",
    address: "DIRECCIÓN",

    // Cobranzas e Items
    amount: "MONTO",
    description: "DESCRIPCIÓN",
    planned_qty: "CANT. PLAN.",
    planned_unit_price: "P.U. PLAN.",
    real_qty: "CANT. REAL",
    real_unit_price: "P.U. REAL",
    supplier: "PROVEEDOR",
    transaction_date: "FECHA TRANS.",
    account: "CUENTA",

    // Configuración
    company_name: "RAZÓN SOCIAL",
    ruc: "RUC EMPRESA",
    code: "CÓDIGO",
    is_active: "ACTIVO",
    cost_per_unit: "COSTO/UNID",
    lifespan_hours: "VIDA ÚTIL (H)",
    latitude: "LATITUD",
    longitude: "LONGITUD",
    
    // Otros
    created_at: "F. REGISTRO",
    updated_at: "F. ACTUALIZ."
};

const EXCLUDED_COLS = ['id', 'metadata', 'user_id', 'id_interno', 'password', 'token', 'data', 'image_url', 'subfamily_id', 'family_id', 'category_id', 'product_id', 'project_id', 'optimization_id', 'contact_id', 'location_id', 'zone_id'];

const EXPORT_GROUPS = [
    {
        name: "Logística e Inventario",
        id: "logistics",
        icon: "inventory_2",
        color: "indigo",
        tables: [
            { id: "catalog_products", label: "Catálogo Maestro de Productos" },
            { id: "inventory_products", label: "Stock e Inventario Actual" },
            { id: "inventory_movements", label: "Movimientos de Kardex" },
            { id: "inventory_locations", label: "Almacenes y Ubicaciones" },
            { id: "product_subfamilies", label: "Jerarquía de Categorías" },
            { id: "product_mermas", label: "Control de Mermas" },
            { id: "material_requests", label: "Listado de Requerimientos" },
            { id: "contacts", label: "Directorio Telefónico / Contactos" }
        ]
    },
    {
        name: "Proyectos y Finanzas",
        id: "finance",
        icon: "calculate",
        color: "emerald",
        tables: [
            { id: "projects", label: "Cartera de Proyectos" },
            { id: "project_items", label: "Consumos Reales por Item" },
            { id: "project_collections", label: "Cobranzas y Facturación" }
        ]
    },
    {
        name: "Recursos Humanos",
        id: "hr",
        icon: "groups",
        color: "amber",
        tables: [
            { id: "personal_staff", label: "Base de Datos de Personal" }
        ]
    },
    {
        name: "Optimización y Comercial",
        id: "sales",
        icon: "architecture",
        color: "rose",
        tables: [
            { id: "optimizations" , label: "Bitácora de Optimizaciones" },
            { id: "quotations", label: "Historial de Cotizaciones" },
            { id: "usable_offcuts", label: "Inventario de Retazos" },
            { id: "custom_boards", label: "Tableros Especiales" }
        ]
    },
    {
        name: "Configuración y Parámetros",
        id: "config",
        icon: "settings_applications",
        color: "slate",
        tables: [
            { id: "business_info", label: "Configuración de Empresa" },
            { id: "transport_rates", label: "Tarifario Logístico" },
            { id: "cost_zones", label: "Zonas Geográficas" },
            { id: "machinery_wear", label: "Depreciación de Máquinas" },
            { id: "management_parameters", label: "Parámetros de Utilidad" },
            { id: "supply_kits", label: "Configuración de Kits" }
        ]
    }
];

export default function DatabaseExportPage() {
    // States for filters
    const [fromDate, setFromDate] = useState<string>('');
    const [toDate, setToDate] = useState<string>('');
    const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
    const [projects, setProjects] = useState<any[]>([]);

    const [loading, setLoading] = useState<string | null>(null);
    const [alertConfig, setAlertConfig] = useState<{ open: boolean; title: string, message: string }>({ open: false, title: '', message: '' });

    useEffect(() => {
        api.getProjects().then(data => {
            setProjects(data || []);
        });
    }, []);

    const filterAndTranslateData = (rawData: any[]) => {
        if (!rawData || rawData.length === 0) return { headers: [], rows: [], excelData: [] };

        const allKeys = Object.keys(rawData[0]);
        let finalKeys = allKeys.filter(key => !EXCLUDED_COLS.includes(key) && typeof rawData[0][key] !== 'object');
        
        const hasProduct = rawData[0].product;
        const hasProject = rawData[0].project;
        const hasContact = rawData[0].contact;

        const resolvedHeaders: string[] = [];
        if (hasProduct) resolvedHeaders.push("PRODUCTO");
        if (hasProject) resolvedHeaders.push("PROYECTO");
        if (hasContact) resolvedHeaders.push("CONTACTO / PROV.");

        const headers = [...resolvedHeaders, ...finalKeys.map(key => COLUMN_MAP[key] || key.toUpperCase())];

        const formatDate = (val: any) => {
            if (!val) return '-';
            const date = new Date(val);
            if (isNaN(date.getTime()) || typeof val !== 'string' || !val.includes('T')) return String(val);
            const pad = (n: number) => n.toString().padStart(2, '0');
            const d = date;
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        const processValue = (val: any, key: string) => {
            if (val === null || val === undefined) return '-';
            if (typeof val === 'boolean') return val ? 'SÍ' : 'NO';
            if (typeof val === 'number') return val.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            if (key.includes('at') || key.includes('date') || (typeof val === 'string' && val.includes('T') && val.length > 20)) {
                return formatDate(val);
            }
            return String(val);
        };

        const getResolvedValues = (item: any) => {
            const vals: string[] = [];
            if (hasProduct) {
                vals.push(`${item.product?.base_name || ''} ${item.product?.presentation || ''} (${item.product?.sku || 'N/A'})`.trim());
            }
            if (hasProject) {
                vals.push(`${item.project?.project_number || ''} - ${item.project?.name || ''}`.trim());
            }
            if (hasContact) {
                vals.push(String(item.contact?.name || '-'));
            }
            return vals;
        };

        const rows = rawData.map(item => {
            const resolved = getResolvedValues(item);
            const regular = finalKeys.map(key => processValue(item[key], key));
            return [...resolved, ...regular];
        });

        const excelData = rawData.map(item => {
            const newItem: any = {};
            if (hasProduct) newItem["PRODUCTO"] = `${item.product?.base_name || ''} ${item.product?.presentation || ''} (${item.product?.sku || 'N/A'})`.trim();
            if (hasProject) newItem["PROYECTO"] = `${item.project?.project_number || ''} - ${item.project?.name || ''}`.trim();
            if (hasContact) newItem["CONTACTO / PROV."] = item.contact?.name || '-';

            finalKeys.forEach(key => {
                const label = COLUMN_MAP[key] || key.toUpperCase();
                let rawVal = item[key];
                if (typeof rawVal === 'number') {
                    newItem[label] = Number(rawVal.toFixed(2));
                } else {
                    newItem[label] = processValue(rawVal, key);
                }
            });
            return newItem;
        });

        return { headers, rows, excelData };
    };

    const handleDownload = async (tableId: string, label: string, format: 'PDF' | 'EXCEL', groupId: string) => {
        try {
            setLoading(`${tableId}-${format}`);
            const filters: any = {};
            if (fromDate) filters.fromDate = fromDate;
            if (toDate) filters.toDate = toDate;
            if (selectedProjectId !== 'all' && (groupId === 'finance' || groupId === 'sales' || groupId === 'logistics')) {
                filters.projectId = selectedProjectId;
            }

            const data = await api.getTableData(tableId, filters);
            
            if (!data || data.length === 0) {
                setAlertConfig({
                    open: true,
                    title: '¡Sin Registros!',
                    message: `No se encontraron datos para la tabla "${label}" con los filtros seleccionados.`
                });
                return;
            }

            const { headers, rows, excelData } = filterAndTranslateData(data);
            if (format === 'EXCEL') {
                exportToExcel(excelData, label.replace(/\s+/g, '_'));
            } else {
                exportToPDF(`${label} ${selectedProjectId !== 'all' ? '(Filtrado)' : ''}`, headers, rows, label.replace(/\s+/g, '_'));
            }
        } catch (error) {
            console.error(error);
            setAlertConfig({ open: true, title: 'Error', message: 'No se pudo conectar con la base de datos.' });
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="pb-12 animate-in fade-in duration-500">
            <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-slate-200/50 shadow-sm transition-all duration-300">
                <div className="max-w-7xl mx-auto px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                            <span className="material-symbols-outlined text-white">storage</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic">Base de Datos Operativa</h1>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest hidden md:block">Gestión Maestra de Información</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-100/50 p-1.5 rounded-[1.5rem] border border-slate-200/50">
                        <div className="flex items-center gap-2 px-3">
                            <span className="material-symbols-outlined text-slate-400 text-sm">calendar_month</span>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Desde:</span>
                            <input 
                                type="date" 
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-700 outline-none p-1 rounded-lg"
                            />
                        </div>
                        <div className="w-px h-6 bg-slate-200 mx-1"></div>
                        <div className="flex items-center gap-2 px-3">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Hasta:</span>
                            <input 
                                type="date" 
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-700 outline-none p-1 rounded-lg"
                            />
                        </div>
                        {(fromDate || toDate) && (
                            <button onClick={() => { setFromDate(''); setToDate(''); }} className="p-2 hover:bg-white text-rose-500 rounded-xl">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-8 mt-12 space-y-12">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {EXPORT_GROUPS.map((group) => (
                        <div key={group.name} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                            <div className="p-8 pb-4 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-${group.color}-600`}>
                                        <span className="material-symbols-outlined text-2xl">{group.icon}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{group.name}</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Reportes del Área</p>
                                    </div>
                                </div>

                                {group.id === 'finance' && (
                                    <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100 italic">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-emerald-500 text-lg">account_tree</span>
                                            <select 
                                                value={selectedProjectId}
                                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                                className="bg-transparent text-[10px] font-black text-slate-600 outline-none uppercase tracking-tighter"
                                            >
                                                <option value="all">TODOS LOS PROYECTOS</option>
                                                {projects.map(p => (
                                                    <option key={p.id} value={p.id}>{p.project_number} - {p.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {selectedProjectId !== 'all' && (
                                            <button 
                                                onClick={async () => {
                                                    try {
                                                        setLoading('master-project');
                                                        console.log("Starting master export for project:", selectedProjectId);
                                                        const [projectData, itemsData, collectionsData] = await Promise.all([
                                                            api.getTableData('projects', { projectId: selectedProjectId }),
                                                            api.getTableData('project_items', { projectId: selectedProjectId }),
                                                            api.getTableData('project_collections', { projectId: selectedProjectId })
                                                        ]);

                                                        const p = projectData[0];
                                                        if (!p) {
                                                            alert("No se encontraron datos generales para este proyecto.");
                                                            return;
                                                        }
                                                        
                                                        console.log("Data fetched successfully, generating PDF...");
                                                        exportProjectMasterPDF(p, itemsData, collectionsData);

                                                    } catch(e) { 
                                                        console.error("Master Export Click Error:", e);
                                                        alert("Error al procesar el reporte: " + (e as Error).message);
                                                    } finally { setLoading(null); }
                                                }}
                                                className="px-3 py-1.5 bg-indigo-600 text-white text-[9px] font-black rounded-lg animation-pulse shadow-lg shadow-indigo-100 flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                                                RESUMEN
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 p-6 space-y-1">
                                {group.tables.map((table) => (
                                    <div key={table.id} className="flex items-center justify-between p-4 rounded-3xl hover:bg-slate-50 transition-all group">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700 tracking-tight group-hover:text-slate-900">{table.label}</span>
                                            <span className="text-[9px] font-mono text-slate-400 font-black opacity-0 group-hover:opacity-100 transition-opacity">SOURCE: {table.id.toUpperCase()}</span>
                                        </div>
                                        <div className="flex bg-slate-100/50 p-1 rounded-xl">
                                            <button
                                                disabled={loading === `${table.id}-EXCEL`}
                                                onClick={() => handleDownload(table.id, table.label, 'EXCEL', group.id)}
                                                className="flex items-center gap-2 px-3 py-2 hover:bg-white text-emerald-700 disabled:opacity-50 rounded-lg text-[10px] font-black uppercase transition-all"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">description</span>
                                                {loading === `${table.id}-EXCEL` ? '...' : 'EXCEL'}
                                            </button>
                                            <button
                                                disabled={loading === `${table.id}-PDF`}
                                                onClick={() => handleDownload(table.id, table.label, 'PDF', group.id)}
                                                className="flex items-center gap-2 px-3 py-2 hover:bg-white text-rose-700 disabled:opacity-50 rounded-lg text-[10px] font-black uppercase transition-all border-l border-slate-200"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                                                {loading === `${table.id}-PDF` ? '...' : 'PDF'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {alertConfig.open && (
                <Modal isOpen={alertConfig.open} onClose={() => setAlertConfig({ ...alertConfig, open: false })}>
                    <div className="text-center p-8 space-y-6">
                        <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="material-symbols-outlined text-4xl">warning</span>
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">{alertConfig.title}</h3>
                            <p className="text-slate-500 font-medium leading-relaxed mt-2">{alertConfig.message}</p>
                        </div>
                        <button 
                            onClick={() => setAlertConfig({ ...alertConfig, open: false })}
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl"
                        >
                            Entendido
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
