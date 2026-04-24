
import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import { api } from '../../services/api';
import type { Proveedor } from '../../services/types';

interface SuppliersModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SuppliersModal: React.FC<SuppliersModalProps> = ({ isOpen, onClose }) => {
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEditForm, setShowEditForm] = useState(false);
    const [currentProveedor, setCurrentProveedor] = useState<Partial<Proveedor>>({});
    const [saving, setSaving] = useState(false);

    const fetchProveedores = async () => {
        setLoading(true);
        try {
            const data = await api.getProveedores();
            setProveedores(data);
        } catch (error) {
            console.error("Error al cargar proveedores:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchProveedores();
        }
    }, [isOpen]);

    const handleEdit = (p?: Proveedor) => {
        setCurrentProveedor(p || {});
        setShowEditForm(true);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("¿Estás seguro de eliminar este proveedor?")) {
            try {
                await api.deleteProveedor(id);
                fetchProveedores();
            } catch (error) {
                alert("Error al eliminar proveedor");
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.saveProveedor(currentProveedor);
            setShowEditForm(false);
            fetchProveedores();
        } catch (error) {
            alert("Error al guardar proveedor");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="p-8 max-w-5xl w-full bg-slate-50 dark:bg-slate-900 rounded-3xl overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic">Gestión de Proveedores</h2>
                        <p className="text-slate-500 font-medium text-sm">Directorio maestro de proveedores y pagos</p>
                    </div>
                    {!showEditForm && (
                        <button
                            onClick={() => handleEdit()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-100 dark:shadow-none transition-all flex items-center gap-2"
                        >
                            <span className="material-icons-round">add</span>
                            Nuevo Proveedor
                        </button>
                    )}
                </div>

                {showEditForm ? (
                    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Razón Social</label>
                                <input
                                    type="text"
                                    value={currentProveedor.razon_social || ''}
                                    onChange={e => setCurrentProveedor({...currentProveedor, razon_social: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-4 rounded-2xl font-bold text-slate-700 dark:text-white focus:border-indigo-500 outline-none transition-all"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">RUC / DNI</label>
                                <input
                                    type="text"
                                    value={currentProveedor.tax_id || ''}
                                    onChange={e => setCurrentProveedor({...currentProveedor, tax_id: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-4 rounded-2xl font-bold text-slate-700 dark:text-white focus:border-indigo-500 outline-none transition-all"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Entidad Bancaria</label>
                                <input
                                    type="text"
                                    value={currentProveedor.banco_nombre || ''}
                                    onChange={e => setCurrentProveedor({...currentProveedor, banco_nombre: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-4 rounded-2xl font-bold text-slate-700 dark:text-white focus:border-indigo-500 outline-none transition-all"
                                    placeholder="Ej: BCP, BBVA, Interbank..."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Número de Cuenta / CCI</label>
                                <input
                                    type="text"
                                    value={currentProveedor.cuenta_bancaria || ''}
                                    onChange={e => setCurrentProveedor({...currentProveedor, cuenta_bancaria: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-4 rounded-2xl font-bold text-slate-700 dark:text-white focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Número de Contacto</label>
                                <input
                                    type="text"
                                    value={currentProveedor.numero_contacto || ''}
                                    onChange={e => setCurrentProveedor({...currentProveedor, numero_contacto: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-4 rounded-2xl font-bold text-slate-700 dark:text-white focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Email de Contacto</label>
                                <input
                                    type="email"
                                    value={currentProveedor.email_contacto || ''}
                                    onChange={e => setCurrentProveedor({...currentProveedor, email_contacto: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-4 rounded-2xl font-bold text-slate-700 dark:text-white focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 pt-4">
                            <button
                                type="button"
                                onClick={() => setShowEditForm(false)}
                                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-black py-4 rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-2 bg-indigo-600 text-white font-black py-4 px-12 rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-widest text-sm"
                            >
                                {saving ? 'Guardando...' : 'Guardar Proveedor'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Razón Social / DOI</th>
                                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Información Bancaria</th>
                                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Contacto</th>
                                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                    {loading ? (
                                        <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-bold">Cargando proveedores...</td></tr>
                                    ) : proveedores.length === 0 ? (
                                        <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-bold">No hay proveedores registrados.</td></tr>
                                    ) : (
                                        proveedores.map(p => (
                                            <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <p className="font-black text-slate-900 dark:text-white uppercase text-sm">{p.razon_social}</p>
                                                    <p className="text-[10px] text-slate-400 font-black tracking-widest uppercase">{p.tax_id}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{p.banco_nombre || '-'}</p>
                                                    <p className="text-xs font-medium text-slate-500">{p.cuenta_bancaria || '-'}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{p.numero_contacto || '-'}</p>
                                                    <p className="text-xs font-medium text-slate-500">{p.email_contacto || '-'}</p>
                                                </td>
                                                <td className="px-6 py-4 text-right space-x-2">
                                                    <button onClick={() => handleEdit(p)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><span className="material-icons-round">edit</span></button>
                                                    <button onClick={() => handleDelete(p.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><span className="material-symbols-outlined">delete</span></button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};
