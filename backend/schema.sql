-- Cost Configuration Schema (Existing)

-- 1. Cost Zones (e.g., Lima Metropolitana - Zona A)
CREATE TABLE IF NOT EXISTS cost_zones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  latitude NUMERIC, -- Latitud de la planta
  longitude NUMERIC, -- Longitud de la planta
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Transport Rates (Linked to Zones)
CREATE TABLE IF NOT EXISTS transport_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_id UUID REFERENCES cost_zones(id) ON DELETE CASCADE,
  vehicle_freight_rate NUMERIC NOT NULL DEFAULT 0, -- Tarifa Flete Vehículo
  
  -- Personal Transport Rates by Distance Bands
  personal_transport_band1 NUMERIC NOT NULL DEFAULT 0, -- 0-5 km
  personal_transport_band2 NUMERIC NOT NULL DEFAULT 0, -- 5-15 km
  personal_transport_band3 NUMERIC NOT NULL DEFAULT 0, -- 15-30 km
  personal_transport_band4 NUMERIC NOT NULL DEFAULT 0, -- +30 km
  
  bands_config JSONB, -- Array of objects: [{ range: '0-5', price: 25 }, ...]

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Automatic Supply Kits
CREATE TABLE IF NOT EXISTS supply_kits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, -- e.g., Kit de Melamina
  description TEXT,
  total_base_cost NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  items JSONB, -- Array of supply items
  icon TEXT, -- Material Icon name
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Machinery Wear & Consumables
CREATE TABLE IF NOT EXISTS machinery_wear (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, -- e.g., Sierra Escuadradora, Cuchilla Diamantada
  type TEXT CHECK (type IN ('MACHINERY', 'CONSUMABLE')),
  cost_per_unit NUMERIC NOT NULL DEFAULT 0, -- Cost/Hour for machinery, Cost/Unit for consumable
  lifespan_hours NUMERIC, -- Vida útil en horas (for consumables)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Management Parameters
CREATE TABLE IF NOT EXISTS management_parameters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_expenses_percentage NUMERIC NOT NULL DEFAULT 0, -- Gastos Administrativos %
  desired_utility_percentage NUMERIC NOT NULL DEFAULT 0, -- Utilidad Deseada %
  contingency_percentage NUMERIC NOT NULL DEFAULT 0, -- Contingencia %
  igv_percentage NUMERIC NOT NULL DEFAULT 18, -- IGV %
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Core ERP Schema (Projects & Operations)
-- Re-added to ensure completeness and fix potential missing table issues

-- 6. Projects (Órdenes de Producción)
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_number TEXT NOT NULL, -- e.g., "001-2024"
  name TEXT,
  client_name TEXT NOT NULL,
  start_date_planned DATE,
  end_date_planned DATE,
  budget_total NUMERIC DEFAULT 0,
  amount_collected NUMERIC DEFAULT 0,
  amount_pending NUMERIC DEFAULT 0,
  start_date_real DATE,
  end_date_real DATE,
  observations TEXT,
  status TEXT CHECK (status IN ('BORRADOR', 'ENVIADO', 'INICIO', 'EN_EJECUCION', 'FINALIZADO', 'CERRADO', 'PENDIENTE_COBRO')) DEFAULT 'BORRADOR',
  retail_board JSONB, -- For retail board optimization metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Project Items (Detalle de Costos)
CREATE TABLE IF NOT EXISTS project_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT CHECK (category IN ('MATERIAL', 'MANO_OBRA', 'MOVILIDAD', 'ADICIONAL_MATERIAL', 'ADICIONAL_MANO_OBRA', 'ADICIONAL_MOVILIDAD')),
  description TEXT,
  unit TEXT,
  planned_qty NUMERIC DEFAULT 0,
  planned_unit_price NUMERIC DEFAULT 0,
  real_qty NUMERIC DEFAULT 0,
  real_unit_price NUMERIC DEFAULT 0,
  origin TEXT,
  transaction_date DATE DEFAULT CURRENT_DATE,
  supplier TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Project Collections (Cobranzas)
CREATE TABLE IF NOT EXISTS project_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  description TEXT,
  account TEXT CHECK (account IN ('2049', '8059', '9001', '4071', 'EFECTIVO', 'YAPE')),
  amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Usable Offcuts (Retazos sobrantes de optimización)
CREATE TABLE IF NOT EXISTS usable_offcuts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  material TEXT NOT NULL,
  width NUMERIC NOT NULL,
  height NUMERIC NOT NULL,
  status TEXT CHECK (status IN ('DISPONIBLE', 'USADO', 'DESCARTADO')) DEFAULT 'DISPONIBLE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for all tables to ensure policies work
ALTER TABLE cost_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE machinery_wear ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE usable_offcuts ENABLE ROW LEVEL SECURITY;

-- Create Permissive Policies (Since this is an internal tool with no auth yet)
-- Note: 'ON CONFLICT DO NOTHING' prevents errors if policy already exists

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for cost_zones') THEN
        CREATE POLICY "Enable all for cost_zones" ON cost_zones FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for transport_rates') THEN
        CREATE POLICY "Enable all for transport_rates" ON transport_rates FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for supply_kits') THEN
        CREATE POLICY "Enable all for supply_kits" ON supply_kits FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for machinery_wear') THEN
        CREATE POLICY "Enable all for machinery_wear" ON machinery_wear FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for management_parameters') THEN
        CREATE POLICY "Enable all for management_parameters" ON management_parameters FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for projects') THEN
        CREATE POLICY "Enable all for projects" ON projects FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for project_items') THEN
        CREATE POLICY "Enable all for project_items" ON project_items FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for project_collections') THEN
        CREATE POLICY "Enable all for project_collections" ON project_collections FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for usable_offcuts') THEN
        CREATE POLICY "Enable all for usable_offcuts" ON usable_offcuts FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;


-- Initial Seed Data (Optional, ensuring at least one zone and params exist)
INSERT INTO management_parameters (admin_expenses_percentage, desired_utility_percentage, contingency_percentage, igv_percentage)
SELECT 15, 25, 5, 18
WHERE NOT EXISTS (SELECT 1 FROM management_parameters);

INSERT INTO cost_zones (name, description)
SELECT 'Lima Metropolitana - Zona A', 'Zona Centro y Norte'
WHERE NOT EXISTS (SELECT 1 FROM cost_zones);

INSERT INTO transport_rates (zone_id, vehicle_freight_rate, bands_config)
SELECT id, 150, '[
    {"id": 1, "range": "0-5", "price": 25.00, "color": "bg-indigo-50 text-indigo-700", "ringColor": "#818cf8", "radius": 5000},
    {"id": 2, "range": "5-15", "price": 45.00, "color": "bg-indigo-50 text-indigo-700", "ringColor": "#6366f1", "radius": 15000},
    {"id": 3, "range": "15-30", "price": 70.00, "color": "bg-indigo-50 text-indigo-700", "ringColor": "#4f46e5", "radius": 30000},
    {"id": 4, "range": "+30", "price": 110.00, "color": "bg-indigo-50 text-indigo-700", "ringColor": "#4338ca", "radius": 45000}
]'::jsonb
FROM cost_zones
WHERE NOT EXISTS (SELECT 1 FROM transport_rates);


-- ==========================================
-- SCRIPT DE MÓDULO CATÁLOGO PARA SUPABASE
-- Puedes copiar y pegar todo este script en el
-- SQL Editor de tu proyecto en Supabase.
-- ==========================================

-- 1. Categorías de Producto
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL CHECK (char_length(code) = 2), -- Código de 2 letras
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Familias de Producto
CREATE TABLE IF NOT EXISTS product_families (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL CHECK (char_length(code) = 2), -- Código de 2 letras
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Subfamilias de Producto
CREATE TABLE IF NOT EXISTS product_subfamilies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID REFERENCES product_families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL CHECK (char_length(code) = 2), -- Código de 2 letras
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Productos del Catálogo
CREATE TABLE IF NOT EXISTS catalog_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subfamily_id UUID REFERENCES product_subfamilies(id) ON DELETE RESTRICT,
  sku TEXT UNIQUE, -- El SKU será generado por un Trigger
  base_name TEXT NOT NULL,
  presentation TEXT NOT NULL,
  brand TEXT,
  features TEXT, -- Color / Textura / Acabado
  min_stock NUMERIC DEFAULT 0,
  stock_alerts BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- FUNCIONALIDAD PARA GENERAR SKU AUTOMÁTICO
-- ==========================================

-- Función que genera el SKU antes de insertar un producto
CREATE OR REPLACE FUNCTION generate_product_sku()
RETURNS TRIGGER AS $$
DECLARE
    v_category_code TEXT;
    v_family_code TEXT;
    v_subfamily_code TEXT;
    v_correlative INTEGER;
    v_sku TEXT;
BEGIN
    -- 1. Obtener los códigos de subfamilia, familia y categoría
    SELECT 
        UPPER(c.code), UPPER(f.code), UPPER(s.code)
    INTO 
        v_category_code, v_family_code, v_subfamily_code
    FROM product_subfamilies s
    JOIN product_families f ON s.family_id = f.id
    JOIN product_categories c ON f.category_id = c.id
    WHERE s.id = NEW.subfamily_id;

    IF v_category_code IS NULL OR v_family_code IS NULL OR v_subfamily_code IS NULL THEN
        RAISE EXCEPTION 'No se pudieron encontrar los códigos de Categoría, Familia o Subfamilia para generar el SKU.';
    END IF;

    -- 2. Calcular el número correlativo para esta subfamilia
    SELECT COUNT(*) INTO v_correlative
    FROM catalog_products
    WHERE subfamily_id = NEW.subfamily_id;

    -- Sumar 1 al contador
    v_correlative := v_correlative + 1;

    -- 3. Construir el SKU (ej. ABXYCD-000001)
    v_sku := v_category_code || v_family_code || v_subfamily_code || '-' || LPAD(v_correlative::TEXT, 6, '0');

    -- 4. Asignar el SKU al nuevo registro
    NEW.sku := v_sku;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger que ejecuta la función antes de la inserción
DROP TRIGGER IF EXISTS trg_generate_product_sku ON catalog_products;
CREATE TRIGGER trg_generate_product_sku
BEFORE INSERT ON catalog_products
FOR EACH ROW
EXECUTE FUNCTION generate_product_sku();


-- ==========================================
-- POLÍTICAS DE SEGURIDAD (Row Level Security)
-- ==========================================

-- Habilitar RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_subfamilies ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_products ENABLE ROW LEVEL SECURITY;

-- Crear políticas permisivas para desarrollo interno
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for product_categories') THEN
        CREATE POLICY "Enable all for product_categories" ON product_categories FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for product_families') THEN
        CREATE POLICY "Enable all for product_families" ON product_families FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for product_subfamilies') THEN
        CREATE POLICY "Enable all for product_subfamilies" ON product_subfamilies FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for catalog_products') THEN
        CREATE POLICY "Enable all for catalog_products" ON catalog_products FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Constraints para evitar colisiones en los prefijos SKU (Códigos únicos de 2 letras validado a nivel DB combinando jerarquía)
DO $$
BEGIN
    -- UNIQUE general para Categorías
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_category_code') THEN
        ALTER TABLE product_categories ADD CONSTRAINT unique_category_code UNIQUE (code);
    END IF;
    
    -- UNIQUE para Familias dentro de una misma Categoría
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_family_code') THEN
        ALTER TABLE product_families ADD CONSTRAINT unique_family_code UNIQUE (category_id, code);
    END IF;

    -- UNIQUE para Subfamilias dentro de una misma Familia
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_subfamily_code') THEN
        ALTER TABLE product_subfamilies ADD CONSTRAINT unique_subfamily_code UNIQUE (family_id, code);
    END IF;
END $$;

-- ==========================================
-- DATOS DE PRUEBA INICIALES (Semillas)
-- ==========================================
-- Puedes omitir esto si deseas ingresarlos manualmente luego.

INSERT INTO product_categories (name, code)
SELECT 'Herrajes', 'HE'
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE name = 'Herrajes');

INSERT INTO product_categories (name, code)
SELECT 'Tableros', 'TB'
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE name = 'Tableros');

-- ID de la categoría "Herrajes"
DO $$
DECLARE
    v_cat_he_id UUID;
    v_fam_ca_id UUID;
BEGIN
    SELECT id INTO v_cat_he_id FROM product_categories WHERE name = 'Herrajes' LIMIT 1;
    
    IF v_cat_he_id IS NOT NULL THEN
        -- Insertar Familia "Correderas"
        INSERT INTO product_families (category_id, name, code)
        SELECT v_cat_he_id, 'Correderas', 'CO'
        WHERE NOT EXISTS (SELECT 1 FROM product_families WHERE name = 'Correderas');

        -- Insertar Subfamilia
        SELECT id INTO v_fam_ca_id FROM product_families WHERE name = 'Correderas' LIMIT 1;
        
        IF v_fam_ca_id IS NOT NULL THEN
            INSERT INTO product_subfamilies (family_id, name, code)
            SELECT v_fam_ca_id, 'Telescópicas', 'TE'
            WHERE NOT EXISTS (SELECT 1 FROM product_subfamilies WHERE name = 'Telescópicas');
        END IF;
    END IF;
END $$;
