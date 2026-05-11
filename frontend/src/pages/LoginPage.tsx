import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLE_HOME } from '../context/AuthContext';
import type { UserRole } from '../context/AuthContext';
import haceLogo from '../assets/hace_logo.png';

export function LoginPage() {
    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [busy,     setBusy]     = useState(false);
    const [error,    setError]    = useState('');
    const [errorKey, setErrorKey] = useState(0); // re-triggers shake animation

    const { signIn, user, profile, loading } = useAuth();
    const navigate = useNavigate();

    // Redirect when already authenticated and profile is known
    useEffect(() => {
        if (!loading && user) {
            const role = (profile?.role as UserRole) || 'admin';
            navigate(ROLE_HOME[role] ?? '/', { replace: true });
        }
    }, [user, profile, loading, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password) return;
        setBusy(true);
        setError('');
        const { error } = await signIn(email.trim(), password);
        if (error) {
            setError('Credenciales incorrectas. Verifica tu correo y contraseña.');
            setErrorKey(k => k + 1);
            setBusy(false);
        }
        // On success: onAuthStateChange fires → profile loads → useEffect above redirects
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #f0f5f4 0%, #e4edf0 45%, #d8e8ec 100%)' }}
        >
            {/* ── Animated background orbs ── */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
                {/* Top-left large orb */}
                <div
                    className="absolute rounded-full login-orb-slow"
                    style={{
                        width: '560px', height: '560px',
                        background: 'radial-gradient(circle, rgba(54,100,128,0.22) 0%, transparent 70%)',
                        top: '-14%', left: '-8%',
                    }}
                />
                {/* Bottom-right medium orb */}
                <div
                    className="absolute rounded-full login-orb-medium"
                    style={{
                        width: '420px', height: '420px',
                        background: 'radial-gradient(circle, rgba(44,82,104,0.18) 0%, transparent 70%)',
                        bottom: '-8%', right: '-6%',
                    }}
                />
                {/* Centre-right small orb */}
                <div
                    className="absolute rounded-full login-orb-fast"
                    style={{
                        width: '260px', height: '260px',
                        background: 'radial-gradient(circle, rgba(54,100,128,0.12) 0%, transparent 70%)',
                        top: '35%', right: '12%',
                    }}
                />
                {/* Dot grid */}
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(54,100,128,0.08) 1.5px, transparent 1.5px)',
                        backgroundSize: '36px 36px',
                    }}
                />
            </div>

            {/* ── Login card ── */}
            <div className="relative z-10 w-full max-w-[360px] mx-4 login-card-enter">
                <div
                    className="rounded-[32px] p-8"
                    style={{
                        background: 'rgba(255,255,255,0.88)',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 32px 80px rgba(54,100,128,0.16), 0 0 0 1px rgba(255,255,255,0.8) inset',
                    }}
                >
                    {/* Top highlight edge */}
                    <div
                        className="absolute top-0 left-0 right-0 h-px rounded-t-[32px]"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)' }}
                    />

                    {/* ── Branding ── */}
                    <div className="flex flex-col items-center mb-8">
                        <div
                            className="w-20 h-20 rounded-[22px] flex items-center justify-center mb-4 bg-white"
                            style={{
                                boxShadow: '0 12px 30px rgba(54,100,128,0.15)',
                                border: '1px solid rgba(54,100,128,0.1)',
                            }}
                        >
                            <img
                                src={haceLogo}
                                alt="HACE"
                                className="w-16 h-16 object-contain"
                            />
                        </div>
                        <h1
                            className="text-2xl font-black tracking-tight"
                            style={{ color: '#2c3434' }}
                        >
                            HACE{' '}
                            <span style={{ color: '#366480' }}>ERP</span>
                        </h1>
                        <p
                            className="text-[10px] font-black uppercase tracking-[0.2em] mt-1"
                            style={{ color: '#8b9ba5' }}
                        >
                            Sistema de Gestión
                        </p>
                    </div>

                    {/* ── Form ── */}
                    <form onSubmit={handleSubmit} className="space-y-4">

                        {/* Email */}
                        <div>
                            <label
                                className="block text-[10px] font-black uppercase tracking-widest mb-1.5 pl-1"
                                style={{ color: '#8b9ba5' }}
                            >
                                Correo Electrónico
                            </label>
                            <div className="relative">
                                <span
                                    className="material-icons-round absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none"
                                    style={{ color: '#b0bec7' }}
                                >
                                    mail_outline
                                </span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                    placeholder="correo@empresa.com"
                                    className="login-input w-full pl-10 pr-4 py-3 text-sm font-bold rounded-xl outline-none transition-all"
                                    style={{ background: '#f0f5f4', color: '#2c3434', border: '1.5px solid transparent' }}
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label
                                className="block text-[10px] font-black uppercase tracking-widest mb-1.5 pl-1"
                                style={{ color: '#8b9ba5' }}
                            >
                                Contraseña
                            </label>
                            <div className="relative">
                                <span
                                    className="material-icons-round absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none"
                                    style={{ color: '#b0bec7' }}
                                >
                                    lock_outline
                                </span>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    className="login-input w-full pl-10 pr-12 py-3 text-sm font-bold rounded-xl outline-none transition-all"
                                    style={{ background: '#f0f5f4', color: '#2c3434', border: '1.5px solid transparent' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(p => !p)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                                    style={{ color: '#b0bec7' }}
                                    tabIndex={-1}
                                >
                                    <span className="material-icons-round text-[18px]">
                                        {showPass ? 'visibility_off' : 'visibility'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Error message */}
                        {error && (
                            <div
                                key={errorKey}
                                className="flex items-center gap-2 px-3.5 py-3 rounded-xl text-rose-600 text-xs font-bold login-error-shake"
                                style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}
                            >
                                <span className="material-icons-round text-[16px] shrink-0">error_outline</span>
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={busy}
                            className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-[0.12em] text-white transition-all mt-1 relative overflow-hidden login-btn"
                            style={{
                                background: busy
                                    ? '#a0b5be'
                                    : 'linear-gradient(135deg, #366480 0%, #2c5268 100%)',
                                boxShadow: busy
                                    ? 'none'
                                    : '0 8px 24px rgba(54,100,128,0.30)',
                            }}
                        >
                            {busy ? (
                                <span className="flex items-center justify-center gap-2.5">
                                    <span
                                        className="w-4 h-4 rounded-full border-2 animate-spin"
                                        style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                                    />
                                    Verificando...
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    Ingresar
                                    <span className="material-icons-round text-[16px]">arrow_forward</span>
                                </span>
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <p
                        className="text-center text-[9px] font-bold uppercase tracking-[0.18em] mt-7"
                        style={{ color: '#c5d0d4' }}
                    >
                        HACE SAC © {new Date().getFullYear()}
                    </p>
                </div>
            </div>
        </div>
    );
}
