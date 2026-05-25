
-- ==========================================
-- SCRIPT PARA GESTIÓN DE VENTAS Y TESORERÍA
-- ==========================================

-- 1. Tabla Nodriza de Tesorería (Flujo de Caja Real)
CREATE TABLE IF NOT EXISTS nodriza_tesoreria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    monto NUMERIC(15, 2) NOT NULL,
    tipo_movimiento TEXT CHECK (tipo_movimiento IN ('INGRESO', 'EGRESO', 'TRANSFERENCIA')),
    cuenta_origen TEXT, -- Ej: 'Efectivo', 'Bancos'
    cuenta_destino TEXT, -- Usado en TRANSFERENCIAS o para indicar destino de ingreso
    categoria TEXT, -- Ej: 'Venta', 'Compra Material', 'Sueldos', 'Servicios'
    referencia_id UUID, -- Conecta con ventas_cabecera o gastos (opcional)
    cobro_id UUID, -- Conexión directa con el registro de cobro específico
    observaciones TEXT,
    referencia_obra_venta TEXT -- Referencia libre de la obra o venta asociada
);

-- 2. Tabla Cabecera de Ventas
CREATE TABLE IF NOT EXISTS ventas_cabecera (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_venta TEXT UNIQUE, -- Ej: VTA-260525-001 (Código único autogenerado de venta)
    codigo_cotizacion TEXT, -- Ej: COT-260521-002 (Código de cotización de procedencia)
    cliente_nombre TEXT NOT NULL,
    monto_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
    saldo_pendiente NUMERIC(15, 2) NOT NULL DEFAULT 0,
    estado_pago TEXT CHECK (estado_pago IN ('PENDIENTE', 'PARCIAL', 'CANCELADO', 'ANULADO')) DEFAULT 'PENDIENTE',
    descripcion_resumen TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    optimization_id UUID REFERENCES optimizations(id), -- Link a la tabla de optimizaciones existente
    CONSTRAINT unique_codigo_cotizacion UNIQUE (codigo_cotizacion)
);

-- 3. Tabla Detalle de Ventas (Desglose del Optimizador)
CREATE TABLE IF NOT EXISTS ventas_detalle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id UUID REFERENCES ventas_cabecera(id) ON DELETE CASCADE,
    material_insumo TEXT NOT NULL,
    cantidad NUMERIC(15, 4) NOT NULL,
    precio_unitario NUMERIC(15, 4) NOT NULL,
    total NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabla de Cobros de Ventas (Historial de Depósitos)
CREATE TABLE IF NOT EXISTS ventas_cobros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id UUID REFERENCES ventas_cabecera(id) ON DELETE CASCADE,
    monto NUMERIC(15, 2) NOT NULL,
    cuenta_destino TEXT NOT NULL, -- Efectivo o Bancos
    numero_operacion TEXT, -- Solo para Bancos
    voucher_url TEXT, -- URL de la imagen en storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_tesoreria_ref ON nodriza_tesoreria(referencia_id);
CREATE INDEX IF NOT EXISTS idx_tesoreria_cobro ON nodriza_tesoreria(cobro_id);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas_cabecera(cliente_nombre);
CREATE INDEX IF NOT EXISTS idx_ventas_detalle_venta ON ventas_detalle(venta_id);
CREATE INDEX IF NOT EXISTS idx_ventas_cobros_venta ON ventas_cobros(venta_id);


-- Habilitar RLS
ALTER TABLE nodriza_tesoreria ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_cabecera ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_detalle ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso generales para desarrollo
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for nodriza_tesoreria') THEN
        CREATE POLICY "Enable all for nodriza_tesoreria" ON nodriza_tesoreria FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for ventas_cabecera') THEN
        CREATE POLICY "Enable all for ventas_cabecera" ON ventas_cabecera FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for ventas_detalle') THEN
        CREATE POLICY "Enable all for ventas_detalle" ON ventas_detalle FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for ventas_cobros') THEN
        CREATE POLICY "Enable all for ventas_cobros" ON ventas_cobros FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

