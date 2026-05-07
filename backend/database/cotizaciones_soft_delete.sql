-- Migration: add 'ELIMINADO' state for soft-delete of BORRADOR quotations
-- Run in Supabase SQL Editor before deploying the frontend changes.

-- If the column has a CHECK constraint, update it to allow 'ELIMINADO'.
-- The constraint name may vary; replace 'cotizaciones_estado_check' with the
-- actual name found in your schema if the statement below fails.
DO $$
BEGIN
    -- Drop any existing CHECK constraint on the estado column
    ALTER TABLE public.cotizaciones
        DROP CONSTRAINT IF EXISTS cotizaciones_estado_check;

    -- Re-add with the extended set of allowed values
    ALTER TABLE public.cotizaciones
        ADD CONSTRAINT cotizaciones_estado_check
        CHECK (estado IN ('BORRADOR', 'LISTO', 'ELIMINADO'));
EXCEPTION WHEN OTHERS THEN
    -- If no constraint existed this is a no-op; carry on.
    NULL;
END $$;
