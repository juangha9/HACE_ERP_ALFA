import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Contact } from '../../services/types';

export default function ContactDirectory() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'CLIENT' | 'SUPPLIER'>('ALL');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Contact>>({ type: 'CLIENT', name: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const data = await api.getContacts();
            setContacts(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.saveContact(formData);
            await loadData();
            setIsModalOpen(false);
            setFormData({ type: 'CLIENT', name: '' });
        } catch (error) {
            alert('Error al guardar contacto');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar contacto?')) return;
        try {
            await api.deleteContact(id);
            loadData();
        } catch (e) {
            alert('Error al eliminar');
        }
    };

    const filtered = contacts.filter(c => {
        if (filter === 'ALL') return true;
        if (filter === 'CLIENT') return c.type === 'CLIENT' || c.type === 'BOTH';
        if (filter === 'SUPPLIER') return c.type === 'SUPPLIER' || c.type === 'BOTH';
        return true;
    });

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Directorio</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Clientes y Proveedores</p>
                </div>
                <button
                    onClick={() => { setFormData({ type: 'CLIENT' }); setIsModalOpen(true); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all"
                >
                    <span className="material-symbols-outlined text-lg">person_add</span>
                    Nuevo Contacto
                </button>
            </header>

            <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 pb-1">
                <button onClick={() => setFilter('ALL')} className={`pb-3 px-2 text-sm font-bold transition-colors border-b-2 ${filter === 'ALL' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Todos</button>
                <button onClick={() => setFilter('CLIENT')} className={`pb-3 px-2 text-sm font-bold transition-colors border-b-2 ${filter === 'CLIENT' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Clientes</button>
                <button onClick={() => setFilter('SUPPLIER')} className={`pb-3 px-2 text-sm font-bold transition-colors border-b-2 ${filter === 'SUPPLIER' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Proveedores</button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Tipo</th>
                            <th className="px-6 py-4">Nombre / Empresa</th>
                            <th className="px-6 py-4">Contacto</th>
                            <th className="px-6 py-4">Teléfono / Email</th>
                            <th className="px-6 py-4 text-right">RUC / DNI</th>
                            <th className="px-6 py-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={6} className="text-center py-8 text-slate-400 italic">Cargando...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-8 text-slate-400 italic">No se encontraron contactos.</td></tr>
                        ) : (
                            filtered.map(c => (
                                <tr key={c.id} className="hover:bg-indigo-50/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider
                                            ${c.type === 'CLIENT' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                                                c.type === 'SUPPLIER' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'}`}>
                                            {c.type === 'BOTH' ? 'AMBOS' : c.type === 'CLIENT' ? 'CLIENTE' : 'PROVEEDOR'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{c.name}</td>
                                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{c.contact_person || '-'}</td>
                                    <td className="px-6 py-4 text-xs">
                                        <div className="flex flex-col gap-1">
                                            {c.phone && <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400"><span className="material-symbols-outlined text-[10px]">call</span> {c.phone}</span>}
                                            {c.email && <span className="flex items-center gap-1 text-indigo-500 dark:text-indigo-400"><span className="material-symbols-outlined text-[10px]">mail</span> {c.email}</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-500 dark:text-slate-500">{c.tax_id || '-'}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => { setFormData(c); setIsModalOpen(true); }} className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 p-2 rounded-lg transition-colors">
                                            <span className="material-symbols-outlined text-sm">edit</span>
                                        </button>
                                        <button onClick={() => handleDelete(c.id)} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 p-2 rounded-lg transition-colors ml-1">
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95 border border-white/10">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-6 uppercase tracking-tight">
                            {formData.id ? 'Editar Contacto' : 'Nuevo Contacto'}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tipo</label>
                                    <select required className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200"
                                        value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })}>
                                        <option value="CLIENT">Cliente</option>
                                        <option value="SUPPLIER">Proveedor</option>
                                        <option value="BOTH">Ambos</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">RUC / DNI</label>
                                    <input className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200"
                                        value={formData.tax_id || ''} onChange={e => setFormData({ ...formData, tax_id: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Nombre / Empresa</label>
                                <input required className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200"
                                    value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Email</label>
                                    <input type="email" className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200"
                                        value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Teléfono</label>
                                    <input type="tel" className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200"
                                        value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Persona de Contacto</label>
                                <input className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200"
                                    value={formData.contact_person || ''} onChange={e => setFormData({ ...formData, contact_person: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Dirección</label>
                                <input className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200"
                                    value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Datos de Facturación</label>
                                <textarea className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 h-20 resize-none"
                                    value={formData.billing_data || ''} onChange={e => setFormData({ ...formData, billing_data: e.target.value })}
                                    placeholder="Ingrese los datos de facturación opcionales (Banco, N° Cuenta, Razón Social, etc.)" />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Cancelar</button>
                                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-colors">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
