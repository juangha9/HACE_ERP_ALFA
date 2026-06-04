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

    // Cabeceras exactas que admite la carga masiva (orden de referencia para la plantilla)
    const TEMPLATE_HEADERS = [
        'subfamily_name', 'base_name', 'textura_acabado', 'espesor',
        'presentation', 'medidas_formato', 'brand', 'unit', 'features',
        'min_stock', 'reference_cost', 'min_price', 'margen', 'sku_corto'
    ];

    const downloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
        // Anchos de columna para que sea legible al abrirlo
        ws['!cols'] = TEMPLATE_HEADERS.map(h => ({ wch: Math.max(h.length + 2, 14) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
        XLSX.writeFile(wb, 'Plantilla_Carga_Masiva_Catalogo.xlsx');
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

            // Firmas de productos existentes para detectar duplicados.
            // Firma = nombre base + textura/acabado + espesor + medidas/formato + marca + presentación + unidad.
            const { data: existingDB, error: existError } = await supabase
                .from('catalog_products')
                .select('base_name, textura_acabado, espesor, medidas_formato, brand, presentation, unit');
            if (existError) throw existError;

            const signatureOf = (o: any) =>
                [o.base_name, o.textura_acabado, o.espesor, o.medidas_formato, o.brand, o.presentation, o.unit]
                    .map((v: any) => (v ?? '').toString().trim().toLowerCase())
                    .join('||');

            const existingSignatures = new Set((existingDB || []).map(signatureOf));
            const batchSignatures = new Set<string>();
            let duplicatesSkipped = 0;

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

                // GUARDIA DE INTEGRIDAD: si la subfamilia no existe, abortamos TODA la
                // importación (bulkCreateProducts se ejecuta fuera del bucle). Así nunca
                // se insertan productos huérfanos sin subfamilia en la base de datos.
                if (!subfId) {
                    throw new Error(`Fila ${i + 1}: No se encontró la Subfamilia "${row.subfamily_name ?? ''}". Créela primero en el sistema; no se cargó ningún producto.`);
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

                // SKU corto (opcional). Es VARCHAR(4) UNIQUE en la BD: validamos longitud
                // y convertimos vacío a null para no chocar con la restricción UNIQUE.
                const skuCorto = row.sku_corto ? row.sku_corto.toString().trim().toUpperCase() : '';
                if (skuCorto && skuCorto.length > 4) {
                    throw new Error(`Fila ${i + 1}: El "sku_corto" ("${skuCorto}") supera los 4 caracteres permitidos.`);
                }

                // Precio mínimo, costo de referencia y margen (opcionales).
                // Precios: vacío -> 0 (la BD usa "0 = no provisto" para autocalcular).
                // Margen: vacío -> null. El trigger de la BD completa el valor faltante:
                //   - costo + precio  -> calcula margen
                //   - costo + margen  -> calcula min_price = costo * (1 + margen/100)
                const minPrice = row.min_price === undefined || row.min_price === null || row.min_price === '' ? 0 : Number(row.min_price);
                if (isNaN(minPrice)) throw new Error(`Fila ${i + 1}: El campo "min_price" ("${row.min_price}") no es un número válido.`);
                const referenceCost = row.reference_cost === undefined || row.reference_cost === null || row.reference_cost === '' ? 0 : Number(row.reference_cost);
                if (isNaN(referenceCost)) throw new Error(`Fila ${i + 1}: El campo "reference_cost" ("${row.reference_cost}") no es un número válido.`);
                const margen = row.margen === undefined || row.margen === null || row.margen === '' ? null : Number(row.margen);
                if (margen !== null && isNaN(margen)) throw new Error(`Fila ${i + 1}: El campo "margen" ("${row.margen}") no es un número válido.`);

                const product: Omit<CatalogProduct, 'id' | 'sku'> = {
                    subfamily_id: subfId,
                    base_name: row.base_name.toString().trim(),
                    presentation: row.presentation.toString().trim(),
                    textura_acabado: row.textura_acabado ? row.textura_acabado.toString().trim() : null,
                    espesor: row.espesor !== undefined && row.espesor !== null && row.espesor !== '' ? row.espesor.toString().trim() : null,
                    medidas_formato: row.medidas_formato ? row.medidas_formato.toString().trim() : null,
                    unit: matchedUnit, // Usamos la versión canónica con mayúsculas correctas
                    brand: row.brand ? row.brand.toString().trim() : null,
                    features: row.features ? row.features.toString().trim() : null,
                    min_stock: row.min_stock ? Number(row.min_stock) : 0,
                    min_price: minPrice,
                    reference_cost: referenceCost,
                    margen: margen,
                    sku_corto: skuCorto || null,
                    stock_alerts: row.stock_alerts === 'true' || row.stock_alerts === true,
                    status: 'Activo'
                };

                // DETECCIÓN DE DUPLICADOS: si ya existe un producto (en la BD o en este
                // mismo archivo) con el mismo nombre base, textura/acabado, espesor,
                // medidas/formato, marca, presentación y unidad, se omite la fila (no se
                // inserta) y se reporta al final. El resto de filas sí se cargan.
                const productSig = signatureOf(product);
                if (existingSignatures.has(productSig) || batchSignatures.has(productSig)) {
                    duplicatesSkipped++;
                    continue;
                }
                batchSignatures.add(productSig);
                productsToInsert.push(product);
            }

            // 2. Si todas las filas resultaron duplicadas, no hay nada que insertar.
            if (productsToInsert.length === 0) {
                setError(`No se cargó ningún producto: las ${parsedData.length} fila(s) ya existen en el catálogo (duplicados por nombre base, textura/acabado, espesor, medidas/formato, marca, presentación y unidad).`);
                setLoading(false);
                return;
            }

            // 3. Insertar Bulk en Supabase
            await catalogService.bulkCreateProducts(productsToInsert);

            const dupMsg = duplicatesSkipped > 0 ? ` (${duplicatesSkipped} omitido(s) por estar duplicados)` : '';
            setSuccessMsg(`¡${productsToInsert.length} producto(s) cargado(s) exitosamente!${dupMsg}`);
            setTimeout(() => {
                onSuccess();
            }, 2500);

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
                        El archivo Excel/CSV debe contener estas cabeceras:
                        <div className="flex flex-wrap gap-2 mt-2 mb-3">
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">subfamily_name</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">base_name</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">textura_acabado</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">espesor</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">presentation</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">medidas_formato</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">brand</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">unit</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">features</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">min_stock</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">reference_cost</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">min_price</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">margen</code>
                            <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">sku_corto</code>
                        </div>
                        <p className="opacity-80 mb-2">
                            <span className="font-bold text-slate-700 dark:text-slate-300">Obligatorias:</span> subfamily_name, base_name, presentation, unit.
                            El resto son opcionales. <span className="font-bold">reference_cost</span>, <span className="font-bold">min_price</span> y <span className="font-bold">margen</span> son numéricos; <span className="font-bold">sku_corto</span> admite máx. 4 caracteres.
                        </p>
                        <p className="opacity-80 mb-2">
                            <span className="font-bold text-slate-700 dark:text-slate-300">Margen automático:</span> si indicas <span className="font-bold">reference_cost</span> + <span className="font-bold">min_price</span> (sin margen), el margen se calcula solo. Si indicas <span className="font-bold">reference_cost</span> + <span className="font-bold">margen</span> (sin min_price), el min_price = costo × (1 + margen/100).
                        </p>
                        <p className="opacity-80 mb-2">
                            <span className="font-bold text-slate-700 dark:text-slate-300">Duplicados:</span> si una fila coincide con un producto ya registrado (mismo nombre base, textura/acabado, espesor, medidas/formato, marca, presentación y unidad), se omite automáticamente y se reporta al finalizar.
                        </p>
                        <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Unidades Válidas:</span>
                        <p className="opacity-80 italic">Unidad, Plancha, Caja / Bolsa / Paquete, Metro, Litro, Kilogramo.</p>

                        <button
                            type="button"
                            onClick={downloadTemplate}
                            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors shadow-sm shadow-emerald-500/20"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Generar Excel Plantilla
                        </button>
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
