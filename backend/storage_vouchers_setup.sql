-- ============================================================
-- STORAGE SETUP: bucket "vouchers" para comprobantes, depósitos
-- y cualquier imagen de sustento del ERP.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- ============================================================

-- 1. Crear el bucket si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'vouchers',
    'vouchers',
    true,
    10485760,   -- 10 MB por archivo
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']
)
ON CONFLICT (id) DO UPDATE SET
    public            = true,
    file_size_limit   = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];

-- 2. Habilitar RLS en storage.objects (normalmente ya está activo)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de acceso para el bucket "vouchers"
DO $$
BEGIN

    -- Lectura pública (cualquiera puede ver las imágenes)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'vouchers_public_select'
    ) THEN
        CREATE POLICY "vouchers_public_select" ON storage.objects
            FOR SELECT
            USING (bucket_id = 'vouchers');
    END IF;

    -- Subida de archivos (usuarios autenticados)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'vouchers_auth_insert'
    ) THEN
        CREATE POLICY "vouchers_auth_insert" ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (bucket_id = 'vouchers');
    END IF;

    -- Actualización / upsert (usuarios autenticados)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'vouchers_auth_update'
    ) THEN
        CREATE POLICY "vouchers_auth_update" ON storage.objects
            FOR UPDATE TO authenticated
            USING (bucket_id = 'vouchers');
    END IF;

    -- Eliminación (usuarios autenticados)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'vouchers_auth_delete'
    ) THEN
        CREATE POLICY "vouchers_auth_delete" ON storage.objects
            FOR DELETE TO authenticated
            USING (bucket_id = 'vouchers');
    END IF;

END $$;
