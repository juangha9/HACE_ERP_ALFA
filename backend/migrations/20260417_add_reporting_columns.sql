-- Migration to add reporting columns to optimizations table
ALTER TABLE optimizations 
ADD COLUMN IF NOT EXISTS project_name TEXT,
ADD COLUMN IF NOT EXISTS work_order TEXT,
ADD COLUMN IF NOT EXISTS client_name TEXT,
ADD COLUMN IF NOT EXISTS material_type TEXT,
ADD COLUMN IF NOT EXISTS boards_count INTEGER,
ADD COLUMN IF NOT EXISTS waste_percent NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS total_pieces INTEGER,
ADD COLUMN IF NOT EXISTS saw_kerf NUMERIC(4,2),
ADD COLUMN IF NOT EXISTS grain_direction TEXT;

COMMENT ON COLUMN optimizations.project_name IS 'Nombre del proyecto para búsqueda rápida';
COMMENT ON COLUMN optimizations.work_order IS 'Enlace con versiones de cotización/optimización';
COMMENT ON COLUMN optimizations.client_name IS 'Nombre del cliente para reportes de consumo';
COMMENT ON COLUMN optimizations.material_type IS 'Material principal utilizado';
COMMENT ON COLUMN optimizations.boards_count IS 'Cantidad de tableros usados';
COMMENT ON COLUMN optimizations.waste_percent IS 'Porcentaje de merma calculado';
COMMENT ON COLUMN optimizations.total_pieces IS 'Volumen total de piezas producidas';
COMMENT ON COLUMN optimizations.saw_kerf IS 'Grosor del disco utilizado';
COMMENT ON COLUMN optimizations.grain_direction IS 'Orientación de las piezas';
