import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'ventas' | 'asistente_admin' | 'administrador';

export interface Profile {
    id: string;
    full_name: string;
    role: UserRole;
}

// Routes each role can access. '*' means unrestricted.
export const ROLE_ALLOWED_PATHS: Record<UserRole, string[]> = {
    admin:          ['*'],
    ventas:         ['/cotizaciones'],
    asistente_admin:['/sales-treasury'],
    administrador:  ['/sales-treasury', '/administrador', '/personnel', '/settings'],
};

// Default landing page after login (or unauthorized redirect)
export const ROLE_HOME: Record<UserRole, string> = {
    admin:          '/',
    ventas:         '/cotizaciones',
    asistente_admin:'/sales-treasury',
    administrador:  '/sales-treasury',
};

// Human-readable label shown in the sidebar
export const ROLE_LABEL: Record<UserRole, string> = {
    admin:          'Administrador',
    ventas:         'Ventas',
    asistente_admin:'Asistente Admin',
    administrador:  'Administrador',
};

interface AuthContextType {
    user:    User    | null;
    session: Session | null;
    profile: Profile | null;
    loading: boolean;
    signIn:  (email: string, password: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ── Profile cache ──────────────────────────────────────────────────────────
// Reading the profile from localStorage before the network round-trip lets us
// paint the correct sidebar/role instantly on reload, instead of waiting for
// the auth listener + the profiles query (which adds ~300ms of latency).
const CACHE_KEY = 'hace_cached_profile';

const readCachedProfile = (): Profile | null => {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw);
        return (p && p.id && p.role) ? p as Profile : null;
    } catch { return null; }
};

const writeCachedProfile = (p: Profile | null) => {
    try {
        if (p) localStorage.setItem(CACHE_KEY, JSON.stringify(p));
        else   localStorage.removeItem(CACHE_KEY);
    } catch {}
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user,    setUser]    = useState<User    | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    // Seed profile from cache so the first paint already has the correct role.
    const [profile, setProfile] = useState<Profile | null>(() => readCachedProfile());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted        = true;
        let listenerFired  = false;

        const handleSession = async (sess: Session | null) => {
            if (!mounted) return;
            listenerFired = true;
            setSession(sess);
            setUser(sess?.user ?? null);

            // No session → land on /login with no loading lag.
            if (!sess?.user) {
                setProfile(null);
                writeCachedProfile(null);
                setLoading(false);
                return;
            }

            // Fast path: cached profile matches the live user — paint the
            // right sidebar/role instantly, refresh from DB in background.
            const cached = readCachedProfile();
            const cacheHit = !!cached && cached.id === sess.user.id;
            if (cacheHit) {
                setProfile(cached);
                setLoading(false);
            } else {
                // Cache miss (first login, different user, cleared storage).
                // Keep loading=true so consumers (LoginPage, ProtectedRoute,
                // Sidebar) never see the admin fallback flash before the real
                // role arrives.
                setProfile(null);
                setLoading(true);
            }

            // Refresh from DB. Promise.race adds a hard ceiling so a hung
            // network does not leave the UI stuck on the spinner.
            try {
                const result = await Promise.race([
                    supabase
                        .from('profiles')
                        .select('id, full_name, role')
                        .eq('id', sess.user.id)
                        .single(),
                    new Promise<{ data: null }>((_, reject) =>
                        setTimeout(() => reject(new Error('profile_timeout')), 3000)
                    ),
                ]);
                if (!mounted) return;
                const fresh = ((result as { data: Profile | null }).data) ?? null;
                setProfile(fresh);
                writeCachedProfile(fresh);
            } catch {
                if (mounted) setProfile(null);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        // Primary: auth listener. In Supabase v2, INITIAL_SESSION fires per
        // subscription, so each StrictMode mount gets its own initial event.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, newSession) => { void handleSession(newSession); }
        );

        // Backup: explicit lookup if the listener never fires.
        supabase.auth.getSession()
            .then(({ data }) => { if (!listenerFired) void handleSession(data.session); })
            .catch(() => { if (!listenerFired && mounted) setLoading(false); });

        // Hard safety net so the UI never stays stuck on first init.
        const safety = setTimeout(() => {
            if (!listenerFired && mounted) setLoading(false);
        }, 2500);

        return () => {
            mounted = false;
            clearTimeout(safety);
            subscription.unsubscribe();
        };
    }, []);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
    };

    const signOut = async () => {
        writeCachedProfile(null);
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, session, profile, loading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
