
-- Añadir campos para gestión de facturas en tesorería
ALTER TABLE nodriza_tesoreria 
ADD COLUMN IF NOT EXISTS has_invoice BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS invoice_url TEXT,
ADD COLUMN IF NOT EXISTS invoice_details JSONB; -- Para el desglose de gastos ([{proyecto_id, item_id, monto, descripcion}, ...])

-- Índice para búsquedas rápidas si es necesario
CREATE INDEX IF NOT EXISTS idx_tesoreria_has_invoice ON nodriza_tesoreria(has_invoice);
