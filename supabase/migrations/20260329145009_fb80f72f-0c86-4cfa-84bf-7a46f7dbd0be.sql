
-- Order status history table for full timeline tracking
CREATE TABLE public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID,
  changed_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_history_order ON public.order_status_history(order_id);
CREATE INDEX idx_order_status_history_created ON public.order_status_history(created_at DESC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage order status history"
  ON public.order_status_history FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Add indexes to admin_activity_logs for better filtering
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_module ON public.admin_activity_logs(module);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created ON public.admin_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_user ON public.admin_activity_logs(user_id);
