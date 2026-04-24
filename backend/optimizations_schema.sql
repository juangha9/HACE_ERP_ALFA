-- ==========================================
-- SCRIPT PARA MÓDULO DE OPTIMIZACIÓN Y ALMACÉN
-- ==========================================

-- 1. Tabla de Registro de Optimizaciones
CREATE TABLE IF NOT EXISTS optimizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE, -- Ej. VNT-000001
  origin_type TEXT CHECK (origin_type IN ('VENTA_DIRECTA', 'PROYECTO')) DEFAULT 'VENTA_DIRECTA',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL, -- Si pertenece a un proyecto
  status TEXT CHECK (status IN ('BORRADOR', 'PENDIENTE_PAGO', 'LISTO_CORTE')) DEFAULT 'BORRADOR',
  data JSONB NOT NULL, -- Toda la info del mapa de corte y piezas
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Trigger para actualizar el updated_at de optimizations
CREATE OR REPLACE FUNCTION update_optimizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_update_optimizations_updated_at ON optimizations;
CREATE TRIGGER trg_update_optimizations_updated_at
BEFORE UPDATE ON optimizations
FOR EACH ROW
EXECUTE FUNCTION update_optimizations_updated_at();

-- 3. Tabla de Solicitudes de Material al Almacén
CREATE TABLE IF NOT EXISTS material_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  optimization_id UUID REFERENCES optimizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  product_id UUID REFERENCES catalog_products(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  status TEXT CHECK (status IN ('PENDIENTE', 'APROBADO', 'SOLICITAR_COMPRA')) DEFAULT 'PENDIENTE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Trigger para actualizar el updated_at de material_requests
CREATE OR REPLACE FUNCTION update_material_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_update_material_requests_updated_at ON material_requests;
CREATE TRIGGER trg_update_material_requests_updated_at
BEFORE UPDATE ON material_requests
FOR EACH ROW
EXECUTE FUNCTION update_material_requests_updated_at();

-- Habilitar RLS
ALTER TABLE optimizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requests ENABLE ROW LEVEL SECURITY;

-- Crear políticas de acceso generales para desarrollo
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for optimizations') THEN
        CREATE POLICY "Enable all for optimizations" ON optimizations FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for material_requests') THEN
        CREATE POLICY "Enable all for material_requests" ON material_requests FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
