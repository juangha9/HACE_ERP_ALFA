import React, { useState, useEffect } from 'react';
import { catalogService } from '../services/catalogService';
import type { ProductCategory, ProductFamily, ProductSubfamily } from '../services/catalogService';
import { ProductEditionTab } from './Inventory/Catalog/ProductEditionTab';
import ApprovalsTab from './Inventory/ApprovalsTab';

export default function WarehouseConfigurationPage() {
    const [activeTab, setActiveTab] = useState<'hierarchy' | 'products' | 'approvals'>('hierarchy');
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [families, setFamilies] = useState<ProductFamily[]>([]);
    const [subfamilies, setSubfamilies] = useState<ProductSubfamily[]>([]);

    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedFamily, setSelectedFamily] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);

    // Form state
    const [isCreating, setIsCreating] = useState<'category' | 'family' | 'subfamily' | null>(null);
    const [formName, setFormName] = useState('');
    const [formCode, setFormCode] = useState('');

    // Validation state
    const [codeError, setCodeError] = useState<string | null>(null);
    const [isValidatingCode, setIsValidatingCode] = useState(false);
    const [isCodeValid, setIsCodeValid] = useState(false);

    // Auto-generated options
    const [codeOptions, setCodeOptions] = useState<string[]>([]);

    const loadData = async () => {
        setLoading(true);
        try {
            const cats = await catalogService.getCategories();
            setCategories(cats);

            if (selectedCategory) {
                const fams = await catalogService.getFamilies(selectedCategory);
                setFamilies(fams);
            } else {
                setFamilies([]);
            }

            if (selectedFamily) {
                const subfams = await catalogService.getSubfamilies(selectedFamily);
                setSubfamilies(subfams);
            } else {
                setSubfamilies([]);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedCategory, selectedFamily]);

    // SKU Generation Algorithm
    const generateCodeOptions = (name: string): string[] => {
        if (!name.trim()) return [];

        const cleanName = name.toUpperCase().replace(/[^A-Z\s]/g, '');
        const IGNORED_WORDS = ['EL', 'LA', 'LOS', 'LAS', 'UN', 'UNA', 'DE', 'DEL', 'PARA', 'CON', 'POR', 'EN', 'Y', 'O'];

        let words = cleanName.split(' ').filter(w => w.length > 0 && !IGNORED_WORDS.includes(w));

        // If entirely ignored words, just use the clean name
        if (words.length === 0) {
            words = cleanName.split(' ').filter(w => w.length > 0);
        }
        if (words.length === 0) return [];

        const options = new Set<string>();

        if (words.length === 1) {
            const word = words[0];
            if (word.length >= 3) {
                // Opción 1: 3 primeras letras
                options.add(word.substring(0, 3));
                // Opción 2: 2 primeras + última
                options.add(word.substring(0, 2) + word.slice(-1));

                // Opción 3: 1ra + 2 sig. consonantes
                const consonants = word.substring(1).replace(/[AEIOU]/g, '');
                if (consonants.length >= 2) {
                    options.add(word[0] + consonants.substring(0, 2));
                }

                // Opción 4: 1ra, 3ra, 5ta (si la palabra es suficientemente larga)
                if (word.length >= 5) {
                    options.add(word[0] + word[2] + word[4]);
                }
            } else {
                // Si la palabra tiene menos de 3 letras, la rellenamos con X
                options.add(word.padEnd(3, 'X'));
            }
        } else if (words.length === 2) {
            const w1 = words[0];
            const w2 = words[1];
            // 1ra letra de la 1ra + 2 primeras de la 2da
            let opt1 = w1[0] + w2.substring(0, 2);
            if (opt1.length < 3) opt1 = opt1.padEnd(3, 'X');
            options.add(opt1);

            // 2 primeras de la 1ra + 1ra de la 2da
            options.add((w1.substring(0, 2) + w2[0]).padEnd(3, 'X'));
        } else {
            // 3 o más palabras
            const w1 = words[0];
            const w2 = words[1];
            const w3 = words[2];
            // 1ras letras de las 3 primeras palabras
            options.add(w1[0] + w2[0] + w3[0]);

            // 1ra de la 1ra + 2 primeras de la 2da
            options.add((w1[0] + w2.substring(0, 2)).padEnd(3, 'X'));
        }

        return Array.from(options).slice(0, 4); // Keep max 4 options
    };

    // Handle code changes with debounced validation
    useEffect(() => {
        const validateCode = async () => {
            if (formCode.length !== 3) {
                setIsCodeValid(false);
                setCodeError(formCode.length > 0 ? 'El prefijo debe tener exactamente 3 caracteres alfanuméricos.' : null);
                return;
            }

            setIsValidatingCode(true);
            setCodeError(null);

            try {
                let exists = false;
                if (isCreating === 'category') {
                    exists = await catalogService.checkCategoryCodeExists(formCode);
                } else if (isCreating === 'family' && selectedCategory) {
                    exists = await catalogService.checkFamilyCodeExists(selectedCategory, formCode);
                } else if (isCreating === 'subfamily' && selectedFamily) {
                    exists = await catalogService.checkSubfamilyCodeExists(selectedFamily, formCode);
                }

                if (exists) {
                    setCodeError(`El código [${formCode}] ya está asignado. Intente con otro prefijo o agregue un número (Ej. ${formCode.substring(0, 2)}1).`);
                    setIsCodeValid(false);
                } else {
                    setCodeError(null);
                    setIsCodeValid(true);
                }
            } catch (error) {
                console.error("Validation error:", error);
            } finally {
                setIsValidatingCode(false);
            }
        };

        const timer = setTimeout(validateCode, 500); // 500ms debounce
        return () => clearTimeout(timer);
    }, [formCode, isCreating, selectedCategory, selectedFamily]);

    // Handle name change to auto-calculate SKU options
    useEffect(() => {
        const options = generateCodeOptions(formName);
        if (options.length > 0) {
            setCodeOptions(options);
            // Default to first option to trigger validation
            if (!codeOptions.includes(formCode)) {
                setFormCode(options[0]);
            }
        } else {
            setCodeOptions([]);
            setFormCode('');
        }
    }, [formName]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isCodeValid || formCode.length !== 3) return;

        try {
            if (isCreating === 'category') {
                await catalogService.createCategory({ name: formName, code: formCode });
            } else if (isCreating === 'family' && selectedCategory) {
                await catalogService.createFamily({ category_id: selectedCategory, name: formName, code: formCode });
            } else if (isCreating === 'subfamily' && selectedFamily) {
                await catalogService.createSubfamily({ family_id: selectedFamily, name: formName, code: formCode });
            }

            setFormName('');
            setFormCode('');
            setIsCreating(null);
            setIsCodeValid(false);
            loadData();
        } catch (error: any) {
            console.error("Error creating record:", error);
            alert("Error al guardar: " + error.message);
        }
    };


    const renderHierarchyList = (
        title: string,
        items: any[],
        selectedId: string | null,
        onSelect: (id: string) => void,
        type: 'category' | 'family' | 'subfamily',
        disabled: boolean
    ) => (
        <div className={`bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 flex flex-col h-[600px] overflow-hidden ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">{title}</h3>
                <button
                    onClick={() => {
                        setIsCreating(type);
                        setFormName('');
                        setFormCode('');
                    }}
                    className="p-2 bg-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-200 transition-colors"
                    title="Añadir Nuevo"
                >
                    <span className="material-symbols-outlined text-sm font-bold">add</span>
                </button>
            </div>

            {/* Create Form inline */}
            {isCreating === type && (
                <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-indigo-100 dark:border-indigo-900/30 animate-in slide-in-from-top-2">
                    <form onSubmit={handleCreate} className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre</label>
                            <input
                                type="text"
                                required
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                                className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                placeholder={`Ej. ${type === 'category' ? 'Herrajes' : 'Correderas'}`}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex justify-between">
                                Prefijo SKU (3 Caracteres)
                            </label>

                            {/* Opciones Generadas */}
                            {codeOptions.length > 1 && codeError && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    <span className="text-xs text-rose-500 font-bold w-full mb-1">Prefijo ocupado. Sugerencias disponibles:</span>
                                    {codeOptions.map(opt => (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => { setFormCode(opt); setIsCodeValid(false); }}
                                            className={`px-2 py-1 text-xs font-mono font-bold rounded border transition-colors ${formCode === opt
                                                ? 'bg-indigo-100 border-indigo-500 text-indigo-700'
                                                : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
                                                }`}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="relative">
                                <input
                                    type="text"
                                    required
                                    readOnly
                                    value={formCode}
                                    className={`w-full text-sm px-3 py-2 bg-slate-50 dark:bg-slate-900 border rounded-lg uppercase font-mono tracking-widest pl-10 transition-colors cursor-not-allowed
                                        ${codeError ? 'border-red-300 text-red-700 bg-red-50 dark:bg-red-900/10' :
                                            isCodeValid ? 'border-green-300 text-green-700 bg-green-50 dark:bg-green-900/10' :
                                                'border-slate-200 dark:border-slate-800 text-slate-500'}`}
                                    placeholder="Ej. HER"
                                />
                                <div className="absolute left-3 top-2.5 flex items-center justify-center">
                                    {isValidatingCode ? (
                                        <svg className="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : isCodeValid ? (
                                        <span className="material-symbols-outlined text-[18px] text-green-500">check_circle</span>
                                    ) : codeError ? (
                                        <span className="material-symbols-outlined text-[18px] text-red-500">cancel</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-[18px] text-slate-300">tag</span>
                                    )}
                                </div>
                            </div>
                            {codeError && (
                                <p className="text-[10px] text-red-500 font-medium mt-1 leading-tight">{codeError}</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsCreating(null)}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={!isCodeValid || formCode.length !== 3}
                                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-indigo-500/20"
                            >
                                Guardar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {items.length === 0 && !loading && (
                    <div className="text-center p-6 text-sm text-slate-400">
                        {disabled ? 'Selecciona un elemento primero.' : 'No hay elementos registrados.'}
                    </div>
                )}

                {items.map(item => (
                    <div
                        key={item.id}
                        onClick={() => onSelect(item.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between group
                            ${selectedId === item.id
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20'
                                : 'bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 hover:border-indigo-300 hover:bg-indigo-50/30'}`}
                    >
                        <div className="flex-1 min-w-0 pr-4">
                            <h4 className={`font-semibold text-sm truncate ${selectedId === item.id ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                                {item.name}
                            </h4>
                        </div>
                        <span className={`px-2 py-1 rounded bg-black/10 text-xs font-mono font-bold tracking-widest
                            ${selectedId === item.id ? 'text-indigo-100' : 'text-slate-500 group-hover:text-indigo-600'}
                        `}>
                            {item.code}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-slate-900/50 p-6 md:p-12 font-sans">
            <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-[2rem] bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20">
                            <span className="material-symbols-outlined text-3xl text-white">account_tree</span>
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic">Configuración de Almacén</h1>
                            <p className="text-slate-500 dark:text-slate-400 font-medium">Gestiona la estructura jerárquica del catálogo de productos y SKUs</p>
                        </div>
                    </div>
                </div>

                {/* Subtitle / Help text */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex gap-4 text-sm text-blue-800 dark:text-blue-300">
                    <span className="material-symbols-outlined shrink-0 text-blue-500 mt-0.5">info</span>
                    <div>
                        <p className="font-semibold mb-1">Acerca de la Jerarquía y SKUs</p>
                        <ul className="list-disc pl-5 space-y-1 opacity-90">
                            <li>El SKU se genera uniendo los prefijos en este orden: <strong>Categoría + Familia + Subfamilia</strong>.</li>
                            <li>Ejemplo: Herramientas (HER) {'>'} Manuales (MAN) {'>'} Martillos (MAR) = <strong className="font-mono bg-blue-100/50 dark:bg-blue-800/50 px-1 rounded">HERMANMAR-000001</strong>.</li>
                            <li>Los prefijos tienen exactamente 3 caracteres alfanuméricos. El sistema sugerirá opciones en base a las palabras del nombre.</li>
                        </ul>
                    </div>
                </div>

                {/* The Tabs */}
                <div className="flex space-x-2 border-b border-slate-200 dark:border-slate-800 mb-6 font-sans">
                    <button
                        onClick={() => setActiveTab('hierarchy')}
                        className={`px-6 py-3 font-bold text-sm rounded-t-2xl transition-all ${activeTab === 'hierarchy'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                    >
                        Configuración Jerárquica
                    </button>
                    <button
                        onClick={() => setActiveTab('products')}
                        className={`px-6 py-3 font-bold text-sm rounded-t-2xl transition-all ${activeTab === 'products'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                    >
                        Edición de Productos
                    </button>
                    <button
                        onClick={() => setActiveTab('approvals')}
                        className={`px-6 py-3 font-bold text-sm rounded-t-2xl transition-all flex items-center gap-2 ${activeTab === 'approvals'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                    >
                        <span className="material-symbols-outlined text-sm">fact_check</span>
                        Aprobaciones Pendientes
                    </button>
                </div>

                {activeTab === 'hierarchy' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-300">
                        {/* Categories Column */}
                        {renderHierarchyList(
                            "1. Categorías",
                            categories,
                            selectedCategory,
                            (id) => { setSelectedCategory(id); setSelectedFamily(null); },
                            'category',
                            false
                        )}

                        {/* Families Column */}
                        {renderHierarchyList(
                            "2. Familias",
                            families,
                            selectedFamily,
                            (id) => setSelectedFamily(id),
                            'family',
                            !selectedCategory
                        )}

                        {/* Subfamilies Column */}
                        {renderHierarchyList(
                            "3. Subfamilias",
                            subfamilies,
                            null,
                            () => { },
                            'subfamily',
                            !selectedFamily
                        )}
                    </div>
                )}

                {activeTab === 'products' && (
                    <div className="animate-in slide-in-from-bottom-4 duration-300">
                        <ProductEditionTab />
                    </div>
                )}

                {activeTab === 'approvals' && (
                    <div className="animate-in slide-in-from-bottom-4 duration-300">
                        <ApprovalsTab />
                    </div>
                )}
            </div>
        </div>
    );
}
