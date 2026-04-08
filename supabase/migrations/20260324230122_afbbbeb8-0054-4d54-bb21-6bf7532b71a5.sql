
-- Notifications table (admin-created notifications)
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'system',
  audience text NOT NULL DEFAULT 'all',
  target_user_id uuid NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'draft',
  link text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  created_by uuid NULL
);

-- User notifications (delivery records)
CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL
);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Notifications policies
CREATE POLICY "Admins can manage notifications" ON public.notifications
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view sent notifications" ON public.notifications
  FOR SELECT USING (status = 'sent');

-- User notifications policies
CREATE POLICY "Admins can manage user_notifications" ON public.user_notifications
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own notifications" ON public.user_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.user_notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_user_notifications_user_id ON public.user_notifications(user_id);
CREATE INDEX idx_user_notifications_read ON public.user_notifications(user_id, is_read);
CREATE INDEX idx_notifications_status ON public.notifications(status);

-- Enable realtime for user_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
