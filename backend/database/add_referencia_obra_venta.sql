-- Migration: Add referencia_obra_venta to nodriza_tesoreria table for expense tracking
-- Formato: Texto libre
--

ALTER TABLE public.nodriza_tesoreria 
  ADD COLUMN IF NOT EXISTS referencia_obra_venta TEXT;

-- Index for searching and filtering by project/sale reference
CREATE INDEX IF NOT EXISTS idx_tesoreria_ref_obra_venta 
  ON public.nodriza_tesoreria (referencia_obra_venta);
