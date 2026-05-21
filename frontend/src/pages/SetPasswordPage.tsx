import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import haceLogo from '../assets/hace_logo.png';

export function SetPasswordPage() {
    const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'success'>('loading');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        // Supabase fires PASSWORD_RECOVERY when the user arrives via a recovery link.
        // The client automatically parses the token hash from the URL.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setStatus('ready');
            }
        });

        // If the token was already exchanged (e.g. page reload), check the session.
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setStatus(s => s === 'loading' ? 'ready' : s);
        });

        // If nothing fires within 3 s, the link is invalid or expired.
        const timeout = setTimeout(() => {
            setStatus(s => s === 'loading' ? 'error' : s);
        }, 3000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(timeout);
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 6) {
            setFormError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        if (password !== confirmPassword) {
            setFormError('Las contraseñas no coinciden.');
            return;
        }
        setBusy(true);
        setFormError('');
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
            setFormError('No se pudo actualizar la contraseña. Intenta de nuevo.');
            setBusy(false);
        } else {
            setStatus('success');
            setTimeout(() => navigate('/login', { replace: true }), 2500);
        }
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #f0f5f4 0%, #e4edf0 45%, #d8e8ec 100%)' }}
        >
            {/* ── Animated background orbs ── */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
                <div
                    className="absolute rounded-full login-orb-slow"
                    style={{
                        width: '560px', height: '560px',
                        background: 'radial-gradient(circle, rgba(54,100,128,0.22) 0%, transparent 70%)',
                        top: '-14%', left: '-8%',
                    }}
                />
                <div
                    className="absolute rounded-full login-orb-medium"
                    style={{
                        width: '420px', height: '420px',
                        background: 'radial-gradient(circle, rgba(44,82,104,0.18) 0%, transparent 70%)',
                        bottom: '-8%', right: '-6%',
                    }}
                />
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(54,100,128,0.08) 1.5px, transparent 1.5px)',
                        backgroundSize: '36px 36px',
                    }}
                />
            </div>

            {/* ── Card ── */}
            <div className="relative z-10 w-full max-w-[360px] mx-4 login-card-enter">
                <div
                    className="rounded-[32px] p-8"
                    style={{
                        background: 'rgba(255,255,255,0.88)',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 32px 80px rgba(54,100,128,0.16), 0 0 0 1px rgba(255,255,255,0.8) inset',
                    }}
                >
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
                            <img src={haceLogo} alt="HACE" className="w-16 h-16 object-contain" />
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
                            {status === 'success' ? 'Contraseña Actualizada' : 'Configurar Contraseña'}
                        </p>
                    </div>

                    {/* ── Loading ── */}
                    {status === 'loading' && (
                        <div className="flex flex-col items-center py-6 gap-4">
                            <span
                                className="w-8 h-8 rounded-full animate-spin"
                                style={{
                                    border: '3px solid rgba(54,100,128,0.2)',
                                    borderTopColor: '#366480',
                                }}
                            />
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                Verificando enlace...
                            </p>
                        </div>
                    )}

                    {/* ── Error: invalid or expired link ── */}
                    {status === 'error' && (
                        <div className="flex flex-col gap-4">
                            <div
                                className="flex items-start gap-2 px-3.5 py-3 rounded-xl text-rose-600 text-xs font-bold"
                                style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}
                            >
                                <span className="material-icons-round text-[16px] shrink-0 mt-0.5">error_outline</span>
                                <span>
                                    Este enlace es inválido o ya expiró. Solicita uno nuevo al administrador del sistema.
                                </span>
                            </div>
                            <button
                                onClick={() => navigate('/login')}
                                className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-[0.12em] transition-all"
                                style={{
                                    color: '#366480',
                                    border: '1.5px solid rgba(54,100,128,0.25)',
                                    background: 'transparent',
                                }}
                            >
                                Volver al inicio de sesión
                            </button>
                        </div>
                    )}

                    {/* ── Success ── */}
                    {status === 'success' && (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                                <span className="material-icons-round text-[36px] text-emerald-500">
                                    check_circle
                                </span>
                            </div>
                            <p className="text-[13px] font-bold text-slate-500 text-center leading-relaxed">
                                Tu contraseña fue actualizada correctamente.
                                <br />
                                Redirigiendo al inicio de sesión...
                            </p>
                        </div>
                    )}

                    {/* ── Form: set new password ── */}
                    {status === 'ready' && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <p className="text-[11px] font-bold text-slate-400 text-center -mt-2">
                                Crea una contraseña segura para tu cuenta.
                            </p>

                            {/* Nueva contraseña */}
                            <div>
                                <label
                                    className="block text-[10px] font-black uppercase tracking-widest mb-1.5 pl-1"
                                    style={{ color: '#8b9ba5' }}
                                >
                                    Nueva Contraseña
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
                                        placeholder="Mínimo 6 caracteres"
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

                            {/* Confirmar contraseña */}
                            <div>
                                <label
                                    className="block text-[10px] font-black uppercase tracking-widest mb-1.5 pl-1"
                                    style={{ color: '#8b9ba5' }}
                                >
                                    Confirmar Contraseña
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
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        required
                                        placeholder="Repite la contraseña"
                                        className="login-input w-full pl-10 pr-4 py-3 text-sm font-bold rounded-xl outline-none transition-all"
                                        style={{ background: '#f0f5f4', color: '#2c3434', border: '1.5px solid transparent' }}
                                    />
                                </div>
                            </div>

                            {/* Error de validación */}
                            {formError && (
                                <div
                                    className="flex items-center gap-2 px-3.5 py-3 rounded-xl text-rose-600 text-xs font-bold login-error-shake"
                                    style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}
                                >
                                    <span className="material-icons-round text-[16px] shrink-0">error_outline</span>
                                    {formError}
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
                                        Actualizando...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        Confirmar contraseña
                                        <span className="material-icons-round text-[16px]">arrow_forward</span>
                                    </span>
                                )}
                            </button>
                        </form>
                    )}

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
