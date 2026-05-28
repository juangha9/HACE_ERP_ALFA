-- =========================================================================
-- MIGRACIÓN: AGREGAR COLUMNA DE DATOS DE FACTURACIÓN A LA TABLA CONTACTS
-- Ejecutar en el SQL Editor de Supabase
-- =========================================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS billing_data TEXT;
