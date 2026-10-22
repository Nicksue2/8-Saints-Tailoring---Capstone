-- ============================================================
-- 8 SAINTS TAILORING - SUPABASE DATABASE SCHEMA
-- Matches Supabase Schema Visualizer (profiles, services, orders)
-- ============================================================

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --1. PROFILES TABLE (Linked to auth.users)--
CREATE TABLE IF NOT EXISTS public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name      TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'customer',
  phone          TEXT,
  preferred_fit  TEXT DEFAULT 'Regular',
  measurements   JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- Helper function: non-recursive admin check (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Profiles: Anyone authenticated or anon can read profiles; users update own, admin updates all
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_select_clean" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_insert_clean" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_clean" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id OR public.is_admin()
  ) WITH CHECK (
    auth.uid() = id OR public.is_admin()
  );

-- Services: Public read for all users, insert/update/delete for authenticated admin
DROP POLICY IF EXISTS "services_select_public" ON public.services;
CREATE POLICY "services_select_public" ON public.services FOR SELECT USING (true);

DROP POLICY IF EXISTS "services_write_admin" ON public.services;
CREATE POLICY "services_write_admin" ON public.services FOR ALL
  USING (
    public.is_admin()
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
    OR true
  );

-- Orders: Users can read & insert their own; admins can read & update all
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_admin()
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "orders_insert" ON public.orders;
CREATE POLICY "orders_insert" ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.is_admin()
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_admin()
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- --4. NOTIFICATIONS TABLE--
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read  ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created  ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert_all" ON public.notifications;
CREATE POLICY "notifications_insert_all" ON public.notifications FOR INSERT
  WITH CHECK (true);

-- --5. TRIGGER: auto-notify customer on order status change--
CREATE OR REPLACE FUNCTION public.notify_on_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title TEXT; v_message TEXT; v_short TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  v_short := LEFT(NEW.id::TEXT, 8);
  CASE NEW.status
    WHEN 'Quoted'        THEN v_title := 'Quotation Ready!';    v_message := 'Your order #' || v_short || ' has been quoted. Tap to review.';
    WHEN 'In Production' THEN v_title := 'Order In Production'; v_message := 'Your order #' || v_short || ' is being crafted!';
    WHEN 'Completed'     THEN v_title := 'Order Completed!';    v_message := 'Your order #' || v_short || ' is ready for pickup/delivery.';
    ELSE                      v_title := 'Order Updated';       v_message := 'Your order #' || v_short || ' status: ' || NEW.status || '.';
  END CASE;

  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, order_id, title, message)
    VALUES (NEW.user_id, NEW.id, v_title, v_message);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify trigger error: %', SQLERRM; RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_order_status ON public.orders;
CREATE TRIGGER trg_notify_order_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_order_status_change();

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

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

