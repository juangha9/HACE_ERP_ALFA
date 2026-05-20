-- SQL Migration: Add user_id and usuario_nombre columns to nodriza_tesoreria for audit trailing
ALTER TABLE nodriza_tesoreria ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE nodriza_tesoreria ADD COLUMN IF NOT EXISTS usuario_nombre VARCHAR(255);
