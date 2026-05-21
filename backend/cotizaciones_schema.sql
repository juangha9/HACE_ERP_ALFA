-- ==========================================
-- MÓDULO DE COTIZACIONES COMERCIALES
-- ==========================================
-- Módulo independiente de cotización de ventas.
-- Estado BORRADOR → LISTO (listo para optimizar / ya optimizado).
-- Cuando pasa a LISTO, puede conectarse con ventas_cabecera para
-- fluir al módulo de Ventas y Tesorería igual que una venta normal.
-- ==========================================

-- 1. Tabla principal de cotizaciones comerciales
CREATE TABLE IF NOT EXISTS cotizaciones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              TEXT UNIQUE,                        -- COT-000001 (auto-generado)
    estado              TEXT DEFAULT 'BORRADOR'
                            CHECK (estado IN ('BORRADOR', 'LISTO')),
    tipo_documento      TEXT DEFAULT 'COTIZACION'
                            CHECK (tipo_documento IN ('COTIZACION', 'BOLETA', 'FACTURA', 'TICKET')),

    -- Datos del cliente
    cliente_nombre      TEXT,
    cliente_doi         TEXT,                               -- RUC o DNI
    cliente_direccion   TEXT,
    cliente_telefono    TEXT,
    cliente_email       TEXT,

    -- Fechas del documento
    fecha_emision       DATE DEFAULT CURRENT_DATE,
    fecha_entrega       DATE,

    -- Ítems de la cotización (JSON array)
    -- Estructura de cada ítem:
    -- { id, cantidad, unidad, descripcion, precio_unitario, total }
    items               JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Totales calculados
    subtotal            NUMERIC(15, 2) DEFAULT 0,
    descuento           NUMERIC(15, 2) DEFAULT 0,
    igv                 NUMERIC(15, 2) DEFAULT 0,
    total               NUMERIC(15, 2) DEFAULT 0,
    adelanto            NUMERIC(15, 2) DEFAULT 0,
    saldo_pendiente     NUMERIC(15, 2) DEFAULT 0,

    -- Campos opcionales
    notas               TEXT,
    condiciones_pago    TEXT,

    -- Vínculos opcionales
    optimization_id     UUID REFERENCES optimizations(id) ON DELETE SET NULL,
    venta_id            UUID REFERENCES ventas_cabecera(id) ON DELETE SET NULL,

    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices de búsqueda
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado       ON cotizaciones(estado);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente      ON cotizaciones(cliente_nombre);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_created_at   ON cotizaciones(created_at);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_codigo       ON cotizaciones(codigo);

-- 2. Auto-código correlativo (COT-000001)
CREATE OR REPLACE FUNCTION generate_cotizacion_code()
RETURNS TRIGGER AS $$
DECLARE
    v_next INTEGER;
BEGIN
    IF NEW.codigo IS NULL THEN
        SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM 5) AS INTEGER)), 0) + 1
        INTO v_next
        FROM cotizaciones
        WHERE codigo LIKE 'COT-%' AND LENGTH(codigo) = 10;
        NEW.codigo := 'COT-' || LPAD(v_next::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cotizacion_code ON cotizaciones;
CREATE TRIGGER trg_cotizacion_code
BEFORE INSERT ON cotizaciones
FOR EACH ROW EXECUTE FUNCTION generate_cotizacion_code();

-- 3. Auto-updated_at
CREATE OR REPLACE FUNCTION update_cotizaciones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cotizaciones_updated_at ON cotizaciones;
CREATE TRIGGER trg_cotizaciones_updated_at
BEFORE UPDATE ON cotizaciones
FOR EACH ROW EXECUTE FUNCTION update_cotizaciones_updated_at();

-- 4. Función auxiliar: al marcar una cotización como LISTO,
--    se puede llamar esta función desde el frontend o un trigger
--    para crear automáticamente la entrada en ventas_cabecera.
CREATE OR REPLACE FUNCTION cotizacion_to_venta(p_cotizacion_id UUID)
RETURNS UUID AS $$
DECLARE
    v_cot    cotizaciones%ROWTYPE;
    v_venta_id UUID;
    v_item   JSONB;
    v_user_id UUID;
    v_new_saldo NUMERIC(15, 2);
    v_new_estado TEXT;
BEGIN
    v_user_id := auth.uid();

    SELECT * INTO v_cot FROM cotizaciones WHERE id = p_cotizacion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cotización no encontrada: %', p_cotizacion_id;
    END IF;

    -- Crear cabecera si aún no existe
    IF v_cot.venta_id IS NULL THEN
        -- El adelanto de la cotización es puramente informativo para el vendedor.
        -- En Ventas y Tesorería la venta nace con el saldo pendiente completo igual al total,
        -- y el asistente administrativo registra manualmente el cobro tras conciliar.
        v_new_saldo := v_cot.total;
        v_new_estado := 'PENDIENTE';

        INSERT INTO ventas_cabecera (
            codigo_cotizacion,
            cliente_nombre,
            monto_total,
            saldo_pendiente,
            estado_pago,
            descripcion_resumen,
            user_id
        ) VALUES (
            v_cot.codigo,
            v_cot.cliente_nombre,
            v_cot.total,
            v_new_saldo,
            v_new_estado,
            'Cotización ' || v_cot.codigo,
            v_user_id
        )
        RETURNING id INTO v_venta_id;

        UPDATE cotizaciones SET venta_id = v_venta_id WHERE id = p_cotizacion_id;
    ELSE
        v_venta_id := v_cot.venta_id;

        -- Actualizar montos en cabecera si la cotización fue editada.
        -- IMPORTANTE: preservar los pagos ya cobrados. El monto cobrado es
        -- (monto_total - saldo_pendiente) ANTES del update. El nuevo saldo es
        -- el nuevo total menos lo ya cobrado, nunca negativo.
        -- También se actualiza el estado_pago de acuerdo con el nuevo saldo calculado.
        SELECT GREATEST(v_cot.total - (monto_total - saldo_pendiente), 0) INTO v_new_saldo
        FROM ventas_cabecera
        WHERE id = v_venta_id;

        IF v_new_saldo = 0 THEN
            v_new_estado := 'CANCELADO';
        ELSIF v_new_saldo < v_cot.total THEN
            v_new_estado := 'PARCIAL';
        ELSE
            v_new_estado := 'PENDIENTE';
        END IF;

        UPDATE ventas_cabecera
        SET cliente_nombre       = v_cot.cliente_nombre,
            saldo_pendiente      = v_new_saldo,
            estado_pago          = v_new_estado,
            monto_total          = v_cot.total,
            descripcion_resumen  = 'Cotización ' || v_cot.codigo,
            user_id              = COALESCE(user_id, v_user_id)
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
            COALESCE((v_item->>'cantidad')::NUMERIC,       0),
            COALESCE((v_item->>'precio_unitario')::NUMERIC, 0),
            COALESCE((v_item->>'total')::NUMERIC,          0)
        );
    END LOOP;

    RETURN v_venta_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Migración: agregar columnas si la tabla ya existe sin ellas
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS adelanto         NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS saldo_pendiente  NUMERIC(15, 2) DEFAULT 0;

-- 6. RLS
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for cotizaciones') THEN
        CREATE POLICY "Enable all for cotizaciones"
        ON cotizaciones FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
