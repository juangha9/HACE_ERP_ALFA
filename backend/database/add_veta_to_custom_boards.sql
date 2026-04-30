-- =============================================================================
-- Migración: agregar columna `veta` a public.custom_boards
-- =============================================================================
-- Si el material respeta veta (TRUE) las piezas de ese tablero NO podrán
-- rotarse: ni con la tecla R en el modo manual del CuttingMap, ni durante la
-- optimización (ni en Ahorro Máx ni en Simples). Si la veta es FALSE, las
-- piezas pueden rotarse libremente.
--
-- DEFAULT TRUE como medida segura para tableros existentes (mejor bloquear
-- rotación que arruinar el corte por veta no respetada). El frontend exige al
-- usuario seleccionar explícitamente TRUE/FALSE al crear/editar un tablero
-- personalizado nuevo, por lo que el default solo afecta a las filas previas.
-- =============================================================================

ALTER TABLE public.custom_boards
ADD COLUMN IF NOT EXISTS veta BOOLEAN NOT NULL DEFAULT TRUE;

-- (Opcional) Si ya hay tableros existentes y conoces cuáles van sin veta,
-- puedes actualizarlos puntualmente, p. ej.:
--   UPDATE public.custom_boards SET veta = FALSE WHERE name ILIKE '%MDF%';
