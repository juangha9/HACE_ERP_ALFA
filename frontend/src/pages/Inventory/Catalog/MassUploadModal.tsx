import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { catalogService } from '../../../services/catalogService';
import type { CatalogProduct } from '../../../services/catalogService';
import { supabase } from '../../../services/supabase';

interface MassUploadModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export const MassUploadModal: React.FC<MassUploadModalProps> = ({ onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [parsedData, setParsedData] = useState<any[]>([]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        setSuccessMsg(null);
        setParsedData([]);

        const fileExt = file.name.split('.').pop()?.toLowerCase();

        if (fileExt === 'csv') {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    setParsedData(results.data);
                },
                error: (error) => {
                    setError(`Error parseando CSV: ${error.message}`);
                }
            });
        } else if (fileExt === 'xls' || fileExt === 'xlsx') {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const bstr = evt.target?.result;
                    const wb = XLSX.read(bstr, { type: 'binary' });
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    const data = XLSX.utils.sheet_to_json(ws);
                    setParsedData(data);
                } catch (err: any) {
                    setError(`Error parseando Excel: ${err.message}`);
                }
            };
            reader.readAsBinaryString(file);
        } else {
            setError('Formato no soportado. Sube un .csv o .xls/.xlsx');
        }
    };

    const processAndUpload = async () => {
        if (parsedData.length === 0) return;
        setLoading(true);
        setError(null);

        try {
            // 1. Obtener todas las subfamilias para mapear (o podríamos requerir el ID de la subfamilia en el Excel)
            // Para hacer el import robusto, buscaremos el subfamily_id por su nombre exacto.
            // Si quieres que proporcionen el subfamily_id directamente, es más fácil.
            // Omitiremos esta complejidad por ahora y asumiremos que el CSV/XLS trae un campo `subfamily_id`
            // o un nombre de subfamilia que mapeamos.

            const { data: subfamDB, error: subError } = await supabase.from('product_subfamilies').select('id, name');
            if (subError) throw subError;

            const subfamilies = subfamDB || [];

            // Unidades permitidas (Deben coincidir con las del formulario manual)
            const ALLOWED_UNITS = [
                'Unidad',
                'Plancha',
                'Caja / Bolsa / Paquete',
                'Metro',
                'Litro',
                'Kilogramo'
            ];

            // Validar y preparar productos
            const productsToInsert: Omit<CatalogProduct, 'id' | 'sku'>[] = [];

            for (let i = 0; i < parsedData.length; i++) {
                const row = parsedData[i];

                // Logica para encontrar el subfamily_id:
                let subfId = row.subfamily_id;
                if (!subfId && row.subfamily_name) {
                    const cleanName = row.subfamily_name.toString().trim().toLowerCase();
                    const found = subfamilies.find((s: { id: string, name: string }) => s.name.toLowerCase() === cleanName);
                    if (found) subfId = found.id;
                }

                if (!subfId) {
                    throw new Error(`Fila ${i + 1}: No se encontró la Subfamilia "${row.subfamily_name}". Verifique que exista en el sistema.`);
                }
                if (!row.base_name) throw new Error(`Fila ${i + 1}: Falta el campo obligatorio "base_name".`);
                if (!row.presentation) throw new Error(`Fila ${i + 1}: Falta el campo obligatorio "presentation".`);
                
                // Validar Unidad de Medida
                if (!row.unit) throw new Error(`Fila ${i + 1}: Falta el campo obligatorio "unit" (Unidad de Medida).`);
                
                const cleanUnit = row.unit.toString().trim();
                const matchedUnit = ALLOWED_UNITS.find(u => u.toLowerCase() === cleanUnit.toLowerCase());

                if (!matchedUnit) {
                    throw new Error(`Fila ${i + 1}: La unidad "${cleanUnit}" no es válida. Use una de las permitidas (Unidad, Plancha, Metro, etc.).`);
                }

                productsToInsert.push({
                    subfamily_id: subfId,
                    base_name: row.base_name.toString().trim(),
                    presentation: row.presentation.toString().trim(),
                    unit: matchedUnit, // Usamos la versión canónica con mayúsculas correctas
                    brand: row.brand ? row.brand.toString().trim() : null,
                    features: row.features ? row.features.toString().trim() : null,
                    min_stock: row.min_stock ? Number(row.min_stock) : 0,
                    stock_alerts: row.stock_alerts === 'true' || row.stock_alerts === true,
                    status: 'Activo'
                });
            }

            // 2. Insertar Bulk en Supabase
            await catalogService.bulkCreateProducts(productsToInsert);

            setSuccessMsg(`¡${productsToInsert.length} productos cargados exitosamente!`);
            setTimeout(() => {
                onSuccess();
            }, 2000);

        } catch (err: any) {
            setError(err.message || 'Error importando productos');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800 overflow-hidden transform scale-100 transition-all">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Carga Masiva de Productos
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-8">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium">
                            {error}
                        </div>
                    )}
                    {successMsg && (
                        <div className="mb-6 p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-200 text-green-600 dark:text-green-400 rounded-xl text-sm font-medium flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            {successMsg}
                        </div>
                    )}

                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 hover:border-blue-500 transition-colors text-center group cursor-pointer relative overflow-hidden bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800">
                        <input
                            type="file"
                            accept=".csv, .xls, .xlsx"
                            onChange={handleFileUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="text-slate-400 group-hover:text-blue-500 transition-colors flex justify-center mb-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Arrastra tu archivo aquí o haz clic para subir</p>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-2">Soporta .CSV, .XLS o .XLSX</p>
                    </div>

                    <div className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Formato Esperado:</span>
                        El archivo Excel/CSV debe contener exactamente estas cabeceras:
                        <div className="flex flex-wrap gap-2 mt-2 mb-3">
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">subfamily_name</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">base_name</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">unit</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">presentation</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">brand</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">features</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">min_stock</code>
                        </div>
                        <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Unidades Válidas:</span>
                        <p className="opacity-80 italic">Unidad, Plancha, Caja / Bolsa / Paquete, Metro, Litro, Kilogramo.</p>
                    </div>

                    {parsedData.length > 0 && !successMsg && (
                        <div className="mt-6 flex flex-col items-center">
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-full text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                ⭐ {parsedData.length} registros listos para procesar
                            </span>
                            <button
                                onClick={processAndUpload}
                                disabled={loading}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 flex justify-center items-center text-lg"
                            >
                                {loading ? 'Procesando e Importando...' : 'Iniciar Importación Masiva'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
