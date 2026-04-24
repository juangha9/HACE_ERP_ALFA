import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {

    return (
        <div className="flex bg-[#f8fafc] dark:bg-slate-900 overflow-hidden" style={{ height: '100vh', width: '100vw' }}>
            <Sidebar />
            
            {/* Sidebar Spacer - To keep layout stable since sidebar is now absolute */}
            <div className="w-20 shrink-0 h-full" />

            <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative shadow-inner">
                {/* Scrollable Viewport - Padding removed as requested to use full space */}
                <div id="main-scroll-container" className="flex-1 overflow-y-auto overflow-x-hidden main-scroll-container">
                    <div className="w-full h-full">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
