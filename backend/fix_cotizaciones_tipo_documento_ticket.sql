-- Fix: add TICKET as valid value for tipo_documento in cotizaciones
ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_tipo_documento_check;
ALTER TABLE cotizaciones
    ADD CONSTRAINT cotizaciones_tipo_documento_check
    CHECK (tipo_documento IN ('COTIZACION', 'BOLETA', 'FACTURA', 'TICKET'));
