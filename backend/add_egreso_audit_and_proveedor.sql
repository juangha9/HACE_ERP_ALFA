-- ============================================================
-- 1. Agrega proveedor_nombre a nodriza_tesoreria
--    (dato de cabecera de factura, no por línea de detalle)
-- 2. Crea tabla de historial / auditoría para egresos
-- ============================================================

ALTER TABLE nodriza_tesoreria
    ADD COLUMN IF NOT EXISTS proveedor_nombre TEXT;

-- ------------------------------------------------------------
-- Historial de egresos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nodriza_tesoreria_audit_log (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    egreso_id      UUID         NOT NULL REFERENCES nodriza_tesoreria(id) ON DELETE CASCADE,
    evento         TEXT         NOT NULL,   -- 'CREACION', 'FACTURA_REGISTRADA', 'PROVEEDOR_REGISTRADO', etc.
    detalle        TEXT,                    -- descripción libre del cambio
    usuario_nombre TEXT,
    user_id        UUID,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nodriza_tesoreria_audit_log_egreso_id_idx
    ON nodriza_tesoreria_audit_log (egreso_id);

ALTER TABLE nodriza_tesoreria_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'nodriza_tesoreria_audit_log'
          AND policyname = 'egreso_audit_authenticated_all'
    ) THEN
        CREATE POLICY "egreso_audit_authenticated_all"
            ON nodriza_tesoreria_audit_log FOR ALL TO authenticated
            USING (true) WITH CHECK (true);
    END IF;
END $$;
