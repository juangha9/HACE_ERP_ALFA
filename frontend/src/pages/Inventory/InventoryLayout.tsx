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

    const tabs = [
        { path: '/inventory', label: 'Dashboard', icon: 'dashboard', exact: true },
        { path: '/inventory/catalog', label: 'Catálogo', icon: 'category' },
        { path: '/inventory/list', label: 'Inventario', icon: 'dataset' },
        { path: '/inventory/movements', label: 'Kardex', icon: 'swap_horiz' },
        { path: '/inventory/locations', label: 'Ubicaciones', icon: 'map' },
        { path: '/inventory/contacts', label: 'Directorio', icon: 'contacts' },
        { path: '/inventory/reports', label: 'Reportes', icon: 'summarize' },
        { path: '/inventory/requests', label: 'Solicitudes', icon: 'warning', danger: true },
    ];

    const tabIsActive = (tab: { path: string; exact?: boolean }) =>
        tab.exact ? location.pathname === tab.path : isActive(tab.path);

    if (!fontsLoaded) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-slate-900 w-full">
                <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-800 border-t-indigo-600 dark:border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Iniciando Portal de Inventario...</p>
            </div>
        );
    }


    return (
        <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans transition-colors duration-300">
            {/* Top Navigation (Pestañas) */}
            <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-20 transition-colors duration-300">
                <nav className="flex items-stretch gap-1 px-4 overflow-x-auto">
                    {tabs.map((tab) => {
                        const active = tabIsActive(tab);
                        const activeColor = tab.danger
                            ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                            : 'border-indigo-600 text-indigo-600 dark:text-indigo-400';
                        return (
                            <button
                                key={tab.path}
                                onClick={() => navigate(tab.path)}
                                className={`flex items-center gap-2 px-4 py-4 border-b-2 whitespace-nowrap text-xs transition-all ${active
                                    ? `${activeColor} font-bold`
                                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 font-medium'
                                    }`}
                            >
                                <span className={`material-symbols-outlined text-[20px] ${tab.danger ? 'text-rose-500' : ''} ${active && tab.exact ? 'filled' : ''}`}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-x-hidden overflow-y-auto relative bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
                <div className="p-8 h-full">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
