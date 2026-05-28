-- Agregar columna prioridad a la tabla cotizaciones con check constraint
ALTER TABLE cotizaciones 
ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'NORMAL' 
CHECK (prioridad IN ('NORMAL', 'ALTO', 'MUY ALTO'));
