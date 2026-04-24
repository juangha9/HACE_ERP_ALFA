
-- Añadir campos de auditoría a la tabla nodriza de tesorería para transferencias y otros movimientos
ALTER TABLE nodriza_tesoreria 
ADD COLUMN IF NOT EXISTS numero_operacion TEXT,
ADD COLUMN IF NOT EXISTS voucher_url TEXT;

-- Crear un índice para búsquedas por número de operación
CREATE INDEX IF NOT EXISTS idx_tesoreria_num_op ON nodriza_tesoreria(numero_operacion);
