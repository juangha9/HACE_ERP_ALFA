-- =========================================================================
-- MIGRACIÓN: Columna MARGEN (%) en catalog_products + cálculo automático
-- Relación: min_price = reference_cost * (1 + margen/100)
--           margen    = (min_price / reference_cost - 1) * 100
-- Ejecutar en el SQL Editor de Supabase.
-- =========================================================================

-- Margen porcentual de venta sobre el costo de referencia.
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS margen NUMERIC(7, 2);

COMMENT ON COLUMN catalog_products.margen IS 'Margen % sobre reference_cost. Se autocalcula si falta (heurística: 0 = no provisto).';

-- =========================================================================
-- Trigger BEFORE INSERT/UPDATE: completa el valor faltante.
-- Como min_price y reference_cost son NOT NULL DEFAULT 0, se usa "0 = no
-- provisto" para decidir qué calcular:
--   * Si llega costo y precio (margen 0/NULL)  -> se calcula el margen.
--   * Si llega costo y margen (precio 0)        -> se calcula el min_price.
--   * Si llegan los tres, se respetan tal cual.
-- =========================================================================
CREATE OR REPLACE FUNCTION compute_catalog_margin()
RETURNS TRIGGER AS $$
BEGIN
    IF COALESCE(NEW.margen, 0) = 0 AND NEW.min_price > 0 AND NEW.reference_cost > 0 THEN
        -- Caso 1: hay costo y precio -> derivar margen
        NEW.margen := ROUND(((NEW.min_price / NEW.reference_cost) - 1) * 100, 2);
    ELSIF NEW.min_price = 0 AND COALESCE(NEW.margen, 0) > 0 AND NEW.reference_cost > 0 THEN
        -- Caso 2: hay costo y margen -> derivar precio mínimo
        NEW.min_price := ROUND(NEW.reference_cost * (1 + NEW.margen / 100), 2);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_catalog_margin ON catalog_products;
CREATE TRIGGER trg_compute_catalog_margin
    BEFORE INSERT OR UPDATE ON catalog_products
    FOR EACH ROW EXECUTE FUNCTION compute_catalog_margin();
