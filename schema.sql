-- ============================================================
-- 8 SAINTS TAILORING - SUPABASE DATABASE SCHEMA
-- Matches Supabase Schema Visualizer (profiles, services, orders)
-- ============================================================

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --1. PROFILES TABLE (Linked to auth.users)--
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'customer',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --2. SERVICES TABLE--
CREATE TABLE IF NOT EXISTS public.services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  base_price  NUMERIC NOT NULL DEFAULT 0,
  image_url   TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --3. ORDERS TABLE--
CREATE TABLE IF NOT EXISTS public.orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_name    TEXT NOT NULL,
  service_id       UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name     TEXT,
  size_type        TEXT,
  standard_size    TEXT,
  measurements     JSONB DEFAULT '{}'::jsonb,
  design_notes     TEXT,
  quotation_price  NUMERIC,
  status           TEXT NOT NULL DEFAULT 'Pending Quote',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --INDEXES--
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_service_id ON public.orders(service_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- --ROW LEVEL SECURITY (RLS)--
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders   ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone authenticated can read/write their own profile; admins can read all
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Services: Public read for all users, insert/update/delete for authenticated admin
DROP POLICY IF EXISTS "services_select_public" ON public.services;
CREATE POLICY "services_select_public" ON public.services FOR SELECT USING (true);

DROP POLICY IF EXISTS "services_write_admin" ON public.services;
CREATE POLICY "services_write_admin" ON public.services FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
    OR true -- Set to true or customize for your admin dashboard
  );

-- Orders: Users can read & insert their own; admins can read & update all
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "orders_insert" ON public.orders;
CREATE POLICY "orders_insert" ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- ============================================================
-- SEED DATA (Run this in Supabase SQL Editor to populate services)
-- ============================================================
INSERT INTO public.services (name, category, base_price, image_url, description) VALUES
  ('Custom Barong Tagalog', 'Formal Wear', 2500, '/assets/images/service_barong.png', 'Handcrafted piña or jusi barong with custom embroidery and perfect fit tailoring.'),
  ('Bespoke Suit', 'Formal Wear', 8500, '/assets/images/service_suit.png', 'Full bespoke suit in premium wool or cotton blend. Jacket, trousers, vest options.'),
  ('Evening Gown', 'Ladies Wear', 4500, '/assets/images/service_dress.png', 'Elegant custom evening gown in silk, satin, or chiffon. Unique design per client.'),
  ('Garment Alteration', 'Alterations', 350, '/assets/images/service_alterations.png', 'Professional alterations for any garment. Hemming, taking in, letting out, repairs.'),
  ('Corporate Uniform', 'Uniforms', 1200, '/assets/images/service_uniform.png', 'Custom corporate uniforms for offices, restaurants, and organizations. Bulk orders available.'),
  ('Wedding Entourage Set', 'Wedding', 12000, '/assets/images/service_suit.png', 'Complete coordinated outfit set for wedding entourages. Bespoke designs for the entire party.')
ON CONFLICT DO NOTHING;
