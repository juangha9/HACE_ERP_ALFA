-- Migración para vincular movimientos de tesorería con cobros específicos
ALTER TABLE nodriza_tesoreria 
ADD COLUMN IF NOT EXISTS cobro_id UUID;

-- Agregar clave foránea si la tabla existe
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'ventas_cobros') THEN
        ALTER TABLE nodriza_tesoreria 
        ADD CONSTRAINT fk_cobro_id FOREIGN KEY (cobro_id) REFERENCES ventas_cobros(id);
    END IF;
END $$;
