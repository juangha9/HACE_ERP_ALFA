import { supabase } from './supabase';
import { API_URL } from './apiConfig';

const toWebP = (file: File, quality = 0.85): Promise<File> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Canvas no disponible')); return; }
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(
                (blob) => {
                    if (!blob) { reject(new Error('Conversión WebP fallida')); return; }
                    resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
                },
                'image/webp',
                quality
            );
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Error al cargar imagen')); };
        img.src = url;
    });
import type { 
    Project, 
    ProjectItem, 
    Collection, 
    BusinessInfo, 
    Quotation, 
    NodrizaTesoreria, 
    VentaCabecera, 
    VentaDetalle, 
    VentaCobro,
    Proveedor,
    OrdenPago,
    DetalleOrden
} from './types';

export interface CreateMermaRequest {
    product_id: string;
    quantity: number;
    reason_type: string;
    reason?: string;
    status: 'PENDING';
}

export interface Colaborador {
    id?: string;
    dni: string;
    nombres: string;
    apellidos: string;
    cargo: string;
    sueldo: number;
    tipo: 'Planilla' | 'Tercero';
    adelantos: number;
}

export interface RoleDetail {
    id?: string;
    rol_id?: string;
    categoria: 'FUNCION_MAIN' | 'FUNCION_SEC' | 'PROCESO' | 'KPI' | 'RELACION' | 'COMP_TEC' | 'COMP_BLANDA' | 'HERRAMIENTA' | 'CONDICION';
    descripcion: string;
    orden?: number;
}

export interface Role {
    id?: string;
    created_at?: string;
    updated_at?: string;
    nombre_cargo: string;
    area: string;
    reporta_a: string;
    supervisa_a: string;
    proposito: string;
    nombres: string;
    horario: string;
    rango_salarial: string;
    sueldo: number;
    dotacion: number;
    dni?: string | null;
    parent_id?: string | null;
    jerarquia?: number;
    detalles_rol?: RoleDetail[];
    relacion_funcional?: string[];
    tipo_relacion?: 'JERARQUICA' | 'STAFF';
}

export const api = {
    _supabase: supabase,
    getProjects: async (): Promise<Project[]> => {
        const res = await fetch(`${API_URL}/projects`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to fetch projects');
        }
        return res.json();
    },

    createProject: async (project: Omit<Project, 'id' | 'status'>): Promise<Project> => {
        const res = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to create project');
        }
        const data = await res.json();
        return data[0]; // Supabase returns an array
    },

    getItems: async (projectId: string): Promise<ProjectItem[]> => {
        const res = await fetch(`${API_URL}/items?project_id=${projectId}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to fetch items');
        }
        return res.json();
    },

    addItems: async (items: (Omit<ProjectItem, 'id'> | ProjectItem)[]): Promise<ProjectItem[]> => {
        const res = await fetch(`${API_URL}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to sync items');
        }
        return res.json();
    },

    updateProjectItem: async (id: string, updates: Partial<ProjectItem>) => {
        const { error } = await supabase.from('project_items').update(updates).eq('id', id);
        if (error) throw new Error(error.message);
    },

    deleteItems: async (ids: string[]) => {
        const response = await fetch(`${API_URL}/items`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        if (!response.ok) throw new Error('Error al eliminar items');
    },

    // Collections (Ingresos)
    getCollections: async (projectId: string): Promise<Collection[]> => {
        const response = await fetch(`${API_URL}/collections?project_id=${projectId}`);
        if (!response.ok) throw new Error('Error al obtener cobranzas');
        return response.json();
    },

    saveCollections: async (collections: Partial<Collection>[]) => {
        const response = await fetch(`${API_URL}/collections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collections)
        });
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.error || 'Error al guardar cobranzas');
        }
        return response.json();
    },

    deleteCollection: async (id: string) => {
        const response = await fetch(`${API_URL}/collections?id=${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Error al eliminar cobranza');
    },
    updateProject: async (id: string, project: Partial<Project>): Promise<Project> => {
        const res = await fetch(`${API_URL}/projects?id=${id}`, {
            method: 'PATCH', // backend handles PATCH or we can use POST with ID
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to update project');
        }
        const data = await res.json();
        return data[0];
    },

    deleteProject: async (id: string): Promise<void> => {
        const res = await fetch(`${API_URL}/projects?id=${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to delete project');
        }
    },

    getHistoricalUtility: async (): Promise<number> => {
        const res = await fetch(`${API_URL}/stats/historical-utility`);
        if (!res.ok) return 14.2; // Fallback to original dummy value if it fails
        const data = await res.json();
        return data.averageUtility;
    },

    // Logistics / Cost Zones
    getCostZoneDefault: async () => {
        const res = await fetch(`${API_URL}/cost-zones/default`);
        if (!res.ok) return null;
        return res.json();
    },

    getTransportRatesDefault: async () => {
        const res = await fetch(`${API_URL}/transport-rates/default`);
        if (!res.ok) return null;
        return res.json();
    },

    getManagementParameters: async () => {
        const res = await fetch(`${API_URL}/management-parameters`);
        if (!res.ok) return null;
        const data = await res.json();
        // Based on index.ts logic (limit(1).single()), it returns an object.
        return Array.isArray(data) ? data[0] : data;
    },

    // Inventory
    getInventoryStats: async () => {
        // Total Items
        const { count: totalItems } = await supabase
            .from('catalog_products')
            .select('*', { count: 'exact', head: true });

        // Today Moves
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { count: todayMoves } = await supabase
            .from('inventory_movements')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfDay.toISOString());

        // Pending Approvals (Mermas + Material Requests)
        const { count: pendingMermas } = await supabase
            .from('product_mermas')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'PENDING');

        const { count: pendingMaterials } = await supabase
            .from('material_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'PENDIENTE');

        return {
            totalItems: totalItems || 0,
            totalValue: 0,
            todayMoves: todayMoves || 0,
            pendingApprovals: (pendingMermas || 0) + (pendingMaterials || 0)
        };
    },

    getContacts: async (type?: 'CLIENT' | 'SUPPLIER' | 'BOTH') => {
        let query = supabase.from('contacts').select('*');
        if (type && type !== 'BOTH') query = query.eq('type', type);
        const { data, error } = await query;
        if (error) {
            console.warn('Failed to fetch contacts from supabase (maybe table is missing)', error);
            return []; // Fallback
        }
        return data || [];
    },
    saveContact: async (contact: any) => {
        const { id, ...rest } = contact;
        const req = id ? supabase.from('contacts').update(rest).eq('id', id) : supabase.from('contacts').insert([rest]);
        const { error } = await req;
        if (error) throw new Error(error.message);
    },
    deleteContact: async (id: string) => {
        const { error } = await supabase.from('contacts').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },

    getInventoryProducts: async () => {
        // En lugar de llamar al backend que no tiene la ruta, consultamos catalog_products.
        // Asumimos que catalog_products es la fuente principal para seleccionar productos en inventario/mermas
        const { data: products, error } = await supabase
            .from('catalog_products')
            .select(`
                *,
                product_subfamilies (
                    name,
                    product_families (
                        name,
                        product_categories (
                            name
                        )
                    )
                )
            `)
            .order('base_name');

        if (error) throw new Error(error.message);

        // Calculate current stock and average cost from movements
        const { data: movements, error: mError } = await supabase
            .from('inventory_movements')
            .select('product_id, type, quantity, unit_cost');

        if (mError) console.warn('Failed to fetch movements for stock aggregation', mError);

        const stockMap: Record<string, { qty: number, totalCost: number, inQty: number }> = {};
        (movements || []).forEach(m => {
            const isEntry = m.type.startsWith('IN_');
            const qty = Number(m.quantity) || 0;
            const cost = Number(m.unit_cost) || 0;

            if (!stockMap[m.product_id]) stockMap[m.product_id] = { qty: 0, totalCost: 0, inQty: 0 };

            stockMap[m.product_id].qty += isEntry ? qty : -qty;

            if (isEntry && cost > 0) {
                stockMap[m.product_id].totalCost += qty * cost;
                stockMap[m.product_id].inQty += qty;
            }
        });

        // Mapeamos a InventoryProduct interface
        return (products || []).map(p => ({
            id: p.id,
            sku: p.sku || 'SIN SKU',
            name: `${p.base_name} ${p.presentation || ''}`.trim(),
            description: p.features || '',
            category: p.product_subfamilies?.product_families?.product_categories?.name || '',
            family: p.product_subfamilies?.product_families?.name || '',
            subfamily: p.product_subfamilies?.name || '',
            unit: 'UND', // Default as it's not in catalog schema yet
            stock_current: stockMap[p.id]?.qty || 0,
            min_stock: p.min_stock || 0,
            average_cost: (stockMap[p.id] && stockMap[p.id].inQty > 0) ? (stockMap[p.id].totalCost / stockMap[p.id].inQty) : 0,
            last_purchase_price: 0,
            unit_price_sale: 0
        }));
    },
    saveInventoryProduct: async (_product: any) => {
        throw new Error('Usar catalogService para agregar productos');
    },
    deleteInventoryProduct: async (_id: string) => {
        throw new Error('Usar catalogService para eliminar);');
    },

    getInventoryMovements: async (limit?: number, projectId?: string) => {
        let query = supabase
            .from('inventory_movements')
            .select('*, product:catalog_products(name:base_name, sku), contact:contacts(name)')
            .order('date', { ascending: false });

        if (limit !== undefined) query = query.limit(limit);

        if (projectId) {
            query = query.eq('project_id', projectId);
        }

        const { data, error } = await query;
        if (error) {
            console.warn('Movements fetch failed', error);
            return [];
        }
        return data || [];
    },
    saveInventoryMovement: async (movement: any) => {
        const { error } = await supabase.from('inventory_movements').insert([movement]);
        if (error) throw new Error(error.message);
    },

    getInventoryLocations: async () => {
        const { data, error } = await supabase.from('inventory_locations').select('*');
        if (error) return [];
        return data || [];
    },
    saveInventoryLocation: async (location: any) => {
        const { id, ...rest } = location;
        const { error } = id ? await supabase.from('inventory_locations').update(rest).eq('id', id) : await supabase.from('inventory_locations').insert([rest]);
        if (error) throw new Error(error.message);
    },
    deleteInventoryLocation: async (id: string) => {
        await supabase.from('inventory_locations').delete().eq('id', id);
    },

    // --- Mermas ---
    getMyMermas: async () => {
        const { data, error } = await supabase
            .from('product_mermas')
            .select('*, catalog_products(base_name, sku)')
            .order('created_at', { ascending: false });
        if (error) return [];
        return data || [];
    },

    // Mermas query para historial (admin)
    getAllMermas: async () => {
        const { data, error } = await supabase
            .from('product_mermas')
            .select('*, catalog_products(base_name, sku)')
            .order('created_at', { ascending: false });
        if (error) return [];
        return data || [];
    },

    getPendingMermas: async () => {
        const { data, error } = await supabase
            .from('product_mermas')
            .select('*, catalog_products(base_name, sku, min_stock)')
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false });
        if (error) return [];
        return data || [];
    },

    createMermaRequest: async (merma: CreateMermaRequest) => {
        const { error } = await supabase.from('product_mermas').insert([merma]);
        if (error) throw new Error(error.message);
        return true;
    },

    approveMermaRequest: async (id: string, approve: boolean, rejectionReason?: string) => {
        const { data: merma, error: fetchErr } = await supabase
            .from('product_mermas')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchErr) throw new Error(fetchErr.message);

        const updateData: any = { status: approve ? 'APPROVED' : 'REJECTED' };
        if (!approve && rejectionReason) {
            updateData.rejection_reason = rejectionReason;
        }

        const { error } = await supabase
            .from('product_mermas')
            .update(updateData)
            .eq('id', id);
        if (error) throw new Error(error.message);

        if (approve) {
            // Descontar del kardex
            await supabase.from('inventory_movements').insert([{
                product_id: merma.product_id,
                type: 'OUT_LOSS',
                date: new Date().toISOString().split('T')[0],
                quantity: merma.quantity,
                observations: `Aprobación de merma: ${merma.reason}`
            }]);
        }

        return true;
    },

    // --- Material Requests (Optimization Workflow) ---
    getMaterialRequests: async () => {
        const res = await fetch(`${API_URL}/material-requests`);
        if (!res.ok) throw new Error('Error al cargar solicitudes de material');
        return res.json();
    },

    updateMaterialRequestStatus: async (id: string, status: 'PENDIENTE' | 'APROBADO' | 'SOLICITAR_COMPRA', observations?: string) => {
        const { data: request, error: fetchErr } = await supabase
            .from('material_requests')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchErr) throw new Error(fetchErr.message);

        const { error } = await supabase
            .from('material_requests')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw new Error(error.message);

        if (status === 'APROBADO') {
            // Descontar del kardex para el proyecto
            await supabase.from('inventory_movements').insert([{
                product_id: request.product_id,
                type: 'OUT_PROJECT',
                date: new Date().toISOString().split('T')[0],
                quantity: request.quantity,
                observations: observations || `Aprobación material para proyecto: ${request.project_id}`
            }]);
        }
        return true;
    },

    // --- Optimizations ---
    getOptimizations: async () => {
        const { data, error } = await supabase
            .from('optimizations')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching optimizations:', error);
            return [];
        }
        return data || [];
    },

    getNextWorkOrder: async (): Promise<string> => {
        const { data, error } = await supabase
            .from('optimizations')
            .select('code')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data || !data.code) {
            // First ever or error
            return 'OPT-000001-V1';
        }

        const match = data.code.match(/OPT-(\d+)/);
        if (match && match[1]) {
            const nextNum = parseInt(match[1], 10) + 1;
            return `OPT-${nextNum.toString().padStart(6, '0')}-V1`;
        }
        return 'OPT-000001-V1';
    },

    // --- Custom Boards ---
    getCustomBoards: async (): Promise<{ id: string, label: string, w: number, h: number, number?: number, name: string, veta: boolean }[]> => {
        const { data, error } = await supabase
            .from('custom_boards')
            .select('*')
            .order('number', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching custom boards:', error);
            return [];
        }

        // Assign sequential numbers if the DB column is null
        return data.map((board: any, index: number) => {
            const effectiveNumber: number = board.number ?? (index + 1);
            return {
                id: board.id,
                label: `[${effectiveNumber}] ${board.name} (${board.width} × ${board.height})`,
                w: Number(board.width),
                h: Number(board.height),
                number: effectiveNumber,
                name: board.name,
                // veta: TRUE = la pieza tiene veta y no puede rotar.
                // Si la columna aún no existe en BD (migración pendiente),
                // tratamos como TRUE por seguridad (no rotar por defecto).
                veta: board.veta === undefined || board.veta === null ? true : !!board.veta
            };
        });
    },

    addCustomBoard: async (board: { name: string, width: number, height: number, material: string, number?: number, veta: boolean }) => {
        const { data, error } = await supabase
            .from('custom_boards')
            .insert([{
                name: board.name,
                width: board.width,
                height: board.height,
                material: board.material,
                number: board.number,
                veta: board.veta
            }])
            .select()
            .single();

        if (error) {
            console.error('Error adding custom board:', error);
            throw error;
        }
        return data;
    },

    updateCustomBoard: async (id: string, board: { name: string, width: number, height: number, material: string, number?: number, veta: boolean }) => {
        const { data, error } = await supabase
            .from('custom_boards')
            .update({
                name: board.name,
                width: board.width,
                height: board.height,
                material: board.material,
                number: board.number,
                veta: board.veta,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating custom board:', error);
            throw error;
        }
        return data;
    },

    // --- Business Info ---
    getBusinessInfo: async (): Promise<BusinessInfo> => {
        const { data, error } = await supabase
            .from('business_info')
            .select('*')
            .limit(1)
            .single();
        if (error) {
            console.error('Error fetching business info:', error);
            return { id: '', company_name: 'MI EMPRESA S.A.C.', ruc: '20000000000', address: 'Dirección' };
        }
        return data;
    },

    saveBusinessInfo: async (info: Partial<BusinessInfo>) => {
        const { id, ...rest } = info;
        const req = id ? supabase.from('business_info').update(rest).eq('id', id) : supabase.from('business_info').insert([rest]);
        const { error } = await req;
        if (error) throw new Error(error.message);
    },

    // --- Quotations ---
    getQuotations: async (): Promise<Quotation[]> => {
        const { data, error } = await supabase
            .from('quotations')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) return [];
        return data || [];
    },


    saveQuotation: async (quotation: Partial<Quotation>) => {
        const { data: savedQuote, error: qError } = await supabase
            .from('quotations')
            .upsert(quotation, { onConflict: 'code' })
            .select()
            .single();

        if (qError) throw new Error(qError.message);
        return savedQuote;
    },

    // Called only when optimization transitions to LISTO_CORTE
    syncQuotationToTreasury: async (optimizationId: string) => {
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        const { data: quote } = await supabase
            .from('quotations')
            .select('*')
            .eq('optimization_id', optimizationId)
            .maybeSingle();

        const { data: optInfo } = await supabase
            .from('optimizations')
            .select('code, data')
            .eq('id', optimizationId)
            .single();

        let effectiveQuote = quote;
        let generatedDetails: any[] = [];

        if (!effectiveQuote) {
            if (!optInfo) return;
            
            // Fallback: Create a virtual quotation based on optimization data
            effectiveQuote = {
                code: optInfo.code.replace('OPT-', 'COT-'),
                client_name: optInfo.data?.projectName || optInfo.data?.config?.clientName || 'CLIENTE MOSTRADOR',
                total: 0,
                balance: 0,
                advance: 0,
                optimization_id: optimizationId,
            };

            // Generate details from optimization data
            const boards = optInfo.data?.boards || [];
            const pieces = optInfo.data?.pieces || [];
            
            const boardMap = new Map<string, number>();
            boards.forEach((b: any) => {
                const materialLabel = b.material || optInfo.data?.config?.material || 'Melamina';
                boardMap.set(materialLabel, (boardMap.get(materialLabel) || 0) + 1);
            });

            boardMap.forEach((count, label) => {
                generatedDetails.push({
                    material_insumo: `Tablero ${label}`,
                    cantidad: count,
                    precio_unitario: 0,
                    total: 0
                });
            });

            let edge1Sum = 0;
            let edge2Sum = 0;
            boards.forEach((b: any) => {
                b.placedPieces?.forEach((pp: any) => {
                    const originalPiece = pieces.find((p: any) => p.id === pp.pieceTemplateId);
                    const edges = originalPiece ? originalPiece.edgeBanding : pp.edgeBanding;
                    if (edges) {
                        const cutW = originalPiece ? originalPiece.width : pp.width;
                        const cutH = originalPiece ? originalPiece.height : pp.height;

                        if (edges.top === 1) edge1Sum += cutW;
                        if (edges.top === 2) edge2Sum += cutW;
                        if (edges.bottom === 1) edge1Sum += cutW;
                        if (edges.bottom === 2) edge2Sum += cutW;

                        if (edges.left === 1) edge1Sum += cutH;
                        if (edges.left === 2) edge2Sum += cutH;
                        if (edges.right === 1) edge1Sum += cutH;
                        if (edges.right === 2) edge2Sum += cutH;
                    }
                });
            });

            if (edge1Sum > 0) {
                generatedDetails.push({
                    material_insumo: 'Canto Delgado',
                    cantidad: Number((edge1Sum / 1000).toFixed(2)),
                    precio_unitario: 0,
                    total: 0
                });
            }
            if (edge2Sum > 0) {
                generatedDetails.push({
                    material_insumo: 'Canto Grueso',
                    cantidad: Number((edge2Sum / 1000).toFixed(2)),
                    precio_unitario: 0,
                    total: 0
                });
            }
        }

        const correctClientName = optInfo?.data?.projectName || optInfo?.data?.config?.clientName || effectiveQuote.client_name;

        const { data: existingVenta } = await supabase
            .from('ventas_cabecera')
            .select('id, saldo_a_favor, motivo_pago_excedente, user_id')
            .eq('codigo_cotizacion', effectiveQuote.code)
            .maybeSingle();

        const syncDetails = async (ventaId: string) => {
            await supabase.from('ventas_detalle').delete().eq('venta_id', ventaId);
            
            let detalles = generatedDetails;
            if (quote && quote.items) {
                detalles = (quote.items as any[]).map((item: any) => ({
                    material_insumo: item.description || item.type,
                    cantidad: item.quantity,
                    precio_unitario: item.unitPrice,
                    total: item.total
                }));
            }
            
            const detallesToInsert = detalles.map(d => ({ ...d, venta_id: ventaId }));
            
            if (detallesToInsert.length > 0) {
                const { error: dError } = await supabase.from('ventas_detalle').insert(detallesToInsert);
                if (dError) console.error("Error syncing ventas_detalle:", dError);
            }

            if (effectiveQuote.advance > 0 && !existingVenta) {
                await supabase.from('ventas_cobros').insert({
                    venta_id: ventaId,
                    monto: effectiveQuote.advance,
                    cuenta_destino: 'Efectivo',
                    voucher_url: null,
                    numero_operacion: 'ADELANTO'
                });
                await api.createTesoreriaMovement({
                    monto: effectiveQuote.advance,
                    tipo_movimiento: 'INGRESO',
                    cuenta_origen: 'CLIENTE',
                    cuenta_destino: 'Efectivo',
                    categoria: 'Venta',
                    referencia_id: ventaId,
                    observaciones: `Adelanto inicial cotización ${effectiveQuote.code}`
                });
            }
        };

        try {
            const ventaPayload: any = {
                codigo_cotizacion: quote.code,
                cliente_nombre: correctClientName,
                monto_total: quote.total,
                saldo_pendiente: quote.balance,
                estado_pago: quote.balance <= 0 ? 'CANCELADO' : (quote.advance > 0 ? 'PARCIAL' : 'PENDIENTE'),
                optimization_id: quote.optimization_id,
                descripcion_resumen: `Cotización de ${correctClientName}`,
                saldo_a_favor: existingVenta?.saldo_a_favor || 0,
                motivo_pago_excedente: existingVenta?.motivo_pago_excedente || null
            };

            if (existingVenta?.id) {
                ventaPayload.id = existingVenta.id;
                if (currentUser?.id && !existingVenta.user_id) {
                    ventaPayload.user_id = currentUser.id;
                }
            } else if (currentUser?.id) {
                ventaPayload.user_id = currentUser.id;
            }

            const { data: savedVenta, error: vError } = await supabase
                .from('ventas_cabecera')
                .upsert(ventaPayload)
                .select()
                .maybeSingle();

            if (vError) {
                if (vError.message.includes('motivo_pago_excedente') || vError.message.includes('saldo_a_favor')) {
                    delete ventaPayload.saldo_a_favor;
                    delete ventaPayload.motivo_pago_excedente;
                    const { data: retryVenta, error: rError } = await supabase
                        .from('ventas_cabecera')
                        .upsert(ventaPayload)
                        .select()
                        .maybeSingle();
                    if (!rError && retryVenta) await syncDetails(retryVenta.id);
                }
                console.error("Error syncing to ventas_cabecera:", vError);
            } else if (savedVenta) {
                await syncDetails(savedVenta.id);
            }
        } catch (err) {
            console.error("Critical error in sync to Treasury:", err);
        }
    },


    getNextQuotationCode: async (): Promise<string> => {
        const { data, error } = await supabase
            .from('quotations')
            .select('code')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data || !data.code) return 'COT-000001';

        const match = data.code.match(/COT-(\d+)/);
        if (match && match[1]) {
            const nextNum = parseInt(match[1], 10) + 1;
            return `COT-${nextNum.toString().padStart(6, '0')}`;
        }
        return 'COT-000001';
    },

    generateVentaCode: async (): Promise<string> => {
        const now = new Date();
        const yy = now.getFullYear().toString().slice(-2);
        const mm = (now.getMonth() + 1).toString().padStart(2, '0');
        const dd = now.getDate().toString().padStart(2, '0');
        const datePrefix = `${yy}${mm}${dd}`;

        // We use like 'VTA-YYMMDD-%' to check the optimizations table
        const { count, error } = await supabase
            .from('optimizations')
            .select('*', { count: 'exact', head: true })
            .like('code', `VTA-${datePrefix}-%`);

        if (error) {
            console.error("Error generating venta code:", error);
        }

        const correlative = (count || 0) + 1;
        return `VTA-${datePrefix}-${correlative.toString().padStart(3, '0')}`;
    },

    // --- Personal Staff ---
    getPersonalStaff: async (): Promise<Colaborador[]> => {
        const { data, error } = await supabase
            .from('personal_staff')
            .select('*')
            .order('nombres', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    savePersonalStaff: async (colaborador: Omit<Colaborador, 'id'>) => {
        const { data, error } = await supabase
            .from('personal_staff')
            .insert([colaborador])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    updatePersonalStaff: async (dni: string, updates: Partial<Colaborador>) => {
        const { error } = await supabase
            .from('personal_staff')
            .update(updates)
            .eq('dni', dni);
        if (error) throw error;
    },

    getTableData: async (tableName: string, filters?: { fromDate?: string, toDate?: string, projectId?: string }) => {
        let query = supabase.from(tableName).select('*');
        
        // Enriquecer tablas con llaves foráneas para que sean legibles en el reporte
        if (tableName === 'inventory_movements') {
            query = supabase.from(tableName).select('*, product:catalog_products(base_name, sku, presentation), contact:contacts(name), project:projects(name, project_number)');
        } else if (tableName === 'project_items') {
            query = supabase.from(tableName).select('*, project:projects(name, project_number)');
        } else if (tableName === 'product_mermas') {
            query = supabase.from(tableName).select('*, product:catalog_products(base_name, sku, presentation)');
        } else if (tableName === 'material_requests') {
            query = supabase.from(tableName).select('*, product:catalog_products(base_name, sku), project:projects(name, project_number)');
        } else if (tableName === 'project_collections') {
            query = supabase.from(tableName).select('*, project:projects(name, project_number)');
        }

        // Aplicar filtros si existen
        if (filters) {
            if (filters.fromDate || filters.toDate) {
                // Determinar el campo de fecha según la tabla
                let dateField = 'created_at';
                if (['inventory_movements', 'project_collections'].includes(tableName)) dateField = 'date';
                if (tableName === 'projects') dateField = 'start_date_planned';

                if (filters.fromDate) {
                    query = query.gte(dateField, filters.fromDate);
                }
                if (filters.toDate) {
                    // Para incluir todos los registros del último día, llevamos la hora al final del día
                    query = query.lte(dateField, `${filters.toDate}T23:59:59.999Z`);
                }
            }
            if (filters.projectId) {
                // Filtrar solo si la tabla tiene relación con proyectos
                const projectField = ['inventory_movements', 'project_items', 'project_collections', 'material_requests', 'optimizations', 'quotations', 'usable_offcuts'].includes(tableName) ? 'project_id' : (tableName === 'projects' ? 'id' : null);
                if (projectField) {
                    query = query.eq(projectField, filters.projectId);
                }
            }
        }

        const { data, error } = await query.limit(10000);
        if (error) throw new Error(error.message);
        return data || [];
    },

    // --- Roles & Organigrama ---
    getRoles: async (): Promise<Role[]> => {
        const res = await fetch(`${API_URL}/roles`);
        if (!res.ok) throw new Error('Error al obtener el organigrama');
        return res.json();
    },

    saveRole: async (role: Partial<Role>): Promise<Role> => {
        const res = await fetch(`${API_URL}/roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(role),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Error al guardar la información del puesto');
        }
        return res.json();
    },


    deleteRole: async (id: string): Promise<void> => {
        const res = await fetch(`${API_URL}/roles?id=${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Error al eliminar el puesto');
    },

    // --- Ventas y Tesorería ---

    getVentas: async (): Promise<VentaCabecera[]> => {
        // Phase 1: Fetch all necessary data
        const [optsResult, ventasResult, quotesResult, profilesResult] = await Promise.all([
            supabase
                .from('optimizations')
                .select('id, code, client_name, project_name, created_at')
                .eq('status', 'LISTO_CORTE')
                .order('created_at', { ascending: false }),
            supabase
                .from('ventas_cabecera')
                .select('*'),
            supabase
                .from('quotations')
                .select('code, optimization_id'),
            supabase
                .from('profiles')
                .select('id, display_name'),
        ]);

        let cotizacionesResult: any;
        try {
            cotizacionesResult = await supabase
                .from('cotizaciones')
                .select('codigo, descripcion, numero_comprobante, tipo_documento, comprobante_locked, sustento_comprobante_url, descuento');
            if (cotizacionesResult.error) throw cotizacionesResult.error;
        } catch (err) {
            console.warn("Retrying cotizaciones fetch without comprobante_locked...", err);
            cotizacionesResult = await supabase
                .from('cotizaciones')
                .select('codigo, descripcion, numero_comprobante, tipo_documento, sustento_comprobante_url, descuento');
        }

        const opts = optsResult.data || [];
        const allVentas = ventasResult.data || [];
        const allQuotes = quotesResult.data || [];

        const profileMap = new Map<string, string>();
        (profilesResult.data || []).forEach((p: any) => {
            if (p.id && p.display_name) profileMap.set(p.id, p.display_name);
        });

        const cotDescMap = new Map<string, string>();
        const cotComprobanteMap = new Map<string, string>();
        const cotTipoDocMap = new Map<string, string>();
        const cotLockedMap = new Map<string, boolean>();
        const cotSustentoMap = new Map<string, string>();
        const cotDescuentoMap = new Map<string, number>();
        (cotizacionesResult.data || []).forEach((c: any) => {
            if (c.codigo && c.descripcion) cotDescMap.set(c.codigo, c.descripcion);
            if (c.codigo && c.numero_comprobante) cotComprobanteMap.set(c.codigo, c.numero_comprobante);
            if (c.codigo && c.tipo_documento) cotTipoDocMap.set(c.codigo, c.tipo_documento);
            cotLockedMap.set(c.codigo, !!c.comprobante_locked);
            if (c.codigo && c.sustento_comprobante_url) cotSustentoMap.set(c.codigo, c.sustento_comprobante_url);
            if (c.codigo) cotDescuentoMap.set(c.codigo, Number(c.descuento) || 0);
        });

        // Build mappings for efficient lookup
        const ventaByOptId = new Map<string, any>();
        const ventaByQuoteCode = new Map<string, any>();
        const quoteByOptId = new Map<string, string>();

        allVentas.forEach((v: any) => {
            if (v.optimization_id) ventaByOptId.set(v.optimization_id, v);
            if (v.codigo_cotizacion) ventaByQuoteCode.set(v.codigo_cotizacion, v);
        });

        allQuotes.forEach((q: any) => {
            if (q.optimization_id) quoteByOptId.set(q.optimization_id, q.code);
        });

        // Deduplicate and prioritize real sales
        const finalVentasMap = new Map<string, VentaCabecera>();

        opts.forEach((opt: any) => {
            // Try to find a real sale for this optimization
            let matchedVenta = ventaByOptId.get(opt.id);
            
            if (!matchedVenta) {
                const quoteCode = quoteByOptId.get(opt.id);
                if (quoteCode) {
                    matchedVenta = ventaByQuoteCode.get(quoteCode);
                }
            }

            if (matchedVenta) {
                // Use the real sale, deduplicating by sale ID
                finalVentasMap.set(matchedVenta.id, {
                    ...matchedVenta,
                    usuario_nombre: matchedVenta.usuario_nombre ?? (matchedVenta.user_id ? (profileMap.get(matchedVenta.user_id) ?? null) : null),
                    cotizacion_descripcion: matchedVenta.codigo_cotizacion ? (cotDescMap.get(matchedVenta.codigo_cotizacion) ?? null) : null,
                    cotizacion_numero_comprobante: matchedVenta.codigo_cotizacion ? (cotComprobanteMap.get(matchedVenta.codigo_cotizacion) ?? null) : null,
                    cotizacion_tipo_documento: matchedVenta.codigo_cotizacion ? (cotTipoDocMap.get(matchedVenta.codigo_cotizacion) ?? null) : null,
                    cotizacion_comprobante_locked: matchedVenta.codigo_cotizacion ? (cotLockedMap.get(matchedVenta.codigo_cotizacion) ?? false) : false,
                    cotizacion_sustento_comprobante_url: matchedVenta.codigo_cotizacion ? (cotSustentoMap.get(matchedVenta.codigo_cotizacion) ?? null) : null,
                    cotizacion_descuento: matchedVenta.codigo_cotizacion ? (cotDescuentoMap.get(matchedVenta.codigo_cotizacion) ?? 0) : 0,
                } as VentaCabecera);
            } else {
                // Only if no sale exists, use a stub (deduplicated by opt id)
                const stubId = `opt::${opt.id}`;
                if (!finalVentasMap.has(stubId)) {
                    finalVentasMap.set(stubId, {
                        id: stubId,
                        codigo_cotizacion: opt.code,
                        cliente_nombre: opt.client_name || opt.project_name || 'Sin nombre',
                        monto_total: 0,
                        saldo_pendiente: 0,
                        estado_pago: 'PENDIENTE' as const,
                        descripcion_resumen: null,
                        created_at: opt.created_at,
                        optimization_id: opt.id,
                        cotizacion_descripcion: opt.code ? (cotDescMap.get(opt.code) ?? null) : null,
                        cotizacion_numero_comprobante: opt.code ? (cotComprobanteMap.get(opt.code) ?? null) : null,
                        cotizacion_tipo_documento: opt.code ? (cotTipoDocMap.get(opt.code) ?? null) : null,
                        cotizacion_comprobante_locked: opt.code ? (cotLockedMap.get(opt.code) ?? false) : false,
                        cotizacion_sustento_comprobante_url: opt.code ? (cotSustentoMap.get(opt.code) ?? null) : null,
                        cotizacion_descuento: opt.code ? (cotDescuentoMap.get(opt.code) ?? 0) : 0,
                    } as VentaCabecera);
                }
            }
        });

        // Include ventas from standalone cotizaciones (COT-XXXXXX).
        // These are created by cotizacion_to_venta() and have no optimization_id,
        // so the opts loop above never picks them up.
        allVentas.forEach((v: any) => {
            if (!finalVentasMap.has(v.id) && v.codigo_cotizacion?.startsWith('COT-')) {
                finalVentasMap.set(v.id, {
                    ...v,
                    usuario_nombre: v.usuario_nombre ?? (v.user_id ? (profileMap.get(v.user_id) ?? null) : null),
                    cotizacion_descripcion: v.codigo_cotizacion ? (cotDescMap.get(v.codigo_cotizacion) ?? null) : null,
                    cotizacion_numero_comprobante: v.codigo_cotizacion ? (cotComprobanteMap.get(v.codigo_cotizacion) ?? null) : null,
                    cotizacion_tipo_documento: v.codigo_cotizacion ? (cotTipoDocMap.get(v.codigo_cotizacion) ?? null) : null,
                    cotizacion_comprobante_locked: v.codigo_cotizacion ? (cotLockedMap.get(v.codigo_cotizacion) ?? false) : false,
                    cotizacion_sustento_comprobante_url: v.codigo_cotizacion ? (cotSustentoMap.get(v.codigo_cotizacion) ?? null) : null,
                    cotizacion_descuento: v.codigo_cotizacion ? (cotDescuentoMap.get(v.codigo_cotizacion) ?? 0) : 0,
                } as VentaCabecera);
            }
        });

        // Convert map to array and sort by date descending
        return Array.from(finalVentasMap.values()).sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    },

    getVentaDetalle: async (ventaId: string): Promise<VentaDetalle[]> => {
        const { data, error } = await supabase
            .from('ventas_detalle')
            .select('*')
            .eq('venta_id', ventaId);
        if (error) return [];
        return data || [];
    },

    getTesoreriaMovements: async (): Promise<NodrizaTesoreria[]> => {
        const [movementsResult, profilesResult] = await Promise.all([
            supabase
                .from('nodriza_tesoreria')
                .select('*')
                .order('created_at', { ascending: false }),
            supabase
                .from('profiles')
                .select('id, display_name')
        ]);
        const data = movementsResult.data || [];
        const profileMap = new Map<string, string>();
        (profilesResult.data || []).forEach((p: any) => {
            if (p.id && p.display_name) profileMap.set(p.id, p.display_name);
        });
        return data.map((m: any) => ({
            ...m,
            usuario_nombre: m.usuario_nombre ?? (m.user_id ? (profileMap.get(m.user_id) ?? null) : null)
        })) || [];
    },

    getTesoreriaMovementsByCobro: async (cobroId: string): Promise<NodrizaTesoreria[]> => {
        const [result, profilesResult] = await Promise.all([
            supabase
                .from('nodriza_tesoreria')
                .select('*')
                .eq('cobro_id', cobroId)
                .order('created_at', { ascending: true }),
            supabase
                .from('profiles')
                .select('id, display_name')
        ]);
        const data = result.data || [];
        const profileMap = new Map<string, string>();
        (profilesResult.data || []).forEach((p: any) => {
            if (p.id && p.display_name) profileMap.set(p.id, p.display_name);
        });
        return data.map((m: any) => ({
            ...m,
            usuario_nombre: m.usuario_nombre ?? (m.user_id ? (profileMap.get(m.user_id) ?? null) : null)
        })) || [];
    },

    getTesoreriaMovementsByVenta: async (ventaId: string): Promise<NodrizaTesoreria[]> => {
        const [result, profilesResult] = await Promise.all([
            supabase
                .from('nodriza_tesoreria')
                .select('*')
                .eq('referencia_id', ventaId)
                .order('created_at', { ascending: true }),
            supabase
                .from('profiles')
                .select('id, display_name')
        ]);
        const data = result.data || [];
        const profileMap = new Map<string, string>();
        (profilesResult.data || []).forEach((p: any) => {
            if (p.id && p.display_name) profileMap.set(p.id, p.display_name);
        });
        return data.map((m: any) => ({
            ...m,
            usuario_nombre: m.usuario_nombre ?? (m.user_id ? (profileMap.get(m.user_id) ?? null) : null)
        })) || [];
    },

    createTesoreriaMovement: async (movement: any) => {
        let user_id = null;
        let usuario_nombre = null;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                user_id = user.id;
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name')
                    .eq('id', user.id)
                    .single();
                if (profile) {
                    usuario_nombre = profile.display_name;
                }
            }
        } catch (authErr) {
            console.error("Error fetching auth user/profile:", authErr);
        }

        const payload = { ...movement };
        if (user_id) {
            payload.user_id = user_id;
        }
        if (usuario_nombre) {
            payload.usuario_nombre = usuario_nombre;
        }

        const { error } = await supabase.from('nodriza_tesoreria').insert([payload]);
        if (error) {
            if (
                error.message.includes('column "user_id"') || 
                error.message.includes('column "usuario_nombre"') || 
                error.message.includes('column "tipo_documento"') || 
                error.code === '42703'
            ) {
                console.warn("user_id/usuario_nombre/tipo_documento column does not exist in nodriza_tesoreria, retrying without them...");
                const { user_id: _, usuario_nombre: __, tipo_documento: ___, ...restPayload } = payload;
                const { error: retryError } = await supabase.from('nodriza_tesoreria').insert([restPayload]);
                if (retryError) throw new Error(retryError.message);
            } else {
                throw new Error(error.message);
            }
        }
    },

    updateTesoreriaMovement: async (id: string, movement: Partial<NodrizaTesoreria>) => {
        const { error } = await supabase.from('nodriza_tesoreria').update(movement).eq('id', id);
        if (error) throw new Error(error.message);
    },

    getEgresoDetalles: async (egresoId: string): Promise<import('./types').EgresoDetalleFactura[]> => {
        const { data, error } = await supabase
            .from('egreso_detalle_factura')
            .select('*')
            .eq('egreso_id', egresoId)
            .order('sort_order', { ascending: true });
        if (error) throw new Error(error.message);
        return data || [];
    },

    saveEgresoDetalles: async (egresoId: string, items: import('./types').EgresoDetalleFactura[]): Promise<void> => {
        const { error: delError } = await supabase
            .from('egreso_detalle_factura')
            .delete()
            .eq('egreso_id', egresoId);
        if (delError) throw new Error(delError.message);
        if (items.length === 0) return;
        const rows = items.map((item, idx) => ({
            egreso_id: egresoId,
            sort_order: idx,
            qty: item.qty,
            unit: item.unit,
            description: item.description,
            v_unitario: item.v_unitario,
            base_amount: item.base_amount,
            igv_amount: item.igv_amount,
            amount: item.amount,
            inc_igv: item.inc_igv,
        }));
        const { error: insError } = await supabase.from('egreso_detalle_factura').insert(rows);
        if (insError) throw new Error(insError.message);
    },

    getEgresoAuditLog: async (egresoId: string): Promise<any[]> => {
        const { data, error } = await supabase
            .from('nodriza_tesoreria_audit_log')
            .select('*')
            .eq('egreso_id', egresoId)
            .order('created_at', { ascending: false });
        if (error) return [];
        return data || [];
    },

    logEgresoAudit: async (egresoId: string, evento: string, detalle?: string): Promise<void> => {
        let user_id: string | null = null;
        let usuario_nombre: string | null = null;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                user_id = user.id;
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name')
                    .eq('id', user.id)
                    .single();
                if (profile) usuario_nombre = (profile as any).display_name;
            }
        } catch {}
        try {
            await supabase.from('nodriza_tesoreria_audit_log').insert([{
                egreso_id: egresoId,
                evento,
                detalle: detalle || null,
                usuario_nombre,
                user_id,
            }]);
        } catch {}
    },

    uploadVoucher: async (file: File, referencePrefix: string): Promise<string> => {
        const webpFile = await toWebP(file);
        const fileName = `${referencePrefix}_${Date.now()}.webp`;
        const { error: upError } = await supabase.storage
            .from('vouchers')
            .upload(fileName, webpFile, { contentType: 'image/webp', upsert: true });

        if (upError) throw new Error(upError.message);
        const { data: { publicUrl } } = supabase.storage.from('vouchers').getPublicUrl(fileName);
        return publicUrl;
    },

    uploadInvoice: async (file: File, referencePrefix: string): Promise<string> => {
        const webpFile = await toWebP(file);
        const fileName = `${referencePrefix}_INV_${Date.now()}.webp`;
        const { error: upError } = await supabase.storage
            .from('vouchers')
            .upload(fileName, webpFile, { contentType: 'image/webp', upsert: true });

        if (upError) throw new Error(upError.message);
        const { data: { publicUrl } } = supabase.storage.from('vouchers').getPublicUrl(fileName);
        return publicUrl;
    },

    registrarCobro: async (ventaId: string, montoRecibido: number, cuentaDestino: string, motivoExcedente?: string, numOp?: string, voucherFile?: File) => {
        const { data: venta, error: vError } = await supabase
            .from('ventas_cabecera')
            .select('*')
            .eq('id', ventaId)
            .single();
        if (vError || !venta) throw new Error("Venta no encontrada");

        let voucherUrl = null;
        if (voucherFile && voucherFile.size > 0) {
            try {
                voucherUrl = await api.uploadVoucher(voucherFile, venta.codigo_cotizacion || ventaId);
            } catch (storageErr: any) {
                throw new Error(`Fallo al subir el voucher: ${storageErr.message}`);
            }
        }

        const { data: cobro, error: cError } = await supabase.from('ventas_cobros')
            .insert({
                venta_id: ventaId,
                monto: montoRecibido,
                cuenta_destino: cuentaDestino,
                numero_operacion: numOp || null,
                voucher_url: voucherUrl,
                motivo_excedente: motivoExcedente || null
            })
            .select()
            .single();
        
        if (cError) throw new Error(cError.message);

        let nuevoSaldoPendiente = Number(venta.saldo_pendiente) - montoRecibido;
        let nuevoSaldoAFavor = Number(venta.saldo_a_favor || 0);
        if (nuevoSaldoPendiente < 0) {
            nuevoSaldoAFavor += Math.abs(nuevoSaldoPendiente);
            nuevoSaldoPendiente = 0;
        }

        await supabase.from('ventas_cabecera').update({ 
            saldo_pendiente: nuevoSaldoPendiente, 
            estado_pago: nuevoSaldoPendiente <= 0 ? 'CANCELADO' : 'PARCIAL',
            saldo_a_favor: nuevoSaldoAFavor,
            motivo_pago_excedente: motivoExcedente || venta.motivo_pago_excedente
        }).eq('id', ventaId).throwOnError();

        let currentTipoDoc = null;
        if (venta.codigo_cotizacion) {
            try {
                const { data: cotData } = await supabase
                    .from('cotizaciones')
                    .select('tipo_documento')
                    .eq('codigo', venta.codigo_cotizacion)
                    .maybeSingle();
                if (cotData) {
                    currentTipoDoc = cotData.tipo_documento;
                }
            } catch (err) {
                console.error("Error fetching cotizacion for registrarCobro audit:", err);
            }
        }

        await api.createTesoreriaMovement({
            monto: montoRecibido,
            tipo_movimiento: 'INGRESO',
            cuenta_origen: 'CLIENTE',
            cuenta_destino: cuentaDestino,
            categoria: 'Venta',
            referencia_id: ventaId,
            cobro_id: cobro.id,
            tipo_documento: currentTipoDoc,
            observaciones: `Depósito venta ${venta.codigo_cotizacion || ventaId}${numOp ? ` - Op: ${numOp}` : ''}${motivoExcedente ? ` (JUSTIFICACIÓN EXCEDENTE: ${motivoExcedente})` : ''}`
        });

        return { cobro, nuevoSaldoPendiente, nuevoSaldoAFavor };
    },

    getVentaCobros: async (ventaId: string): Promise<VentaCobro[]> => {
        const { data, error } = await supabase.from('ventas_cobros').select('*').eq('venta_id', ventaId).order('created_at', { ascending: false });
        if (error) return [];
        return data || [];
    },

    confirmarComprobanteVenta: async (
        codigoCotizacion: string,
        tipoDocumento: 'FACTURA' | 'BOLETA' | 'TICKET' | 'COTIZACION',
        numeroComprobante: string,
        userId: string | null,
        sustentoUrl?: string | null
    ): Promise<void> => {
        // 1. Fetch current quotation state to log changes
        const { data: cotData, error: fetchErr } = await supabase
            .from('cotizaciones')
            .select('id, numero_comprobante, tipo_documento, comprobante_locked')
            .eq('codigo', codigoCotizacion)
            .single();
            
        if (fetchErr || !cotData) {
            throw new Error(fetchErr?.message || 'Cotización no encontrada');
        }

        const cotId = cotData.id;
        const oldNum = cotData.numero_comprobante || null;
        const oldTipo = cotData.tipo_documento || null;
        const oldLocked = cotData.comprobante_locked || false;

        const newNum = numeroComprobante.trim() || null;
        const newTipo = tipoDocumento;

        // 2. Update cotizacion: numero_comprobante, tipo_documento, and set comprobante_locked = true
        const updatePayload: any = {
            numero_comprobante: newNum,
            tipo_documento: newTipo,
            ...(sustentoUrl !== undefined ? { sustento_comprobante_url: sustentoUrl } : {})
        };

        try {
            // Try updating with comprobante_locked
            const { error: updateErr } = await supabase
                .from('cotizaciones')
                .update({ ...updatePayload, comprobante_locked: true })
                .eq('id', cotId);
            if (updateErr) throw updateErr;
        } catch (err) {
            console.warn("Failed to update comprobante_locked column, updating only voucher details...", err);
            const { error: updateErr } = await supabase
                .from('cotizaciones')
                .update(updatePayload)
                .eq('id', cotId);
            if (updateErr) throw updateErr;
        }

        // 3. Write to cotizaciones_audit_log
        const auditInserts: any[] = [];
        if (oldNum !== newNum) {
            auditInserts.push({
                cotizacion_id: cotId,
                cotizacion_codigo: codigoCotizacion,
                campo: 'numero_comprobante',
                valor_anterior: oldNum,
                valor_nuevo: newNum,
                user_id: userId || null
            });
        }
        if (oldTipo !== newTipo) {
            auditInserts.push({
                cotizacion_id: cotId,
                cotizacion_codigo: codigoCotizacion,
                campo: 'tipo_documento',
                valor_anterior: oldTipo,
                valor_nuevo: newTipo,
                user_id: userId || null
            });
        }
        if (!oldLocked) {
            auditInserts.push({
                cotizacion_id: cotId,
                cotizacion_codigo: codigoCotizacion,
                campo: 'comprobante_locked',
                valor_anterior: 'FALSE',
                valor_nuevo: 'TRUE',
                user_id: userId || null
            });
        }

        if (auditInserts.length > 0) {
            try {
                await supabase.from('cotizaciones_audit_log').insert(auditInserts);
            } catch (e) {
                console.error("Error writing to audit log", e);
            }
        }
    },

    getUnifiedVentaAuditLog: async (ventaId: string, codigoCotizacion: string | null): Promise<any[]> => {
        const timeline: any[] = [];

        // 1. Fetch cobros (payments)
        const cobros = await api.getVentaCobros(ventaId);
        cobros.forEach((c: any) => {
            timeline.push({
                id: c.id,
                type: 'COBRO',
                monto: c.monto,
                cuenta: c.cuenta_destino,
                numero_operacion: c.numero_operacion,
                voucher_url: c.voucher_url,
                motivo_excedente: c.motivo_excedente,
                created_at: c.created_at,
            });
        });

        // 2. Fetch cotizaciones_audit_log for the codigo_cotizacion
        if (codigoCotizacion) {
            try {
                const [auditResult, profilesResult] = await Promise.all([
                    supabase
                        .from('cotizaciones_audit_log')
                        .select('*')
                        .eq('cotizacion_codigo', codigoCotizacion)
                        .order('created_at', { ascending: false }),
                    supabase
                        .from('profiles')
                        .select('id, display_name')
                ]);

                if (auditResult.data) {
                    const profileMap = new Map<string, string>();
                    (profilesResult.data || []).forEach((p: any) => {
                        if (p.id && p.display_name) profileMap.set(p.id, p.display_name);
                    });

                    auditResult.data.forEach((log: any) => {
                        timeline.push({
                            id: log.id,
                            type: 'AUDIT',
                            campo: log.campo,
                            valor_anterior: log.valor_anterior,
                            valor_nuevo: log.valor_nuevo,
                            usuario_nombre: log.user_id ? (profileMap.get(log.user_id) || 'Usuario') : 'Sistema/Vendedor',
                            created_at: log.created_at
                        });
                    });
                }
            } catch (err) {
                console.error("Error fetching audit logs", err);
            }
        }

        // 3. Fetch ventas_audit_log for this venta (tipo_proyecto changes, etc.)
        try {
            const [ventaAuditResult, profilesResult] = await Promise.all([
                supabase
                    .from('ventas_audit_log')
                    .select('*')
                    .eq('venta_id', ventaId)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('profiles')
                    .select('id, display_name')
            ]);

            if (ventaAuditResult.data && ventaAuditResult.data.length > 0) {
                const profileMap = new Map<string, string>();
                (profilesResult.data || []).forEach((p: any) => {
                    if (p.id && p.display_name) profileMap.set(p.id, p.display_name);
                });

                ventaAuditResult.data.forEach((log: any) => {
                    timeline.push({
                        id: log.id,
                        type: 'AUDIT',
                        campo: log.campo,
                        valor_anterior: log.valor_anterior,
                        valor_nuevo: log.valor_nuevo,
                        usuario_nombre: log.usuario_nombre || (log.user_id ? (profileMap.get(log.user_id) || 'Usuario') : 'Sistema'),
                        created_at: log.created_at
                    });
                });
            }
        } catch (err) {
            console.error("Error fetching ventas_audit_log", err);
        }

        // Sort chronologically descending (newest first)
        return timeline.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },

    updateVentaTipoProyecto: async (ventaId: string, newTipo: 'OBRA' | 'TABLEROS' | null, oldTipo: 'OBRA' | 'TABLEROS' | null) => {
        const { error } = await supabase
            .from('ventas_cabecera')
            .update({ tipo_proyecto: newTipo })
            .eq('id', ventaId);
        if (error) throw new Error(error.message);

        let user_id: string | null = null;
        let usuario_nombre: string | null = null;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                user_id = user.id;
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name')
                    .eq('id', user.id)
                    .maybeSingle();
                if (profile) usuario_nombre = (profile as any).display_name;
            }
        } catch {}

        await supabase.from('ventas_audit_log').insert([{
            venta_id: ventaId,
            campo: 'tipo_proyecto',
            valor_anterior: oldTipo || null,
            valor_nuevo: newTipo || null,
            user_id,
            usuario_nombre,
        }]);
    },

    anularVenta: async (ventaId: string, motivo: string) => {
        const { data: venta, error: vError } = await supabase
            .from('ventas_cabecera')
            .select('*')
            .eq('id', ventaId)
            .single();
        if (vError || !venta) throw new Error("Venta no encontrada");

        let user_id: string | null = null;
        let usuario_nombre: string | null = null;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                user_id = user.id;
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name')
                    .eq('id', user.id)
                    .maybeSingle();
                if (profile) usuario_nombre = (profile as any).display_name;
            }
        } catch {}

        const { error: updateError } = await supabase
            .from('ventas_cabecera')
            .update({ 
                estado_pago: 'ANULADO',
                saldo_pendiente: 0
            })
            .eq('id', ventaId);
        if (updateError) throw new Error(updateError.message);

        // Find all cobros (payments) for this sale
        const { data: cobros, error: cobrosError } = await supabase
            .from('ventas_cobros')
            .select('*')
            .eq('venta_id', ventaId);
        
        if (cobrosError) throw new Error(cobrosError.message);

        // Reverse payments if they exist
        if (cobros && cobros.length > 0) {
            for (const cobro of cobros) {
                await api.createTesoreriaMovement({
                    monto: cobro.monto,
                    tipo_movimiento: 'EGRESO',
                    cuenta_origen: cobro.cuenta_destino,
                    cuenta_destino: 'CLIENTE',
                    categoria: 'Venta',
                    referencia_id: ventaId,
                    cobro_id: cobro.id,
                    observaciones: `Reverso de cobro por Anulación. Motivo: ${motivo}`
                });
            }
        } else {
            // Register a log movement of 0 to store the annulment reason
            await api.createTesoreriaMovement({
                monto: 0,
                tipo_movimiento: 'EGRESO',
                cuenta_origen: 'Efectivo',
                cuenta_destino: 'CLIENTE',
                categoria: 'Venta',
                referencia_id: ventaId,
                observaciones: `Anulación de venta/cotización sin cobros. Motivo: ${motivo}`
            });
        }

        // Log in ventas_audit_log
        try {
            await supabase.from('ventas_audit_log').insert([{
                venta_id: ventaId,
                campo: 'estado_pago',
                valor_anterior: venta.estado_pago,
                valor_nuevo: 'ANULADO',
                user_id,
                usuario_nombre,
            }]);
        } catch (auditErr) {
            console.error("Error logging audit for annulment:", auditErr);
        }
    },

    updateEgresoTipoProyecto: async (egresoId: string, newTipo: 'OBRA' | 'TABLEROS' | null, oldTipo: 'OBRA' | 'TABLEROS' | null) => {
        const { error } = await supabase
            .from('nodriza_tesoreria')
            .update({ tipo_proyecto: newTipo })
            .eq('id', egresoId);
        if (error) throw new Error(error.message);

        let user_id: string | null = null;
        let usuario_nombre: string | null = null;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                user_id = user.id;
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name')
                    .eq('id', user.id)
                    .maybeSingle();
                if (profile) usuario_nombre = (profile as any).display_name;
            }
        } catch {}

        const oldLabel = oldTipo || 'Sin asignar';
        const newLabel = newTipo || 'Sin asignar';

        await supabase.from('nodriza_tesoreria_audit_log').insert([{
            egreso_id: egresoId,
            evento: 'TIPO_PROYECTO_CAMBIADO',
            detalle: `Tipo de proyecto cambiado de "${oldLabel}" a "${newLabel}"`,
            user_id,
            usuario_nombre,
        }]);
    },

    getCompras: async (): Promise<NodrizaTesoreria[]> => {
        const [comprasResult, profilesResult] = await Promise.all([
            supabase
                .from('nodriza_tesoreria')
                .select('*')
                .eq('tipo_movimiento', 'EGRESO')
                .order('created_at', { ascending: false }),
            supabase
                .from('profiles')
                .select('id, display_name')
        ]);
        const data = comprasResult.data || [];
        const profileMap = new Map<string, string>();
        (profilesResult.data || []).forEach((p: any) => {
            if (p.id && p.display_name) profileMap.set(p.id, p.display_name);
        });
        return data.map((m: any) => ({
            ...m,
            usuario_nombre: m.usuario_nombre ?? (m.user_id ? (profileMap.get(m.user_id) ?? null) : null)
        })) || [];
    },

    // --- Proveedores ---
    getProveedores: async (): Promise<Proveedor[]> => {
        const { data, error } = await supabase.from('proveedores').select('*').order('razon_social');
        if (error) return [];
        return data || [];
    },

    saveProveedor: async (proveedor: Partial<Proveedor>) => {
        const { id, ...rest } = proveedor;
        const req = id ? supabase.from('proveedores').update(rest).eq('id', id) : supabase.from('proveedores').insert([rest]);
        const { error } = await req;
        if (error) throw new Error(error.message);
    },

    deleteProveedor: async (id: string) => {
        const { error } = await supabase.from('proveedores').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },

    // --- Órdenes de Pago ---
    getOrdenesPago: async (): Promise<OrdenPago[]> => {
        const { data, error } = await supabase
            .from('ordenes_pago')
            .select('*, proveedor:proveedores(*), conceptos:detalles_orden(*)')
            .order('created_at', { ascending: false });
        if (error) {
            console.error("Error fetching ordenes:", error);
            return [];
        }
        return data || [];
    },

    getDetallesOrden: async (ordenId: string): Promise<DetalleOrden[]> => {
        const { data, error } = await supabase
            .from('detalles_orden')
            .select('*')
            .eq('orden_id', ordenId);
        if (error) return [];
        return data || [];
    },

    saveOrdenPago: async (orden: any, detalles: any[]) => {
        const { id, ...ordenData } = orden;
        
        let savedOrden;
        if (id) {
            const { data, error } = await supabase.from('ordenes_pago').update(ordenData).eq('id', id).select().single();
            if (error) throw new Error(error.message);
            savedOrden = data;
        } else {
            const { data, error } = await supabase.from('ordenes_pago').insert([ordenData]).select().single();
            if (error) throw new Error(error.message);
            savedOrden = data;
        }

        // Sincronizar detalles
        if (detalles && detalles.length > 0) {
            await supabase.from('detalles_orden').delete().eq('orden_id', savedOrden.id);
            const { error: dError } = await supabase.from('detalles_orden').insert(
                detalles.map(d => ({ ...d, orden_id: savedOrden.id }))
            );
            if (dError) throw new Error(dError.message);
        }

        return savedOrden;
    },

    uploadOrdenFile: async (file: File, folder: 'facturas' | 'evidencias'): Promise<string> => {
        const extension = file.name.split('.').pop();
        const fileName = `${folder}_${Date.now()}.${extension}`;
        const { error: upError } = await supabase.storage
            .from('ordenes_pago')
            .upload(`${folder}/${fileName}`, file, { upsert: true });
        
        if (upError) throw new Error(upError.message);
        const { data: { publicUrl } } = supabase.storage.from('ordenes_pago').getPublicUrl(`${folder}/${fileName}`);
        return publicUrl;
    },

    actualizarComprobanteOrden: async (ordenId: string, newUrl: string): Promise<string> => {
        const { data: orden, error } = await supabase
            .from('ordenes_pago')
            .select('url_factura')
            .eq('id', ordenId)
            .single();
        if (error) throw new Error(error.message);
        const existing = orden.url_factura ? orden.url_factura.split('|').filter(Boolean) : [];
        const updated = [...existing, newUrl].join('|');
        const { error: uError } = await supabase
            .from('ordenes_pago')
            .update({ url_factura: updated })
            .eq('id', ordenId);
        if (uError) throw new Error(uError.message);
        return updated;
    },

    actualizarEvidenciaOrden: async (ordenId: string, newUrl: string): Promise<string> => {
        const { data: orden, error } = await supabase
            .from('ordenes_pago')
            .select('url_evidencia')
            .eq('id', ordenId)
            .single();
        if (error) throw new Error(error.message);
        const existing = orden.url_evidencia ? orden.url_evidencia.split('|').filter(Boolean) : [];
        const updated = [...existing, newUrl].join('|');
        const { error: uError } = await supabase
            .from('ordenes_pago')
            .update({ url_evidencia: updated })
            .eq('id', ordenId);
        if (uError) throw new Error(uError.message);
        return updated;
    },

    pagarOrdenPago: async (ordenId: string, cuentaOrigen: string, fechaPago: string, numOperacion?: string, voucherUrl?: string) => {
        // 1. Obtener orden
        const { data: orden, error: oError } = await supabase
            .from('ordenes_pago')
            .select('*, proveedor:proveedores(razon_social)')
            .eq('id', ordenId)
            .single();
        if (oError || !orden) throw new Error("Orden no encontrada");

        // 2. Actualizar estado, fecha pago y METADATOS de pago
        await supabase.from('ordenes_pago').update({
            estado: 'pagado',
            fecha_pago: fechaPago,
            cuenta_pagadora: cuentaOrigen,
            num_operacion: numOperacion || null,
            voucher_url: voucherUrl || null
        }).eq('id', ordenId).throwOnError();

        // 3. Crear movimiento en tesorería
        await api.createTesoreriaMovement({
            monto: orden.monto_total,
            tipo_movimiento: 'EGRESO',
            cuenta_origen: cuentaOrigen,
            categoria: 'Pago Proveedor',
            referencia_id: orden.id, 
            numero_operacion: numOperacion || null,
            voucher_url: voucherUrl || null,
            invoice_status: 'BORRADOR',
            observaciones: `Pago a ${orden.proveedor?.razon_social} por ${orden.obra_nombre || 'Obra no especificada'} - Orden ${orden.codigo_orden}`
        });

        return true;
    }
};
