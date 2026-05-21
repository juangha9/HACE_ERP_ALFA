-- Migration: add_get_users_for_admin_function
-- Creates a SECURITY DEFINER function that allows admin/administrador roles
-- to retrieve all user profiles with their auth emails.
-- Run this once in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.get_all_users_for_admin()
RETURNS TABLE(id uuid, full_name text, role text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only admin or administrador roles may call this function.
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'administrador')
    ) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        COALESCE(p.full_name, '')::text AS full_name,
        p.role::text,
        COALESCE(u.email, '')::text AS email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    ORDER BY p.full_name;
END;
$$;

-- Grant execute to authenticated users (security enforced inside the function).
GRANT EXECUTE ON FUNCTION public.get_all_users_for_admin() TO authenticated;
