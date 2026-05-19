import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BusinessSettingsCard } from '../components/BusinessSettingsCard';
import { SuppliersModal } from '../components/settings/SuppliersModal';
import { ControlledMaterialsModal } from '../components/settings/ControlledMaterialsModal';
import { useTheme } from '../context/ThemeContext';

export default function SettingsPage() {
    const { theme, toggleTheme } = useTheme();
    const [showSuppliers, setShowSuppliers] = useState(false);
    const [showControlled, setShowControlled] = useState(false);
    const [fontsLoaded, setFontsLoaded] = useState(false);

    useEffect(() => {
        if ('fonts' in document) {
            document.fonts.ready.then(() => setFontsLoaded(true));
        } else {
            setFontsLoaded(true);
        }
    }, []);

    return (
        <>
            <div 
                key={!fontsLoaded ? 'loading' : 'content'}
                className={`p-8 max-w-7xl mx-auto space-y-8 animate-premium-fade`}
            >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-[2rem] bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                        <span className="material-symbols-outlined text-3xl text-white">settings</span>
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic">Configuración</h1>
                        <p className="text-slate-400 dark:text-slate-500 font-medium">Administra los parámetros generales del sistema</p>
                    </div>
                </div>

                <button
                    onClick={toggleTheme}
                    className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 shadow-sm group"
                >
                    <span className="material-icons-round text-2xl group-hover:rotate-12 transition-transform">
                        {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                    </span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Cost Configuration Card */}
                <Link to="/configuracion-costos" className="group">
                    <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(6,11,40,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-2xl">attach_money</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Configuración de Costos</h3>
                        <p className="text-sm text-slate-400 font-medium leading-relaxed">
                            Gestiona tarifas de fletes, logística, costos de insumos, desgaste de maquinaria y márgenes de utilidad.
                        </p>
                    </div>
                </Link>

                {/* Business Settings Card */}
                <BusinessSettingsCard />

                {/* Warehouse Configuration Card */}
                <Link to="/configuracion-almacen" className="group">
                    <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(6,11,40,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-2xl">account_tree</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Configuración de Almacén</h3>
                        <p className="text-sm text-slate-400 font-medium leading-relaxed">
                            Gestiona la jerarquía de categorías, familias y subfamilias, y administra la generación automática de códigos SKU.
                        </p>
                    </div>
                </Link>

                {/* Controlled Materials Card */}
                <button onClick={() => setShowControlled(true)} className="group text-left focus:outline-none">
                    <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(6,11,40,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 mb-6 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-2xl">verified_user</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Materiales Controlados</h3>
                        <p className="text-sm text-slate-400 font-medium leading-relaxed">
                            Define el umbral de similitud para detectar tableros del catálogo y aplicar precios mínimos en cotizaciones.
                        </p>
                    </div>
                </button>

                {/* Database Export Card */}
                <Link to="/base-de-datos" className="group">
                    <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(6,11,40,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full">
                        <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white mb-6 group-hover:bg-indigo-600 transition-colors">
                            <span className="material-symbols-outlined text-2xl">database</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Base de Datos</h3>
                        <p className="text-sm text-slate-400 font-medium leading-relaxed">
                            Extrae y descarga reportes completos de toda la operación (Logística, Proyectos, RRHH, etc) en formatos PDF y Excel.
                        </p>
                    </div>
                </Link>

                {/* Suppliers (Proveedores) Card */}
                <button onClick={() => setShowSuppliers(true)} className="group text-left focus:outline-none">
                    <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(6,11,40,0.1)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 mb-6 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-2xl">local_shipping</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Proveedores</h3>
                        <p className="text-sm text-slate-400 font-medium leading-relaxed">
                            Administra el catálogo de proveedores, datos bancarios (CCI) e información de contacto.
                        </p>
                    </div>
                </button>
            </div>
        </div>

        {showSuppliers && (
            <SuppliersModal
                isOpen={showSuppliers}
                onClose={() => setShowSuppliers(false)}
            />
        )}
        <ControlledMaterialsModal
            isOpen={showControlled}
            onClose={() => setShowControlled(false)}
        />
    </>
    );
};
