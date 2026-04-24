import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

export default function InventoryLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [fontsLoaded, setFontsLoaded] = useState(() => {
        if (typeof document !== 'undefined' && document.fonts && (document.fonts as any).check) {
            return (document.fonts as any).check('24px "Material Symbols Outlined"');
        }
        return false;
    });

    useEffect(() => {
        if (!fontsLoaded && document.fonts && document.fonts.load) {
            document.fonts.load('24px "Material Symbols Outlined"').then(() => {
                setFontsLoaded(true);
            }).catch(() => {
                setFontsLoaded(true); 
            });
        }
        // Force show after a safe timeout even if loading hangs
        const timer = setTimeout(() => setFontsLoaded(true), 1200);
        return () => clearTimeout(timer);
    }, [fontsLoaded]);

    const isActive = (path: string) => location.pathname.includes(path);

    if (!fontsLoaded) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-slate-900 w-full">
                <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-800 border-t-indigo-600 dark:border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Iniciando Portal de Inventario...</p>
            </div>
        );
    }


    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans transition-colors duration-300">
            {/* Sidebar */}
            <aside className="w-64 bg-[#f8fafc] dark:bg-slate-900 text-slate-500 dark:text-slate-400 flex flex-col shadow-xl z-20 border-r border-slate-200 dark:border-slate-800 transition-colors duration-300">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className="size-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20">
                        <span className="material-symbols-outlined text-white">inventory_2</span>
                    </div>
                    <div>
                        <h1 className="font-black text-lg tracking-tight leading-none text-slate-900 dark:text-white">Logística</h1>
                        <p className="text-[10px] text-slate-400 font-medium tracking-widest uppercase mt-1">Control de Stock</p>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 mt-2 px-2">Principal</div>

                    <button
                        onClick={() => navigate('/inventory')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${location.pathname === '/inventory'
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
                            }`}
                    >
                        <span className={`material-symbols-outlined ${location.pathname === '/inventory' ? 'filled' : ''}`}>dashboard</span>
                        <span className="text-xs">Dashboard</span>
                    </button>

                    <button
                        onClick={() => navigate('/inventory/catalog')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${isActive('/inventory/catalog')
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
                            }`}
                    >
                        <span className="material-symbols-outlined">category</span>
                        <span className="text-xs">Catálogo</span>
                    </button>

                    <button
                        onClick={() => navigate('/inventory/list')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${isActive('/inventory/list')
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
                            }`}
                    >
                        <span className="material-symbols-outlined">dataset</span>
                        <span className="text-xs">Inventario</span>
                    </button>

                    <button
                        onClick={() => navigate('/inventory/movements')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${isActive('/inventory/movements')
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
                            }`}
                    >
                        <span className="material-symbols-outlined">swap_horiz</span>
                        <span className="text-xs">Movimientos (Kardex)</span>
                    </button>

                    <button
                        onClick={() => navigate('/inventory/locations')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${isActive('/inventory/locations')
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
                            }`}
                    >
                        <span className="material-symbols-outlined">map</span>
                        <span className="text-xs">Ubicaciones</span>
                    </button>

                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 mt-6 px-2">Gestión</div>

                    <button
                        onClick={() => navigate('/inventory/contacts')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${isActive('/inventory/contacts')
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
                            }`}
                    >
                        <span className="material-symbols-outlined">contacts</span>
                        <span className="text-xs">Directorio</span>
                    </button>

                    <button
                        onClick={() => navigate('/inventory/reports')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${isActive('/inventory/reports')
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
                            }`}
                    >
                        <span className="material-symbols-outlined">summarize</span>
                        <span className="text-xs">Reportes</span>
                    </button>

                    <button
                        onClick={() => navigate('/inventory/requests')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${isActive('/inventory/requests')
                            ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
                            }`}
                    >
                        <span className="material-symbols-outlined text-rose-500">warning</span>
                        <span className="text-xs">Solicitudes</span>
                    </button>

                    <button
                        onClick={() => navigate('/dashboard')}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all mt-8 font-medium"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                        <span className="text-xs">Volver al ERP</span>
                    </button>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-x-hidden overflow-y-auto relative bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
                <div className="p-8 pb-32">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
