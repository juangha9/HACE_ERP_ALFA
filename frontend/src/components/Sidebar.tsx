
import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import haceLogo from '../assets/hace_logo.png';
import { useAuth, ROLE_LABEL } from '../context/AuthContext';
import type { UserRole } from '../context/AuthContext';

const ALL_MENU_ITEMS = [
    { to: '/',              label: 'Resumen Proyecto',  icon: 'dashboard_customize', roles: ['admin'] as UserRole[] },
    { to: '/presupuestador',label: 'Presupuestador',    icon: 'calculate',           roles: ['admin'] as UserRole[] },
    { to: '/optimizacion',  label: 'Optimización',      icon: 'grid_on',             roles: ['admin'] as UserRole[] },
    { to: '/cotizaciones',  label: 'Cotizaciones',      icon: 'receipt_long',        roles: ['admin', 'ventas'] as UserRole[] },
    { to: '/solicitudes',   label: 'Solicitudes',       icon: 'request_quote',       roles: ['admin'] as UserRole[] },
    { to: '/sales-treasury',label: 'Ventas y Tesorería',icon: 'account_balance_wallet', roles: ['admin', 'asistente_admin'] as UserRole[] },
    { to: '/inventory',     label: 'Inventario',        icon: 'inventory_2',         roles: ['admin'] as UserRole[] },
    { to: '/personnel',     label: 'Personal',          icon: 'groups',              roles: ['admin'] as UserRole[] },
    { to: '/settings',      label: 'Configuración',     icon: 'settings',            roles: ['admin'] as UserRole[] },
];

export function Sidebar() {
    const [isHovered, setIsHovered] = useState(false);
    const { profile, signOut } = useAuth();
    const navigate = useNavigate();

    const isCollapsed = !isHovered;
    const role: UserRole = (profile?.role as UserRole) ?? 'admin';

    const menuItems = ALL_MENU_ITEMS.filter(item => item.roles.includes(role));

    const initials = profile?.full_name
        ? profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
        : 'AU';

    const handleLogout = async () => {
        await signOut();
        navigate('/login', { replace: true });
    };

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
            {/* Branding */}
            <div className="h-24 flex items-center transition-all duration-300 overflow-hidden">
                <div className="w-20 flex-shrink-0 flex items-center justify-center">
                    <img src={haceLogo} alt="HACE ERP" className="w-16 h-16 object-contain" />
                </div>
                {!isCollapsed && (
                    <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter italic uppercase animate-in slide-in-from-left-4 duration-500 whitespace-nowrap">
                        HACE <span style={{ color: '#366480' }}>ERP</span>
                    </h1>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {menuItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                            `flex items-center py-4 rounded-2xl transition-all duration-300 font-black text-[10px] uppercase tracking-widest relative group whitespace-nowrap
                            ${isActive
                                ? 'text-white translate-x-1 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                            }`
                        }
                        style={({ isActive }) => isActive
                            ? { background: 'linear-gradient(135deg, #366480, #2c5268)', boxShadow: '0 4px 14px rgba(54,100,128,0.30)' }
                            : {}
                        }
                    >
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

                        {isCollapsed && (
                            <div
                                className="absolute left-0 w-1 h-6 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: '#366480' }}
                            />
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* User Profile Footer */}
            <div className="p-4 mt-auto mb-4 space-y-2">
                {/* Logout button */}
                <button
                    onClick={handleLogout}
                    className={`w-full flex items-center rounded-2xl transition-all duration-300 text-slate-400 hover:text-rose-500 hover:bg-rose-50/60 dark:hover:bg-rose-500/10 whitespace-nowrap
                        ${isCollapsed ? 'justify-center py-3' : 'gap-3 px-4 py-3'}`}
                    title="Cerrar sesión"
                >
                    <span className="material-icons-round text-[20px] shrink-0">logout</span>
                    {!isCollapsed && (
                        <span className="text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-left-2 duration-300">
                            Cerrar Sesión
                        </span>
                    )}
                </button>

                {/* User card */}
                <div
                    className={`flex items-center gap-3 p-2 rounded-2xl transition-all duration-300 bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/5 shadow-sm whitespace-nowrap
                        ${!isCollapsed ? 'hover:scale-105 hover:bg-white/80 dark:hover:bg-white/10' : ''}`}
                >
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/20 shadow-md shrink-0"
                        style={{ background: 'linear-gradient(135deg, #366480, #2c5268)' }}
                    >
                        <span className="font-black text-white text-[11px]">{initials}</span>
                    </div>
                    {!isCollapsed && (
                        <div className="overflow-hidden animate-in fade-in slide-in-from-left-2 duration-500 whitespace-nowrap">
                            <p className="text-[10px] font-black text-slate-900 dark:text-white truncate uppercase tracking-tighter">
                                {profile?.full_name || 'Usuario'}
                            </p>
                            <p className="text-[8px] font-bold text-slate-400 truncate uppercase tracking-widest">
                                {ROLE_LABEL[role]}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
