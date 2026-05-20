-- Add sustento_comprobante_url column to store evidence image for verified vouchers
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS sustento_comprobante_url TEXT;
