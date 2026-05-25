-- Migration: Add codigo_venta column and auto-generate VTA-YYMMDD-NNN on INSERT
-- Format:  VTA-YYMMDD-NNN  (e.g. VTA-260525-001)
-- Timezone: America/Lima
--
-- Strategy: BEFORE INSERT trigger with pg_advisory_xact_lock to serialize
-- concurrent inserts and guarantee unique, ordered correlatives per day.
-- The trigger only fires when codigo_venta IS NULL or '' (inserts from the app
-- never send a codigo_venta).

-- 1. Add the column to public.ventas_cabecera
ALTER TABLE public.ventas_cabecera ADD COLUMN IF NOT EXISTS codigo_venta TEXT UNIQUE;

-- 2. Function: atomically assign the next VTA-YYMMDD-NNN code
CREATE OR REPLACE FUNCTION public.set_venta_codigo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_today  text;
    v_prefix text;
    v_next   int;
BEGIN
    IF NEW.codigo_venta IS NULL OR NEW.codigo_venta = '' THEN
        -- Serialize concurrent inserts using advisory lock
        PERFORM pg_advisory_xact_lock(hashtext('venta_codigo_gen'));

        v_today  := to_char(now() AT TIME ZONE 'America/Lima', 'YYMMDD');
        v_prefix := 'VTA-' || v_today || '-';

        -- Find the highest correlative already used today
        SELECT COALESCE(
            MAX(
                CASE
                    WHEN codigo_venta ~ ('^VTA-[0-9]{6}-[0-9]+$')
                     AND codigo_venta LIKE v_prefix || '%'
                    THEN SUBSTRING(codigo_venta FROM LENGTH(v_prefix) + 1)::int
                    ELSE 0
                END
            ), 0
        ) + 1
        INTO v_next
        FROM public.ventas_cabecera;

        NEW.codigo_venta := v_prefix || LPAD(v_next::text, 3, '0');
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Attach trigger (replace if it already exists)
DROP TRIGGER IF EXISTS trg_set_venta_codigo ON public.ventas_cabecera;
CREATE TRIGGER trg_set_venta_codigo
    BEFORE INSERT ON public.ventas_cabecera
    FOR EACH ROW
    EXECUTE FUNCTION public.set_venta_codigo();
