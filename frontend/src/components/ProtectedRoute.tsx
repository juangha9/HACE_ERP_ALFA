import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, ROLE_ALLOWED_PATHS, ROLE_HOME } from '../context/AuthContext';
import type { UserRole } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, profile, loading } = useAuth();
    const location = useLocation();

    // Show branded loading screen while restoring session
    if (loading) {
        return (
            <div
                className="fixed inset-0 flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #f0f5f4 0%, #e4edf0 100%)' }}
            >
                <div className="flex flex-col items-center gap-4">
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(145deg, #366480, #2c5268)',
                            boxShadow: '0 8px 24px rgba(54,100,128,0.30)',
                        }}
                    >
                        <span
                            className="w-6 h-6 rounded-full border-2 animate-spin"
                            style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                        />
                    </div>
                    <p
                        className="text-[10px] font-black uppercase tracking-[0.2em]"
                        style={{ color: '#8b9ba5' }}
                    >
                        Cargando...
                    </p>
                </div>
            </div>
        );
    }

    // Not authenticated → go to login
    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Check role-based path access
    const role: UserRole = (profile?.role as UserRole) ?? 'admin';
    const allowed = ROLE_ALLOWED_PATHS[role] ?? ['*'];

    if (!allowed.includes('*')) {
        const ok = allowed.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
        if (!ok) {
            return <Navigate to={ROLE_HOME[role] ?? '/'} replace />;
        }
    }

    return <>{children}</>;
}
