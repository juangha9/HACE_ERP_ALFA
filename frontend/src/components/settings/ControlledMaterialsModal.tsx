import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { appSettingsService, SETTING_KEYS } from '../../services/appSettingsService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const DEFAULT_THRESHOLD = 0.75;

export function ControlledMaterialsModal({ isOpen, onClose }: Props) {
    const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
    const [savedThreshold, setSavedThreshold] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [closing, setClosing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setClosing(false);
        setSuccess(false);
        setError(null);
        setSavedThreshold(null);
        setLoading(true);
        appSettingsService.invalidate(SETTING_KEYS.CONTROLLED_SIMILARITY_THRESHOLD);
        appSettingsService
            .get<number>(SETTING_KEYS.CONTROLLED_SIMILARITY_THRESHOLD, DEFAULT_THRESHOLD)
            .then(v => {
                const loaded = Number(v) || DEFAULT_THRESHOLD;
                setThreshold(loaded);
                setSavedThreshold(loaded);
            })
            .finally(() => setLoading(false));
    }, [isOpen]);

    const handleClose = () => {
        setClosing(true);
        window.setTimeout(() => { onClose(); setClosing(false); }, 220);
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await appSettingsService.set(
                SETTING_KEYS.CONTROLLED_SIMILARITY_THRESHOLD,
                threshold,
                'Umbral de similitud (0.0–1.0) para detectar coincidencias de materiales controlados (categoría TABLEROS) en cotizaciones.',
            );
            setSavedThreshold(threshold);
            setSuccess(true);
            window.setTimeout(() => handleClose(), 900);
        } catch (e: any) {
            setError(e?.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    const percent = Math.round(threshold * 100);
    const interpretation =
        percent >= 90 ? { label: 'Muy estricto', color: 'text-rose-600' } :
        percent >= 75 ? { label: 'Estricto (recomendado)', color: 'text-emerald-600' } :
        percent >= 60 ? { label: 'Moderado', color: 'text-amber-600' } :
                        { label: 'Permisivo', color: 'text-slate-500' };

    return createPortal(
        <div
            className={`fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-[#2c3434]/30 ${closing ? 'animate-backdrop-out' : 'animate-backdrop'}`}
            style={{ backdropFilter: 'blur(6px)', fontFamily: "'Manrope', sans-serif" }}
            onClick={handleClose}
        >
            <div
                className={`bg-white/95 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] w-full max-w-lg border border-white/50 flex flex-col max-h-[90vh] ${closing ? 'animate-modal-panel-out' : 'animate-modal-panel'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-8 py-6 border-b border-[#d3dcdb]/30 flex items-center gap-4 bg-white/40 shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white text-[20px]">verified_user</span>
                    </div>
                    <div className="flex-1">
                        <h2 className="text-[18px] font-black text-[#2c3434] tracking-tight">Materiales Controlados</h2>
                        <p className="text-[11px] font-bold text-slate-400 tracking-wide mt-0.5">Política de precios mínimos para TABLEROS</p>
                    </div>
                    <button
                        onClick={() => setShowHelp(h => !h)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all text-[13px] font-black border ${showHelp ? 'bg-[#366480] text-white border-[#366480]' : 'text-[#8b9ba5] border-[#d3dcdb] hover:text-[#366480] hover:border-[#366480]'}`}
                        title="Cómo funciona el umbral"
                    >
                        ?
                    </button>
                    <button onClick={handleClose} className="w-9 h-9 rounded-full text-[#8b9ba5] hover:text-[#366480] hover:bg-[#f0f5f4] flex items-center justify-center transition-all">
                        <span className="material-icons-round text-[18px]">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="px-8 py-6 space-y-5 overflow-y-auto">
                    <div className="bg-[#f8faf9] rounded-2xl border border-[#e8eded] p-4 text-[12px] font-bold text-slate-500 leading-relaxed">
                        Cuando un vendedor escribe el nombre de un material en una cotización, el sistema busca coincidencias con el catálogo de la categoría <span className="text-[#366480] font-black">TABLEROS</span>. Si el parecido supera este umbral, el sistema obliga a seleccionarlo del catálogo y aplica el precio mínimo definido por la empresa.
                    </div>

                    {showHelp && (
                        <div className="bg-[#eef4f7] rounded-2xl border border-[#c8dce6] p-4 space-y-3">
                            <p className="text-[10px] font-black text-[#366480] uppercase tracking-widest">Cómo funciona el umbral</p>
                            <p className="text-[11px] font-bold text-slate-600 leading-relaxed">
                                El sistema solo verifica una fila si se escribieron <span className="text-[#2c3434] font-black">al menos 2 palabras</span> y la unidad no es MTS ni SERV. Luego mide el parecido con el nombre del producto usando el coeficiente Dice (bigramas normalizados sin tildes).
                            </p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[10px] font-bold border-collapse">
                                    <thead>
                                        <tr className="text-[#366480] uppercase tracking-wider">
                                            <th className="text-left pb-2 pr-3 font-black">Lo que escribe el vendedor</th>
                                            <th className="text-center pb-2 px-2 font-black">Dice ≈</th>
                                            <th className="text-center pb-2 px-2 font-black whitespace-nowrap">¿Bloquea a 75%?</th>
                                            <th className="text-center pb-2 px-2 font-black whitespace-nowrap">¿Bloquea a 50%?</th>
                                            <th className="text-center pb-2 pl-2 font-black whitespace-nowrap">¿Bloquea a 95%?</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-600 divide-y divide-[#d3dcdb]/40">
                                        {[
                                            ['melamina blanco 18mm', '1.00', '✓', '✓', '✓'],
                                            ['melamina blanco 18 mm', '0.91', '✓', '✓', '✓'],
                                            ['melamina blnco 18mm (typo)', '~0.83', '✓', '✓', '✗'],
                                            ['melamina blanco roble', '~0.72', '✗', '✓', '✗'],
                                            ['mel blanco 18mm', '~0.61', '✗', '✓', '✗'],
                                        ].map(([desc, dice, b75, b50, b95]) => (
                                            <tr key={desc}>
                                                <td className="py-1.5 pr-3 font-black text-[#2c3434] font-mono">{desc}</td>
                                                <td className="py-1.5 px-2 text-center tabular-nums">{dice}</td>
                                                <td className={`py-1.5 px-2 text-center font-black ${b75 === '✓' ? 'text-rose-500' : 'text-slate-400'}`}>{b75}</td>
                                                <td className={`py-1.5 px-2 text-center font-black ${b50 === '✓' ? 'text-rose-500' : 'text-slate-400'}`}>{b50}</td>
                                                <td className={`py-1.5 pl-2 text-center font-black ${b95 === '✓' ? 'text-rose-500' : 'text-slate-400'}`}>{b95}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 leading-relaxed">
                                * Producto de referencia: <span className="font-black text-slate-500">MELAMINA BLANCO 18MM</span>. Las filas con unidad MTS (canto) o SERV (servicio) nunca son verificadas.
                            </p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex items-baseline justify-between">
                            <label className="text-[10px] font-black text-[#2c3434] uppercase tracking-widest">Umbral de Similitud</label>
                            {loading ? (
                                <div className="w-12 h-7 bg-[#e8eded] rounded-lg animate-pulse" />
                            ) : (
                                <div className="flex items-baseline gap-2">
                                    <span className="text-[28px] font-black text-[#2c3434] tabular-nums">{percent}</span>
                                    <span className="text-[12px] font-black text-slate-400">%</span>
                                </div>
                            )}
                        </div>

                        {loading ? (
                            <div className="h-2 bg-[#e8eded] rounded-full animate-pulse" />
                        ) : (
                            <input
                                type="range"
                                min={50}
                                max={100}
                                step={1}
                                value={percent}
                                disabled={saving}
                                onChange={e => setThreshold(Number(e.target.value) / 100)}
                                className="w-full h-2 bg-[#e8eded] rounded-full appearance-none cursor-pointer accent-amber-500 disabled:opacity-50"
                            />
                        )}

                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            <span>50% Permisivo</span>
                            <span>100% Exacto</span>
                        </div>

                        {!loading && (
                            <p className={`text-[12px] font-black ${interpretation.color}`}>
                                {interpretation.label}
                            </p>
                        )}
                    </div>

                    {error && (
                        <p className="text-[11px] font-bold text-rose-500 bg-rose-50 px-4 py-3 rounded-2xl border border-rose-100">{error}</p>
                    )}
                    {success && (
                        <p className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-4 py-3 rounded-2xl border border-emerald-100 flex items-center gap-2">
                            <span className="material-icons-round text-[16px]">check_circle</span>
                            Política actualizada
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-white/30 flex justify-end gap-3 shrink-0">
                    <button onClick={handleClose} className="px-6 py-3 text-[10px] font-black text-slate-500 hover:text-slate-700 transition-all uppercase tracking-widest">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || loading || success || savedThreshold === threshold}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-800 transition-all disabled:opacity-60"
                    >
                        <span className="material-icons-round text-[14px]">save</span>
                        {saving ? 'Guardando...' : 'Guardar Política'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
