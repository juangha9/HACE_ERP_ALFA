-- =========================================================================
-- MIGRACIÓN: Columnas TEXTURA_ACABADO, ESPESOR y MEDIDAS_FORMATO en catalog_products
-- Soporta el nuevo encabezado de Carga Masiva del Catálogo de Inventario:
--   subfamily_name, base_name, textura_acabado, espesor, presentation,
--   medidas_formato, brand, unit, features, min_stock, sku_corto
-- Ejecutar en el SQL Editor de Supabase.
-- =========================================================================

-- Textura / acabado del material (ej. "High Gloss", "Mate", "Texturado").
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS textura_acabado TEXT;

-- Espesor del material (ej. "18mm", "0.45mm", "3/4"). Se guarda como texto
-- para admitir valores con unidad o fracciones provenientes del Excel/CSV.
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS espesor TEXT;

-- Medidas / formato de la presentación (ej. "1.22 x 2.44 m", "60x60 cm").
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS medidas_formato TEXT;

COMMENT ON COLUMN catalog_products.textura_acabado IS 'Textura/acabado del material (ej. "High Gloss")';
COMMENT ON COLUMN catalog_products.espesor IS 'Espesor del material (texto: admite unidad o fracción, ej. "18mm")';
COMMENT ON COLUMN catalog_products.medidas_formato IS 'Medidas/formato de la presentación (ej. "1.22 x 2.44 m")';
