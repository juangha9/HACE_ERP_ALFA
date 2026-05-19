-- ==========================================
-- MIGRACIÓN: N° Comprobante en Cotizaciones
-- ==========================================

-- 1. Agregar columna numero_comprobante a cotizaciones
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS numero_comprobante TEXT;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_numero_comprobante
    ON cotizaciones(numero_comprobante)
    WHERE numero_comprobante IS NOT NULL;

-- 2. Tabla de auditoría para cambios en cotizaciones
CREATE TABLE IF NOT EXISTS cotizaciones_audit_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id     UUID NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    cotizacion_codigo TEXT,
    campo             TEXT NOT NULL,
    valor_anterior    TEXT,
    valor_nuevo       TEXT,
    user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cot_audit_cotizacion ON cotizaciones_audit_log(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_cot_audit_created    ON cotizaciones_audit_log(created_at);

ALTER TABLE cotizaciones_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'cotizaciones_audit_log'
          AND policyname = 'Enable all for cotizaciones_audit_log'
    ) THEN
        CREATE POLICY "Enable all for cotizaciones_audit_log"
        ON cotizaciones_audit_log FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
