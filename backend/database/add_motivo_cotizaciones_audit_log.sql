-- =========================================================================
-- MIGRACIÓN: REGISTRAR EL MOTIVO AL EDITAR EL NOMBRE DE UNA VENTA (LISTO)
-- Ejecutar en el SQL Editor de Supabase
-- =========================================================================
-- Desde el modal "Historial de Servicios" un administrador puede editar el
-- nombre (cliente_nombre) de una cotización/venta cuyo estado sea LISTO. Para
-- mantener la trazabilidad, cada edición exige un motivo y queda registrada en
-- cotizaciones_audit_log con campo = 'cliente_nombre' (valor_anterior /
-- valor_nuevo). Esta columna almacena la justificación del cambio.
-- =========================================================================

ALTER TABLE cotizaciones_audit_log
    ADD COLUMN IF NOT EXISTS motivo TEXT;
