-- Fix: Allow all authenticated users to read all profiles
-- Problem: profiles table RLS was blocking non-admin users from reading other users'
-- display_name, causing the USUARIO column to show blank in SalesTreasuryPage.
-- getVentas() in api.ts builds a profileMap from profiles table — if a user can only
-- read their own row, the map is incomplete and usuario_nombre resolves to null.

-- Drop existing read policy if any (safe to run multiple times)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "authenticated_read_all_profiles" ON profiles;

-- Allow any authenticated user to SELECT all profiles (read-only)
-- This is safe for an internal company tool where all users are known employees.
CREATE POLICY "authenticated_read_all_profiles"
  ON profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Keep write restricted: users can only update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
