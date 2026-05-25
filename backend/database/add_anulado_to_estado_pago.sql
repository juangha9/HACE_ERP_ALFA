-- Migration: Add 'ANULADO' to the CHECK constraint of estado_pago in ventas_cabecera table

-- 1. Drop existing check constraint if it exists (standard Postgres name format or drop by identifying it)
-- Note: Supabase/PostgreSQL check constraints can be dropped by name.
-- We can drop and recreate the constraint to allow 'ANULADO'.

DO $$
BEGIN
    -- Drop the check constraint if it exists
    ALTER TABLE ventas_cabecera DROP CONSTRAINT IF EXISTS ventas_cabecera_estado_pago_check;
    
    -- Add the new check constraint containing 'ANULADO'
    ALTER TABLE ventas_cabecera ADD CONSTRAINT ventas_cabecera_estado_pago_check CHECK (estado_pago IN ('PENDIENTE', 'PARCIAL', 'CANCELADO', 'ANULADO'));
END $$;
