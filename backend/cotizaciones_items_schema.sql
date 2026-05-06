-- ==========================================
-- TABLA RELACIONAL DE ÍTEMS DE COTIZACIONES
-- ==========================================
-- Cada fila de la cotización se guarda aquí como registro independiente,
-- además del JSONB items en la tabla cotizaciones.
-- Permite filtros, reportes y control detallado de materiales.
-- ==========================================

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS cotizaciones_items (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id   UUID    NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    linea           INTEGER NOT NULL DEFAULT 1,          -- nro de línea dentro de la cotización
    cantidad        NUMERIC(15, 4) NOT NULL DEFAULT 0,
    unidad          TEXT    NOT NULL DEFAULT 'UND',
    descripcion     TEXT    NOT NULL DEFAULT '',
    precio_unitario NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total           NUMERIC(15, 2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_cot_items_cotizacion  ON cotizaciones_items(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_cot_items_descripcion ON cotizaciones_items(descripcion);
CREATE INDEX IF NOT EXISTS idx_cot_items_unidad      ON cotizaciones_items(unidad);

-- 3. RLS
ALTER TABLE cotizaciones_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Enable all for cotizaciones_items'
    ) THEN
        CREATE POLICY "Enable all for cotizaciones_items"
        ON cotizaciones_items FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ==========================================
-- MIGRACIÓN: poblar desde el JSONB existente
-- Ejecutar una sola vez si ya hay cotizaciones
-- con ítems guardados en la columna items (JSONB).
-- ==========================================

INSERT INTO cotizaciones_items
    (cotizacion_id, linea, cantidad, unidad, descripcion, precio_unitario, total)
SELECT
    c.id,
    ordinality::INTEGER                                    AS linea,
    COALESCE((item->>'cantidad')::NUMERIC,        0)       AS cantidad,
    COALESCE( item->>'unidad',        'UND')               AS unidad,
    COALESCE( item->>'descripcion',   '')                  AS descripcion,
    COALESCE((item->>'precio_unitario')::NUMERIC, 0)       AS precio_unitario,
    COALESCE((item->>'total')::NUMERIC,           0)       AS total
FROM cotizaciones c,
     jsonb_array_elements(c.items) WITH ORDINALITY AS t(item, ordinality)
WHERE c.items IS NOT NULL
  AND jsonb_array_length(c.items) > 0
ON CONFLICT DO NOTHING;
