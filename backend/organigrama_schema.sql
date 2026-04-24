-- Migración para el Sistema de Organigrama y Roles

-- Tabla de Roles (Estructura Principal del Cargo)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    nombre_cargo TEXT NOT NULL,
    area TEXT,
    reporta_a TEXT,
    supervisa_a TEXT,
    proposito TEXT,
    nombres TEXT, -- Ocupante(s) actual(es)
    horario TEXT,
    rango_salarial TEXT,
    sueldo NUMERIC(15, 2),
    dotacion INTEGER DEFAULT 1,
    
    -- Metadatos para el organigrama (opcional, para posicionamiento si se requiere)
    parent_id UUID REFERENCES roles(id) ON DELETE SET NULL
);

-- Tabla de Detalles del Rol (Funciones, KPIs, Competencias, etc.)
CREATE TABLE IF NOT EXISTS detalles_rol (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rol_id UUID REFERENCES roles(id) ON DELETE CASCADE NOT NULL,
    categoria TEXT NOT NULL, -- FUNCION_MAIN, FUNCION_SEC, PROCESO, KPI, RELACION, COMP_TEC, COMP_BLANDA, HERRAMIENTA, CONDICION
    descripcion TEXT NOT NULL,
    orden INTEGER DEFAULT 0
);

-- Habilitar RLS (Opcional, dependiendo de la configuración del proyecto)
-- ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE detalles_rol ENABLE ROW LEVEL SECURITY;

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
