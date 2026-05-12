-- Migration: auto-generate cotizacion.codigo on INSERT
-- Format:  COT-YYMMDD-NNN  (e.g. COT-260507-001)
-- Timezone: America/Lima
--
-- Strategy: BEFORE INSERT trigger with pg_advisory_xact_lock to serialize
-- concurrent inserts and guarantee unique, ordered correlatives per day.
-- The trigger only fires when codigo IS NULL or '' (inserts from the app
-- never send a codigo; edits/updates preserve the existing value).

-- 1. Allow the column to receive an empty string as placeholder
--    so the trigger can replace it safely (NOT NULL remains enforced by trigger).
ALTER TABLE public.cotizaciones
    ALTER COLUMN codigo SET DEFAULT '';

-- 2. Function: atomically assign the next COT-YYMMDD-NNN code
CREATE OR REPLACE FUNCTION public.set_cotizacion_codigo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_today  text;
    v_prefix text;
    v_next   int;
BEGIN
    IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
        -- Serialize concurrent inserts: only one transaction advances the
        -- counter at a time within the same DB session.
        PERFORM pg_advisory_xact_lock(hashtext('cotizacion_codigo_gen'));

        v_today  := to_char(now() AT TIME ZONE 'America/Lima', 'YYMMDD');
        v_prefix := 'COT-' || v_today || '-';

        -- Find the highest correlative already used today
        SELECT COALESCE(
            MAX(
                CASE
                    WHEN codigo ~ ('^COT-[0-9]{6}-[0-9]+$')
                     AND codigo LIKE v_prefix || '%'
                    THEN SUBSTRING(codigo FROM LENGTH(v_prefix) + 1)::int
                    ELSE 0
                END
            ), 0
        ) + 1
        INTO v_next
        FROM public.cotizaciones;

        NEW.codigo := v_prefix || LPAD(v_next::text, 3, '0');
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Attach trigger (replace if it already exists)
-- Drop the original sequential-code trigger created by cotizaciones_schema.sql
DROP TRIGGER IF EXISTS trg_cotizacion_code ON public.cotizaciones;
DROP FUNCTION IF EXISTS public.generate_cotizacion_code();
DROP TRIGGER IF EXISTS trg_set_cotizacion_codigo ON public.cotizaciones;

CREATE TRIGGER trg_set_cotizacion_codigo
    BEFORE INSERT ON public.cotizaciones
    FOR EACH ROW
    EXECUTE FUNCTION public.set_cotizacion_codigo();
