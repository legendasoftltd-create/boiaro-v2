-- Add scheduled_at and channel to notifications
ALTER TABLE public.notifications 
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS template_id uuid DEFAULT NULL;

-- Notification templates table
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'system',
  channel text NOT NULL DEFAULT 'in_app',
  cta_text text DEFAULT NULL,
  cta_link text DEFAULT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notification_templates" ON public.notification_templates
  FOR ALL TO public USING (has_role(auth.uid(), 'admin'));

-- Notification preferences per user
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  push_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  promotional_enabled boolean NOT NULL DEFAULT true,
  reminder_enabled boolean NOT NULL DEFAULT true,
  order_enabled boolean NOT NULL DEFAULT true,
  support_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences" ON public.notification_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all preferences" ON public.notification_preferences
  FOR SELECT TO public USING (has_role(auth.uid(), 'admin'));