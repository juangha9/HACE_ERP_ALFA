import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import PresupuestadorDashboard from './PresupuestadorDashboard';

export default function PresupuestadorLayout() {
    const location = useLocation();

    // Determine if we are in the dashboard/index view or in a wizard flow
    // For now, if the path is exactly '/presupuestador', we show the Dashboard.
    // If it's a sub-route (e.g. '/presupuestador/new'), we might show the wizard.
    const isDashboard = location.pathname === '/presupuestador';

    return (
        <div className="flex w-full h-full bg-[#f6f6f8] dark:bg-slate-950 transition-colors duration-300">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative min-h-0 rounded-3xl">
                {/* 
                   If Dashboard: content flows naturally, so we need a scroll container wrapper here
                   because we constrained the parent height.
                   If Wizard: It manages its own internal flex scrolling, so we just render it.
                */}
                {isDashboard ? (
                    <div className="h-full overflow-y-auto custom-scrollbar pr-2">
                        <PresupuestadorDashboard />
                    </div>
                ) : (
                    <Outlet />
                )}
            </div>
        </div>
    );
}
