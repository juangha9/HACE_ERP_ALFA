-- Script SQL para crear la tabla de Tableros Personalizados (opcional)
-- Actualmente, la plataforma guarda los tableros personalizados de forma local 
-- en el navegador (LocalStorage) por cada usuario.
-- Si en el futuro se desea centralizar estos tableros en Supabase para todos 
-- los usuarios, se puede ejecutar este script.

CREATE TABLE public.custom_boards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    width NUMERIC(10, 2) NOT NULL,
    height NUMERIC(10, 2) NOT NULL,
    material VARCHAR(255),
    -- veta: TRUE = el material tiene veta y las piezas no pueden rotar
    --       (ni con la tecla R en el modo manual ni en la optimización).
    --       FALSE = sin veta; las piezas pueden rotar libremente.
    -- Campo obligatorio en la UI al crear/editar un tablero personalizado.
    veta BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Políticas RLS (Row Level Security) básicas si se tiene autenticación habilitada:
ALTER TABLE public.custom_boards ENABLE ROW LEVEL SECURITY;

-- Permite lectura y escritura a todos los usuarios (ajustar según roles si es necesario)
CREATE POLICY "Allow all access to custom boards" 
ON public.custom_boards FOR ALL 
USING (true);

-- ==============================================================================
-- INSERTAR MEDIDAS COMUNES PREESTABLECIDAS
-- ==============================================================================
INSERT INTO public.custom_boards (name, width, height, material) VALUES
('Blanco 18mm', 2440, 1830, 'Melamina 18mm'),
('MDF 18mm', 2750, 1830, 'MDF 18mm'),
('Aglomerado 15mm', 2500, 1830, 'Aglomerado 15mm'),
('Especial', 3200, 2100, 'Especial');
