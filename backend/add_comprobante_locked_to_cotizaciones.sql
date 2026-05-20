-- ==========================================
-- MIGRACIÓN: Bloqueo de Comprobante en Cotizaciones
-- ==========================================

-- 1. Agregar columna comprobante_locked a cotizaciones
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS comprobante_locked BOOLEAN DEFAULT FALSE;

-- Crear índice para búsqueda rápida si es necesario
CREATE INDEX IF NOT EXISTS idx_cotizaciones_comprobante_locked
    ON cotizaciones(comprobante_locked)
    WHERE comprobante_locked = TRUE;
