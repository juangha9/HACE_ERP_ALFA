-- ==========================================================
-- MIGRACIÓN: Tipo de Comprobante / Documento en Tesorería
-- ==========================================================
-- Esta columna permite almacenar de forma exclusiva e histórica
-- el tipo de comprobante emitido/asociado al movimiento de caja
-- al momento de su registro real, previniendo alteraciones si la
-- cotización origen es modificada retroactivamente.

ALTER TABLE nodriza_tesoreria 
ADD COLUMN IF NOT EXISTS tipo_documento TEXT 
CHECK (tipo_documento IN ('FACTURA', 'BOLETA', 'TICKET', 'COTIZACION'));
