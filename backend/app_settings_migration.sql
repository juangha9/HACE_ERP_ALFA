-- =====================================================
-- MIGRACIÓN: Tabla de configuración global del sistema
-- =====================================================
-- Almacena ajustes a nivel de empresa (política compartida entre usuarios)
-- Diseñada como key-value (JSONB) para evolucionar sin nuevas migraciones.

CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_app_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_settings_timestamp ON app_settings;
CREATE TRIGGER trg_app_settings_timestamp
    BEFORE UPDATE ON app_settings
    FOR EACH ROW EXECUTE FUNCTION update_app_settings_timestamp();

-- Valor por defecto: umbral de similitud para materiales controlados (TABLEROS)
-- 0.75 = 75% (Dice coefficient sobre bigramas normalizados)
INSERT INTO app_settings (key, value, description)
VALUES (
    'controlled_materials_similarity_threshold',
    '0.75'::jsonb,
    'Umbral de similitud (0.0–1.0) para detectar coincidencias de materiales controlados (categoría TABLEROS) en cotizaciones. Valores más altos = coincidencias más estrictas.'
)
ON CONFLICT (key) DO NOTHING;

-- RLS: tabla de configuración global — accesible por todos los usuarios autenticados
-- (no contiene datos sensibles por usuario, es política de la empresa)
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
