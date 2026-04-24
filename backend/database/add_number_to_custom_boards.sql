-- Agregar columna 'number' a custom_boards
ALTER TABLE public.custom_boards 
ADD COLUMN number INTEGER UNIQUE CHECK (number > 0);

-- Actualizar registros existentes si es necesario (opcional, aquí los dejamos NULL o asignamos manual)
-- UPDATE public.custom_boards SET number = 1 WHERE name = 'Blanco 18mm';
