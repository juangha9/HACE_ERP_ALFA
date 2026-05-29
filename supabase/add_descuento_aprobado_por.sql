-- =========================================================================
-- MIGRACIÓN: REGISTRAR QUIÉN AUTORIZÓ EL DESCUENTO DE UNA COTIZACIÓN
-- Ejecutar en el SQL Editor de Supabase
-- =========================================================================
-- Hasta ahora la aprobación/rechazo de un descuento solo guardaba el estado
-- y el comentario del administrador (descuento_comentarios_admin), pero NO
-- quién lo autorizó. Estas columnas permiten mostrar en Gestión de Ventas y
-- Tesorería el display_name del administrador que tomó la decisión, junto con
-- la fecha. Se guarda un snapshot del nombre para que cambios futuros en
-- profiles.display_name no afecten registros históricos (mismo criterio que
-- ventas_cabecera.usuario_nombre).
-- =========================================================================

ALTER TABLE cotizaciones
    ADD COLUMN IF NOT EXISTS descuento_aprobado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE cotizaciones
    ADD COLUMN IF NOT EXISTS descuento_aprobado_nombre TEXT;
ALTER TABLE cotizaciones
    ADD COLUMN IF NOT EXISTS descuento_aprobado_at     TIMESTAMP WITH TIME ZONE;
