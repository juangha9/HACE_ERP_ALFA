-- =====================================================
-- MIGRACIÓN: Precio Mínimo y Costo de Referencia en catalog_products
-- =====================================================

-- Precio mínimo de venta para este producto
ALTER TABLE catalog_products
    ADD COLUMN IF NOT EXISTS min_price DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Costo de referencia (costo unitario de adquisición referencial)
ALTER TABLE catalog_products
    ADD COLUMN IF NOT EXISTS reference_cost DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Índices útiles para reportes de márgenes
CREATE INDEX IF NOT EXISTS idx_catalog_products_min_price
    ON catalog_products(min_price)
    WHERE min_price > 0;

CREATE INDEX IF NOT EXISTS idx_catalog_products_reference_cost
    ON catalog_products(reference_cost)
    WHERE reference_cost > 0;
