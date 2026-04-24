
-- ==========================================
-- SCRIPT PARA MÓDULO DE SOLICITUDES Y PROVEEDORES
-- ==========================================

-- 1. Tabla de Proveedores (Maestro)
CREATE TABLE IF NOT EXISTS proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    razon_social TEXT NOT NULL,
    tax_id TEXT, -- RUC o DNI
    banco_nombre TEXT,
    cuenta_bancaria TEXT,
    numero_contacto TEXT,
    email_contacto TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Órdenes de Pago
CREATE TABLE IF NOT EXISTS ordenes_pago (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_orden TEXT UNIQUE, -- Formato: OP-yyyy-mm-correlativo
    fecha_emision TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    proveedor_id UUID REFERENCES proveedores(id) ON DELETE RESTRICT,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL, -- Relación con obra
    obra_nombre TEXT, -- Nombre de la obra para redundancia/fácil acceso
    moneda TEXT CHECK (moneda IN ('PEN', 'USD')) DEFAULT 'PEN',
    monto_subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_impuestos NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
    estado TEXT CHECK (estado IN ('enviado', 'pagado', 'anulado', 'rechazado')) DEFAULT 'enviado',
    url_factura TEXT, -- Link a Supabase Storage
    url_evidencia TEXT, -- Link a Supabase Storage
    fecha_pago TIMESTAMP WITH TIME ZONE,
    -- Columnas de Tesorería (Post-Pago)
    cuenta_pagadora TEXT,
    num_operacion TEXT,
    voucher_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabla Detalle de la Orden
CREATE TABLE IF NOT EXISTS detalles_orden (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id UUID REFERENCES ordenes_pago(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL,
    cantidad NUMERIC(15, 4) NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(15, 4) NOT NULL DEFAULT 0,
    subtotal_item NUMERIC(15, 2) NOT NULL DEFAULT 0
);

-- 4. Función para generar el código correlativo de la orden
CREATE OR REPLACE FUNCTION generate_orden_pago_code()
RETURNS TRIGGER AS $$
DECLARE
    v_year TEXT;
    v_month TEXT;
    v_correlative INTEGER;
    v_code TEXT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');
    v_month := TO_CHAR(NOW(), 'MM');
    
    -- Contar órdenes del mes/año actual
    SELECT COUNT(*) INTO v_correlative
    FROM ordenes_pago
    WHERE TO_CHAR(fecha_emision, 'YYYY-MM') = v_year || '-' || v_month;
    
    v_correlative := v_correlative + 1;
    v_code := 'OP-' || v_year || '-' || v_month || '-' || LPAD(v_correlative::TEXT, 4, '0');
    
    NEW.codigo_orden := v_code;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para ejecutar la función antes de insertar
DROP TRIGGER IF EXISTS trg_generate_orden_pago_code ON ordenes_pago;
CREATE TRIGGER trg_generate_orden_pago_code
BEFORE INSERT ON ordenes_pago
FOR EACH ROW
WHEN (NEW.codigo_orden IS NULL)
EXECUTE FUNCTION generate_orden_pago_code();

-- 5. Habilitar RLS y Políticas
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalles_orden ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for proveedores') THEN
        CREATE POLICY "Enable all for proveedores" ON proveedores FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for ordenes_pago') THEN
        CREATE POLICY "Enable all for ordenes_pago" ON ordenes_pago FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for detalles_orden') THEN
        CREATE POLICY "Enable all for detalles_orden" ON detalles_orden FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 6. Inicializar Bucket de Almacenamiento (Supabase Storage)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('ordenes_pago', 'ordenes_pago', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Políticas de Storage para el bucket 'ordenes_pago'
DO $$
BEGIN
    -- Política para permitir lectura pública
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access for ordenes_pago' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Public Access for ordenes_pago" ON storage.objects FOR SELECT USING (bucket_id = 'ordenes_pago');
    END IF;
    -- Política para permitir subida pública
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Upload for ordenes_pago' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Public Upload for ordenes_pago" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'ordenes_pago');
    END IF;
END $$;
