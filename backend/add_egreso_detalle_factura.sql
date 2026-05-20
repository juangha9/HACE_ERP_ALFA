-- ============================================================
-- Tabla independiente para el desglose de facturas de egreso.
-- Separa la información del adelanto (nodriza_tesoreria)
-- del detalle contable real de la factura.
-- ============================================================

CREATE TABLE IF NOT EXISTS egreso_detalle_factura (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    egreso_id    UUID         NOT NULL REFERENCES nodriza_tesoreria(id) ON DELETE CASCADE,
    sort_order   INT          NOT NULL DEFAULT 0,
    qty          NUMERIC(10, 3) NOT NULL,
    unit         TEXT         NOT NULL DEFAULT 'NIU',
    description  TEXT         NOT NULL DEFAULT '',
    v_unitario   NUMERIC(14, 6) NOT NULL DEFAULT 0,   -- precio unitario SIN IGV
    base_amount  NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- subtotal línea SIN IGV
    igv_amount   NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- IGV de la línea
    amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- total línea CON IGV
    inc_igv      BOOLEAN      NOT NULL DEFAULT true,  -- el precio se ingresó con IGV incluido
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS egreso_detalle_factura_egreso_id_idx
    ON egreso_detalle_factura (egreso_id);

-- RLS
ALTER TABLE egreso_detalle_factura ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'egreso_detalle_factura'
        AND policyname = 'egreso_detalle_authenticated_all'
    ) THEN
        CREATE POLICY "egreso_detalle_authenticated_all"
            ON egreso_detalle_factura FOR ALL TO authenticated
            USING (true) WITH CHECK (true);
    END IF;
END $$;
