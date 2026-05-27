-- =========================================================================
-- MIGRACIÓN: SKU CORTO, SERVICIOS Y AUDITORÍA DE PRODUCTOS
-- Ejecutar en el SQL Editor de Supabase
-- =========================================================================

-- 1. Agregar columnas a catalog_products para SKU corto y servicios
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS sku_corto VARCHAR(4) UNIQUE;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT FALSE;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS has_associated_service BOOLEAN DEFAULT FALSE;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS associated_service_id UUID REFERENCES catalog_products(id) ON DELETE SET NULL;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS service_pricing_type TEXT DEFAULT 'MONEDA' CHECK (service_pricing_type IN ('MONEDA', 'PORCENTAJE'));
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS service_pricing_value NUMERIC(15, 4) DEFAULT 0;

-- Crear un índice rápido para buscar por sku_corto de forma eficiente
CREATE INDEX IF NOT EXISTS idx_catalog_products_sku_corto 
    ON catalog_products(sku_corto) 
    WHERE sku_corto IS NOT NULL;

-- 2. Tabla de auditoría para cambios en el catálogo de productos (Solo Administrador)
CREATE TABLE IF NOT EXISTS catalog_products_audit_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
    campo             TEXT NOT NULL, -- e.g., 'sku_corto'
    valor_anterior    TEXT,
    valor_nuevo       TEXT,
    motivo            TEXT,
    user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    usuario_nombre    TEXT,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_audit_product ON catalog_products_audit_log(product_id);
CREATE INDEX IF NOT EXISTS idx_catalog_audit_created ON catalog_products_audit_log(created_at);

-- Habilitar RLS (Row Level Security) en la nueva tabla de auditoría
ALTER TABLE catalog_products_audit_log ENABLE ROW LEVEL SECURITY;

-- Crear política de lectura y escritura libre para desarrollo interno
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'catalog_products_audit_log' 
          AND policyname = 'Enable all for catalog_products_audit_log'
    ) THEN
        CREATE POLICY "Enable all for catalog_products_audit_log" 
        ON catalog_products_audit_log FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 3. Modificaciones en cotizaciones para el soporte de aprobación de descuentos
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS descuento_sugerido NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS descuento_sugerido_porcentaje NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS descuento_solicitado BOOLEAN DEFAULT FALSE;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS descuento_estado_aprobacion TEXT DEFAULT 'NINGUNO' 
    CHECK (descuento_estado_aprobacion IN ('NINGUNO', 'PENDIENTE', 'APROBADO', 'RECHAZADO'));
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS descuento_motivo_solicitud TEXT;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS descuento_comentarios_admin TEXT;

-- Crear índice para búsquedas rápidas de solicitudes de descuento pendientes
CREATE INDEX IF NOT EXISTS idx_cotizaciones_descuento_pendientes
    ON cotizaciones(descuento_estado_aprobacion)
    WHERE descuento_estado_aprobacion = 'PENDIENTE';
