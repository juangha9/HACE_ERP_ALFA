-- ==========================================
-- SCRIPT PARA MÓDULO DE COTIZACIONES (PRESUPUESTADOR)
-- ==========================================

-- 1. Información de la Empresa (Ajustes)
CREATE TABLE IF NOT EXISTS business_info (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name TEXT NOT NULL,
    ruc TEXT,
    address TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial empty record if none exists
INSERT INTO business_info (company_name, ruc, address)
SELECT 'MI EMPRESA S.A.C.', '20000000000', 'Dirección de la Empresa'
WHERE NOT EXISTS (SELECT 1 FROM business_info);

-- 2. Registro de Cotizaciones
CREATE TABLE IF NOT EXISTS quotations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE, -- Ej. COT-000001
    optimization_id UUID REFERENCES optimizations(id) ON DELETE SET NULL,
    client_name TEXT,
    client_doi TEXT,
    client_address TEXT,
    document_type TEXT CHECK (document_type IN ('BOLETA', 'FACTURA')) DEFAULT 'BOLETA',
    issue_date DATE DEFAULT CURRENT_DATE,
    delivery_date DATE,
    items JSONB NOT NULL, -- [{qty, unit, description, unit_price, total}]
    subtotal NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    igv NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    advance NUMERIC DEFAULT 0,
    balance NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Trigger para actualizar el updated_at de business_info
CREATE OR REPLACE FUNCTION update_business_info_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_update_business_info_updated_at
BEFORE UPDATE ON business_info
FOR EACH ROW
EXECUTE FUNCTION update_business_info_updated_at();

-- 4. Trigger para actualizar el updated_at de quotations
CREATE OR REPLACE FUNCTION update_quotations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_update_quotations_updated_at
BEFORE UPDATE ON quotations
FOR EACH ROW
EXECUTE FUNCTION update_quotations_updated_at();

-- 5. Función para generar código correlativo de cotización (COT-XXXXXX)
CREATE OR REPLACE FUNCTION generate_quotation_code()
RETURNS TRIGGER AS $$
DECLARE
    v_next_val INTEGER;
BEGIN
    IF NEW.code IS NULL THEN
        SELECT COALESCE(MAX(CAST(SUBSTRING(code, 5) AS INTEGER)), 0) + 1 
        INTO v_next_val 
        FROM quotations;
        
        NEW.code := 'COT-' || LPAD(v_next_val::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_generate_quotation_code
BEFORE INSERT ON quotations
FOR EACH ROW
EXECUTE FUNCTION generate_quotation_code();

-- Habilitar RLS
ALTER TABLE business_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

-- Crear políticas permisivas para desarrollo
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for business_info') THEN
        CREATE POLICY "Enable all for business_info" ON business_info FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for quotations') THEN
        CREATE POLICY "Enable all for quotations" ON quotations FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
