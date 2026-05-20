-- Agrega columna user_id a cotizaciones para filtrar por vendedor
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_user_id ON cotizaciones(user_id);
