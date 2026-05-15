-- Migración: snapshot de usuario_nombre para auditoría
-- Objetivo: guardar el nombre del usuario al momento exacto de la transacción,
-- de forma que cambios futuros en profiles.display_name NO afecten registros históricos.

-- 1. Agregar columna a ventas_cabecera
ALTER TABLE ventas_cabecera
  ADD COLUMN IF NOT EXISTS usuario_nombre TEXT;

-- 2. Backfill de registros existentes (única vez, no afecta futuros)
UPDATE ventas_cabecera vc
SET usuario_nombre = p.display_name
FROM profiles p
WHERE p.id = vc.user_id
  AND vc.usuario_nombre IS NULL;

-- 3. Actualizar la función RPC para que capture el nombre en el momento de la transacción
CREATE OR REPLACE FUNCTION cotizacion_to_venta(p_cotizacion_id UUID)
RETURNS UUID AS $$
DECLARE
    v_cot            cotizaciones%ROWTYPE;
    v_venta_id       UUID;
    v_item           JSONB;
    v_user_id        UUID;
    v_usuario_nombre TEXT;
BEGIN
    v_user_id := auth.uid();

    -- Snapshot del nombre en este momento exacto (inmutable para auditoría)
    SELECT display_name INTO v_usuario_nombre
    FROM profiles
    WHERE id = v_user_id;

    SELECT * INTO v_cot FROM cotizaciones WHERE id = p_cotizacion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cotización no encontrada: %', p_cotizacion_id;
    END IF;

    -- Crear cabecera si aún no existe
    IF v_cot.venta_id IS NULL THEN
        INSERT INTO ventas_cabecera (
            codigo_cotizacion,
            cliente_nombre,
            monto_total,
            saldo_pendiente,
            estado_pago,
            descripcion_resumen,
            user_id,
            usuario_nombre
        ) VALUES (
            v_cot.codigo,
            v_cot.cliente_nombre,
            v_cot.total,
            v_cot.total,
            'PENDIENTE',
            'Cotización ' || v_cot.codigo,
            v_user_id,
            v_usuario_nombre
        )
        RETURNING id INTO v_venta_id;

        UPDATE cotizaciones SET venta_id = v_venta_id WHERE id = p_cotizacion_id;
    ELSE
        v_venta_id := v_cot.venta_id;

        -- Actualizar montos si la cotización fue editada.
        -- usuario_nombre usa COALESCE para no sobreescribir el snapshot original.
        UPDATE ventas_cabecera
        SET cliente_nombre    = v_cot.cliente_nombre,
            monto_total       = v_cot.total,
            saldo_pendiente   = v_cot.total,
            descripcion_resumen = 'Cotización ' || v_cot.codigo,
            user_id           = COALESCE(user_id, v_user_id),
            usuario_nombre    = COALESCE(usuario_nombre, v_usuario_nombre)
        WHERE id = v_venta_id;
    END IF;

    -- Re-sincronizar detalle: borrar filas anteriores e insertar las actuales
    DELETE FROM ventas_detalle WHERE venta_id = v_venta_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_cot.items)
    LOOP
        INSERT INTO ventas_detalle (venta_id, material_insumo, cantidad, precio_unitario, total)
        VALUES (
            v_venta_id,
            COALESCE(v_item->>'descripcion', 'Sin descripción'),
            COALESCE((v_item->>'cantidad')::NUMERIC,        0),
            COALESCE((v_item->>'precio_unitario')::NUMERIC, 0),
            COALESCE((v_item->>'total')::NUMERIC,           0)
        );
    END LOOP;

    RETURN v_venta_id;
END;
$$ LANGUAGE plpgsql;
