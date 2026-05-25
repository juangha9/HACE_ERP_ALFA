
export interface Project {
    id: string;
    project_number: string;
    name: string;
    client_name: string;
    start_date_planned: string | null;
    end_date_planned: string | null;
    budget_total: number;
    amount_collected: number;
    amount_pending: number;
    start_date_real?: string | null;
    end_date_real?: string | null;
    observations?: string;
    location?: any;
    metadata?: any;
    status: 'INICIO' | 'EN_EJECUCION' | 'FINALIZADO' | 'CERRADO' | 'PENDIENTE_COBRO' | 'BORRADOR' | 'ENVIADO' | 'POR APROBAR' | 'APROBADO';
    retail_board?: any;
    created_at?: string;
}

export interface ProjectItem {
    id: string;
    project_id: string;
    category: 'MATERIAL' | 'MANO_OBRA' | 'MOVILIDAD' | 'ADICIONAL_MATERIAL' | 'ADICIONAL_MANO_OBRA' | 'ADICIONAL_MOVILIDAD';
    description: string;
    unit: string;
    planned_qty: number;
    planned_unit_price: number;
    real_qty: number;
    real_unit_price: number;
    origin: string;
    transaction_date: string;
    supplier: string;
    created_at?: string;
}

export interface Collection {
    id: string;
    project_id: string;
    date: string;
    description: string;
    account: '2049' | '8059' | '9001' | '4071' | 'EFECTIVO' | 'YAPE';
    amount: number;
    created_at?: string;
}

export type CollectionInsert = Omit<Collection, 'id' | 'created_at'>;

// Inventory Interfaces
export interface Contact {
    id: string;
    type: 'CLIENT' | 'SUPPLIER' | 'BOTH';
    name: string;
    tax_id?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
}

export interface InventoryLocation {
    id: string;
    name: string;
    description?: string;
}

export interface InventoryProduct {
    id: string;
    sku: string;
    name: string;
    description?: string;
    category?: string;
    family?: string;
    subfamily?: string;
    unit: string;
    stock_current: number;
    min_stock: number;
    average_cost: number;
    last_purchase_price: number;
    unit_price_sale: number;
    location_id?: string;
    location?: InventoryLocation;
    image_url?: string;
    created_at?: string;
}

export interface InventoryMovement {
    id: string;
    product_id: string;
    type: 'IN_PURCHASE' | 'IN_RETURN' | 'IN_ADJUSTMENT' | 'OUT_SALE' | 'OUT_PROJECT' | 'OUT_LOSS' | 'OUT_ADJUSTMENT' | 'IN_RETURN_CLIENT' | 'IN_TOOL_RETURN' | 'IN_PROJECT_LEFTOVER' | 'IN_OTHER' | 'OUT_PROJECT_CONSUMPTION' | 'OUT_TOOL_LOAN' | 'OUT_OTHER';
    date: string;
    quantity: number;
    unit_cost?: number;
    total_cost?: number;
    contact_id?: string;
    project_id?: string;
    invoice_number?: string;
    observations?: string;
    contact?: Contact;
    product?: InventoryProduct;
}

// Optimization & Retail Boards
export interface OptimizationFlow {
    id: string;
    code: string | null;
    origin_type: 'VENTA_DIRECTA' | 'PROYECTO';
    project_id: string | null;
    status: 'BORRADOR' | 'PENDIENTE_PAGO' | 'LISTO_CORTE';
    data: any; // Using any for the JSONB payload (holds config, pieces, boards)
    created_at?: string;
    updated_at?: string;
}

export interface MaterialRequest {
    id: string;
    optimization_id: string | null;
    project_id: string | null;
    product_id: string;
    quantity: number;
    status: 'PENDIENTE' | 'APROBADO' | 'SOLICITAR_COMPRA';
    created_at?: string;
    updated_at?: string;

    // Joined standard fields
    product?: Pick<InventoryProduct, 'name' | 'sku' | 'stock_current' | 'unit'>;
}

export interface BusinessInfo {
    id: string;
    company_name: string;
    ruc?: string;
    address?: string;
    email?: string;
    phone?: string;
    created_at?: string;
    updated_at?: string;
}

export interface Quotation {
    id: string;
    code: string;
    optimization_id?: string;
    client_name: string;
    client_doi?: string;
    client_address?: string;
    document_type: 'BOLETA' | 'FACTURA';
    issue_date: string;
    delivery_date: string;
    items: any[]; // JSONB
    subtotal: number;
    discount: number;
    igv: number;
    total: number;
    advance: number;
    balance: number;
    comprobante_locked?: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface EgresoDetalleFactura {
    id?: string;
    egreso_id: string;
    sort_order: number;
    qty: number;
    unit: string;
    description: string;
    v_unitario: number;
    base_amount: number;
    igv_amount: number;
    amount: number;
    inc_igv: boolean;
    created_at?: string;
}

export interface NodrizaTesoreria {
    id: string;
    created_at: string;
    monto: number;
    tipo_movimiento: 'INGRESO' | 'EGRESO' | 'TRANSFERENCIA';
    cuenta_origen: string;
    cuenta_destino?: string;
    categoria: string;
    referencia_id?: string;
    cobro_id?: string;
    numero_operacion?: string;
    voucher_url?: string;
    observaciones?: string;
    has_invoice?: boolean;
    invoice_url?: string;
    invoice_details?: any; // JSONB
    invoice_serie?: string;
    invoice_correlativo?: string;
    mismatch_reason?: string;
    invoice_subtotal?: number;
    invoice_igv?: number;
    invoice_total?: number;
    invoice_status?: 'BORRADOR' | 'REGISTRADO';
    proveedor_nombre?: string | null;
    user_id?: string | null;
    usuario_nombre?: string | null;
    tipo_documento?: 'FACTURA' | 'BOLETA' | 'TICKET' | 'COTIZACION' | null;
    tipo_proyecto?: 'OBRA' | 'TABLEROS' | null;
}

export interface VentaCabecera {
    id: string;
    codigo_venta?: string | null;
    codigo_cotizacion: string | null;
    cliente_nombre: string;
    monto_total: number;
    saldo_pendiente: number;
    estado_pago: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'ANULADO';
    descripcion_resumen?: string | null;
    created_at: string;
    optimization_id?: string | null;
    saldo_a_favor?: number;
    motivo_pago_excedente?: string | null;
    user_id?: string | null;
    usuario_nombre?: string | null;
    cotizacion_descripcion?: string | null;
    cotizacion_numero_comprobante?: string | null;
    cotizacion_tipo_documento?: 'FACTURA' | 'BOLETA' | 'TICKET' | 'COTIZACION' | null;
    cotizacion_comprobante_locked?: boolean | null;
    cotizacion_sustento_comprobante_url?: string | null;
    tipo_proyecto?: 'OBRA' | 'TABLEROS' | null;
}


export interface VentaDetalle {
    id: string;
    venta_id: string;
    material_insumo: string;
    cantidad: number;
    precio_unitario: number;
    total: number;
}

export interface VentaCobro {
    id: string;
    venta_id: string;
    monto: number;
    cuenta_destino: string;
    numero_operacion?: string;
    voucher_url?: string;
    motivo_excedente?: string;
    created_at: string;
}

// --- Solicitudes & Proveedores ---
export interface Proveedor {
    id: string;
    razon_social: string;
    tax_id: string;
    banco_nombre: string;
    cuenta_bancaria: string;
    numero_contacto: string;
    email_contacto: string;
    created_at?: string;
}

export interface OrdenPago {
    id: string;
    codigo_orden: string;
    fecha_emision: string;
    proveedor_id: string;
    project_id?: string;
    obra_nombre?: string;
    moneda: 'PEN' | 'USD';
    monto_subtotal: number;
    monto_impuestos: number;
    monto_total: number;
    estado: 'enviado' | 'pagado' | 'anulado' | 'rechazado';
    url_factura?: string;
    url_evidencia?: string;
    // Payment Tracking
    cuenta_pagadora?: string;
    fecha_pago?: string;
    num_operacion?: string;
    voucher_url?: string;
    motivo_cambio?: string;
    created_at?: string;
    proveedor?: Proveedor;
    proveedores?: Proveedor; // Alias sometimes used in joins
    conceptos?: DetalleOrden[];
}

export interface DetalleOrden {
    id: string;
    orden_id: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    subtotal_item: number;
}
