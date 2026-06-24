-- =========================================================================
-- REQUERIMIENTOS LOGÍSTICA
-- Tabla que recibe los ítems de cada cotización que alcanza estado 'LISTO'.
-- Sirve como aviso en tiempo real para el almacenero en el Dashboard de Inventario.
-- =========================================================================

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS requerimientos_logistica (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cotizacion_id     UUID NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    codigo_cotizacion TEXT NOT NULL,
    cliente_nombre    TEXT NOT NULL,
    descripcion       TEXT NOT NULL,
    cantidad          NUMERIC(10, 2),
    unidad            TEXT,
    estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'revisado')),
    observacion       TEXT,
    revisado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revisado_en       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_req_logistica_estado     ON requerimientos_logistica(estado);
CREATE INDEX IF NOT EXISTS idx_req_logistica_cotizacion ON requerimientos_logistica(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_req_logistica_created    ON requerimientos_logistica(created_at DESC);

-- 3. Función trigger
--    Se activa cuando cotizaciones.estado cambia a 'LISTO'.
--    Lee cotizaciones_items (ya sincronizados antes del UPDATE de estado)
--    e inserta un registro por cada ítem con descripción no vacía.
CREATE OR REPLACE FUNCTION fn_crear_requerimientos_logistica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.estado = 'LISTO' AND (OLD.estado IS DISTINCT FROM 'LISTO') THEN
        -- Limpia requerimientos previos de esta cotización (por si se reprocesa)
        DELETE FROM requerimientos_logistica WHERE cotizacion_id = NEW.id;

        INSERT INTO requerimientos_logistica
            (cotizacion_id, codigo_cotizacion, cliente_nombre, descripcion, cantidad, unidad)
        SELECT
            NEW.id,
            NEW.codigo,
            NEW.cliente_nombre,
            ci.descripcion,
            ci.cantidad,
            ci.unidad
        FROM cotizaciones_items ci
        WHERE ci.cotizacion_id = NEW.id
          AND ci.descripcion IS NOT NULL
          AND TRIM(ci.descripcion) != '';
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Trigger (se recrea para evitar duplicados)
DROP TRIGGER IF EXISTS trg_cotizacion_listo_logistica ON cotizaciones;
CREATE TRIGGER trg_cotizacion_listo_logistica
    AFTER UPDATE ON cotizaciones
    FOR EACH ROW
    EXECUTE FUNCTION fn_crear_requerimientos_logistica();

-- 5. Row Level Security
ALTER TABLE requerimientos_logistica ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "req_logistica_select" ON requerimientos_logistica;
CREATE POLICY "req_logistica_select" ON requerimientos_logistica
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "req_logistica_update" ON requerimientos_logistica;
CREATE POLICY "req_logistica_update" ON requerimientos_logistica
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 6. Habilitar Supabase Realtime
--    Si la publicación ya incluye esta tabla, este comando lanza un error ignorable.
ALTER PUBLICATION supabase_realtime ADD TABLE requerimientos_logistica;
