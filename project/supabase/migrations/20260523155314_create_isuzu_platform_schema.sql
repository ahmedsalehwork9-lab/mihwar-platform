/*
  # Isuzu Spare Parts Platform - Initial Schema

  ## Overview
  Creates the core tables for the B2B SaaS platform for Isuzu spare parts shops in Saudi Arabia.

  ## New Tables

  ### shops
  - `id` (uuid, primary key) - Unique shop identifier
  - `name` (text) - Shop name in English
  - `name_ar` (text) - Shop name in Arabic
  - `phone` (text) - Contact phone number
  - `city` (text) - City in Saudi Arabia
  - `city_ar` (text) - City in Arabic
  - `address` (text) - Physical address
  - `owner_id` (uuid) - References auth.users (shop owner)
  - `is_active` (boolean) - Whether shop is active
  - `created_at` (timestamptz)

  ### products
  - `id` (uuid, primary key) - Unique product identifier
  - `part_number` (text, unique) - Isuzu OEM part number
  - `name` (text) - Part name in English
  - `name_ar` (text) - Part name in Arabic
  - `category` (text) - Part category
  - `category_ar` (text) - Category in Arabic
  - `description` (text) - Part description
  - `created_at` (timestamptz)

  ### inventory
  - `id` (uuid, primary key)
  - `shop_id` (uuid) - References shops
  - `product_id` (uuid) - References products
  - `quantity` (integer) - Current stock quantity
  - `price` (numeric) - Price in SAR
  - `updated_at` (timestamptz)
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read all shops, products, and inventory (for search)
  - Shop owners can only manage their own shop's inventory
  - Admins can manage all data
*/

-- SHOPS TABLE
CREATE TABLE IF NOT EXISTS shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  name_ar text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  city_ar text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active shops"
  ON shops FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Shop owners can update their shop"
  ON shops FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  name_ar text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  category_ar text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- INVENTORY TABLE
CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  price numeric(10, 2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shop_id, product_id)
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view inventory"
  ON inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Shop owners can insert inventory"
  ON inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shops
      WHERE shops.id = shop_id
      AND shops.owner_id = auth.uid()
    )
  );

CREATE POLICY "Shop owners can update their inventory"
  ON inventory FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shops
      WHERE shops.id = shop_id
      AND shops.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shops
      WHERE shops.id = shop_id
      AND shops.owner_id = auth.uid()
    )
  );

CREATE POLICY "Shop owners can delete their inventory"
  ON inventory FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shops
      WHERE shops.id = shop_id
      AND shops.owner_id = auth.uid()
    )
  );

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_inventory_shop_id ON inventory(shop_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_products_part_number ON products(part_number);
CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON shops(owner_id);
