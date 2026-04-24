-- 1. Añadir columna DNI a la tabla de roles para vincular con la ficha de personal
ALTER TABLE roles ADD COLUMN dni TEXT;

-- 2. Crear un índice para mejorar la velocidad de búsqueda por DNI
CREATE INDEX idx_roles_dni ON roles(dni);

-- 3. Otros cambios para garantizar consistencia entre tablas
-- (Opcional) Si ya tienes datos, podrías intentar vincularlos automáticamente por nombre
-- UPDATE roles r SET dni = p.dni FROM personal_staff p WHERE (p.nombres || ' ' || p.apellidos) = r.nombres;
