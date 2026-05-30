/*
  # Role-based access control (RBAC)

  Adds a `profiles` table with a `role` field, and updates RLS policies so:
  - admin: can see and manage everything
  - shop_owner: can only see and manage their own shop + inventory

  Notes:
  - We keep `shops.owner_id` (already in schema) as the link to auth.users.
  - We create a trigger to auto-create a profile row for new users.
*/

-- 1) Role field for users (via profiles table)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin', 'shop_owner');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'shop_owner',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper: is current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

-- Profiles policies
DROP POLICY IF EXISTS "Users can view their profile" ON profiles;
CREATE POLICY "Users can view their profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users can update their profile" ON profiles;
CREATE POLICY "Users can update their profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- Auto-create profiles on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'shop_owner')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Update RLS policies for shops/products/inventory

-- SHOPS
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active shops" ON shops;
CREATE POLICY "RBAC: view shops"
  ON shops FOR SELECT
  TO authenticated
  USING (public.is_admin() OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Shop owners can update their shop" ON shops;
CREATE POLICY "RBAC: update shops"
  ON shops FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR owner_id = auth.uid())
  WITH CHECK (public.is_admin() OR owner_id = auth.uid());

DROP POLICY IF EXISTS "RBAC: insert shops" ON shops;
CREATE POLICY "RBAC: insert shops"
  ON shops FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "RBAC: delete shops" ON shops;
CREATE POLICY "RBAC: delete shops"
  ON shops FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- PRODUCTS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view products" ON products;
CREATE POLICY "RBAC: view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert products" ON products;
CREATE POLICY "RBAC: insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can update products" ON products;
CREATE POLICY "RBAC: update products"
  ON products FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "RBAC: delete products" ON products;
CREATE POLICY "RBAC: delete products"
  ON products FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- INVENTORY
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view inventory" ON inventory;
CREATE POLICY "RBAC: view inventory"
  ON inventory FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM shops
      WHERE shops.id = inventory.shop_id
        AND shops.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Shop owners can insert inventory" ON inventory;
CREATE POLICY "RBAC: insert inventory"
  ON inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM shops
      WHERE shops.id = inventory.shop_id
        AND shops.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Shop owners can update their inventory" ON inventory;
CREATE POLICY "RBAC: update inventory"
  ON inventory FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM shops
      WHERE shops.id = inventory.shop_id
        AND shops.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM shops
      WHERE shops.id = inventory.shop_id
        AND shops.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Shop owners can delete their inventory" ON inventory;
CREATE POLICY "RBAC: delete inventory"
  ON inventory FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM shops
      WHERE shops.id = inventory.shop_id
        AND shops.owner_id = auth.uid()
    )
  );

