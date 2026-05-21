-- Migration: Agregar columna tipo_proyecto a ventas y egresos + tabla de auditoría de ventas

-- 1. Agregar tipo_proyecto a ventas_cabecera (para identificar si la venta es OBRA o TABLEROS)
ALTER TABLE ventas_cabecera
  ADD COLUMN IF NOT EXISTS tipo_proyecto TEXT
  CHECK (tipo_proyecto IN ('OBRA', 'TABLEROS'));

-- 2. Agregar tipo_proyecto a nodriza_tesoreria (para identificar si el egreso es OBRA o TABLEROS)
ALTER TABLE nodriza_tesoreria
  ADD COLUMN IF NOT EXISTS tipo_proyecto TEXT
  CHECK (tipo_proyecto IN ('OBRA', 'TABLEROS'));

-- 3. Crear tabla de auditoría de ventas para registrar cambios en ventas_cabecera
--    (incluye cambios de tipo_proyecto y otros campos futuros)
CREATE TABLE IF NOT EXISTS ventas_audit_log (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id       UUID         NOT NULL REFERENCES ventas_cabecera(id) ON DELETE CASCADE,
    campo          TEXT         NOT NULL,
    valor_anterior TEXT,
    valor_nuevo    TEXT,
    user_id        UUID         REFERENCES auth.users(id),
    usuario_nombre TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE ventas_audit_log ENABLE ROW LEVEL SECURITY;

-- Política: acceso total (misma lógica que otras tablas del sistema)
DROP POLICY IF EXISTS "allow_all_ventas_audit" ON ventas_audit_log;
CREATE POLICY "allow_all_ventas_audit" ON ventas_audit_log
    FOR ALL USING (true) WITH CHECK (true);

-- Índice para consultas por venta
CREATE INDEX IF NOT EXISTS ventas_audit_log_venta_id_idx
    ON ventas_audit_log (venta_id);
