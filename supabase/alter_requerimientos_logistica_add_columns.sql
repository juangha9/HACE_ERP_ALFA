-- =========================================================================
-- MIGRACIÓN: Agregar cotizacion_descripcion y prioridad a requerimientos_logistica
-- =========================================================================

-- 1. Nuevas columnas
ALTER TABLE requerimientos_logistica
    ADD COLUMN IF NOT EXISTS cotizacion_descripcion TEXT,
    ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'NORMAL'
        CHECK (prioridad IN ('NORMAL', 'ALTO', 'MUY ALTO'));

-- 2. Actualizar la función trigger para que capture las nuevas columnas
CREATE OR REPLACE FUNCTION fn_crear_requerimientos_logistica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.estado = 'LISTO' AND (OLD.estado IS DISTINCT FROM 'LISTO') THEN
        DELETE FROM requerimientos_logistica WHERE cotizacion_id = NEW.id;

        INSERT INTO requerimientos_logistica
            (cotizacion_id, codigo_cotizacion, cliente_nombre,
             descripcion, cantidad, unidad,
             cotizacion_descripcion, prioridad)
        SELECT
            NEW.id,
            NEW.codigo,
            NEW.cliente_nombre,
            ci.descripcion,
            ci.cantidad,
            ci.unidad,
            NEW.descripcion,
            COALESCE(NEW.prioridad, 'NORMAL')
        FROM cotizaciones_items ci
        WHERE ci.cotizacion_id = NEW.id
          AND ci.descripcion IS NOT NULL
          AND TRIM(ci.descripcion) != '';
    END IF;
    RETURN NEW;
END;
$$;
