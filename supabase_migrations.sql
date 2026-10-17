-- ============================================================
-- 8 SAINTS TAILORING - SUPABASE MIGRATIONS
-- Run this ENTIRE block in the Supabase SQL Editor
-- ============================================================

-- --1. FIX orders UPDATE POLICY (add WITH CHECK for admins)--
DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- --1B. PROFILES MEASUREMENTS & PREFERENCES--
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS measurements JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_fit TEXT DEFAULT 'Regular';

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- --2. NOTIFICATIONS TABLE--
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

DROP POLICY IF EXISTS "notifications_select_own"  ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own"  ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service-role (trigger) can always insert; admins too
DROP POLICY IF EXISTS "notifications_insert_admin" ON public.notifications;
CREATE POLICY "notifications_insert_admin" ON public.notifications FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- --3. TRIGGER FUNCTION: auto-notify customer on status change--
CREATE OR REPLACE FUNCTION public.notify_on_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title   TEXT;
  v_message TEXT;
  v_short   TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_short := LEFT(NEW.id::TEXT, 8);

  CASE NEW.status
    WHEN 'Quoted' THEN
      v_title   := 'Quotation Ready!';
      v_message := 'Your order #' || v_short || ' has been quoted. Tap to review and approve.';
    WHEN 'In Production' THEN
      v_title   := 'Order In Production';
      v_message := 'Your order #' || v_short || ' is now being crafted by our tailors!';
    WHEN 'Completed' THEN
      v_title   := 'Order Completed!';
      v_message := 'Your order #' || v_short || ' is complete and ready for pickup/delivery.';
    ELSE
      v_title   := 'Order Updated';
      v_message := 'Your order #' || v_short || ' status changed to: ' || NEW.status || '.';
  END CASE;

  INSERT INTO public.notifications (user_id, order_id, title, message, is_read)
  VALUES (NEW.user_id, NEW.id, v_title, v_message, FALSE);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notify_on_order_status_change: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_status ON public.orders;
CREATE TRIGGER trg_notify_order_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_status_change();

-- --4. ENABLE REALTIME for notifications--
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
