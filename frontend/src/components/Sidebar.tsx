
import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import haceLogo from '../assets/hace_logo.png';

export function Sidebar() {
    const [isHovered, setIsHovered] = useState(false);

    // Auto-collapse globally for consistent UI
    const isCollapsed = !isHovered;
    const width = isCollapsed ? '80px' : '240px';

    const menuItems = [
        { to: '/', label: 'Resumen Proyecto', icon: 'dashboard_customize' },
        { to: '/presupuestador', label: 'Presupuestador', icon: 'calculate' },
        { to: '/optimizacion', label: 'Optimización', icon: 'grid_on' },
        { to: '/cotizaciones', label: 'Cotizaciones', icon: 'receipt_long' },
        { to: '/solicitudes', label: 'Solicitudes', icon: 'request_quote' },
        { to: '/sales-treasury', label: 'Ventas y Tesorería', icon: 'account_balance_wallet' },
        { to: '/inventory', label: 'Inventario', icon: 'inventory_2' },
        { to: '/personnel', label: 'Personal', icon: 'groups' },
        { to: '/settings', label: 'Configuración', icon: 'settings' },
    ];

    return (
        <aside
            className={`fixed left-0 top-0 h-screen z-[1000] flex flex-col transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] backface-hidden
                ${isCollapsed ? 'w-20' : 'w-72'} 
                bg-white/75 backdrop-blur-md 
                border-r border-white/30 [backface-visibility:hidden] [perspective:1000px]
                shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[8px_0_30px_-5px_rgba(0,0,0,0.3)]
                hover:shadow-[0_25px_60px_rgba(0,0,0,0.12)] dark:hover:shadow-[12px_0_40px_-5px_rgba(0,0,0,0.4)] overflow-hidden`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Branding - HACE ERP (Anchored Logo) */}
            <div className={`h-24 flex items-center transition-all duration-300 overflow-hidden`}>
                <div className="w-20 flex-shrink-0 flex items-center justify-center">
                    <img src={haceLogo} alt="HACE ERP" className="w-16 h-16 object-contain" />
                </div>
                {!isCollapsed && (
                    <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter italic uppercase animate-in slide-in-from-left-4 duration-500 whitespace-nowrap">
                        HACE <span className="text-indigo-600">ERP</span>
                    </h1>
                )}
            </div>

            {/* Navigation - Fixed Icon Rails */}
            <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {menuItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `flex items-center py-4 rounded-2xl transition-all duration-300 font-black text-[10px] uppercase tracking-widest relative group whitespace-nowrap
                            ${isActive
                                ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 translate-x-1 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                            }`
                        }
                    >
                        {/* Icon Rail - Stays in the exact same place during transition */}
                        <div className="w-14 flex-shrink-0 flex items-center justify-center ml-1">
                            <span className="material-icons-round text-[22px] transition-transform group-hover:scale-110 duration-300">
                                {item.icon}
                            </span>
                        </div>
                        
                        {!isCollapsed && (
                            <span className="flex-1 animate-in fade-in slide-in-from-left-2 duration-300 whitespace-nowrap overflow-hidden text-ellipsis mr-4">
                                {item.label}
                            </span>
                        )}

                        {/* Hover feedback dot for collapsed state */}
                        {isCollapsed && (
                            <div className="absolute left-0 w-1 h-6 bg-indigo-600 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* User Profile Footer - Anchored Avatar */}
            <div className={`p-4 mt-auto mb-4`}>
                <div className={`flex items-center gap-3 p-2 rounded-2xl transition-all duration-300 bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/5 shadow-sm whitespace-nowrap
                    ${!isCollapsed ? 'hover:scale-105 hover:bg-white/80 dark:hover:bg-white/10' : ''}`}>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center border border-white/20 shadow-md shrink-0">
                        <span className="font-black text-white text-[10px]">AU</span>
                    </div>
                    {!isCollapsed && (
                        <div className="overflow-hidden animate-in fade-in slide-in-from-left-2 duration-500 whitespace-nowrap">
                            <p className="text-[10px] font-black text-slate-900 dark:text-white truncate uppercase tracking-tighter">Admin Usuario</p>
                            <p className="text-[8px] font-bold text-slate-400 truncate uppercase tracking-widest">Jefe de Planta</p>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
