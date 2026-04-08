
-- Admin roles table
CREATE TABLE public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage admin_roles" ON public.admin_roles FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin roles readable by admins" ON public.admin_roles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Role permissions table
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, module)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage role_permissions" ON public.role_permissions FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Role permissions readable by admins" ON public.role_permissions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Admin user role assignments (which admin_role an admin user has)
CREATE TABLE public.admin_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  admin_role_id uuid NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage admin_user_roles" ON public.admin_user_roles FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own admin role" ON public.admin_user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admin activity logs
CREATE TABLE public.admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text,
  action text NOT NULL,
  module text,
  target_id text,
  details text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage admin_activity_logs" ON public.admin_activity_logs FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE INDEX idx_admin_activity_user ON public.admin_activity_logs(user_id);
CREATE INDEX idx_admin_activity_created ON public.admin_activity_logs(created_at DESC);

-- Seed default roles
INSERT INTO public.admin_roles (name, label, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Full system access to all modules and settings', true),
  ('manager', 'Manager', 'Operational access to content and orders', true),
  ('support_agent', 'Support Agent', 'Access to support tickets and user data', true),
  ('content_manager', 'Content Manager', 'Manage books, categories, and content', true);

-- Seed permissions for super_admin (all modules, all actions)
INSERT INTO public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, m.module, true, true, true, true
FROM public.admin_roles r
CROSS JOIN (VALUES ('books'),('users'),('orders'),('payments'),('reports'),('support'),('content'),('settings'),('roles'),('email'),('notifications'),('analytics'),('cms'),('subscriptions'),('coupons'),('shipping'),('withdrawals'),('revenue')) AS m(module)
WHERE r.name = 'super_admin';

-- Manager permissions
INSERT INTO public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, m.module, m.v, m.c, m.e, m.d
FROM public.admin_roles r
CROSS JOIN (VALUES
  ('books', true, true, true, true),
  ('users', true, false, false, false),
  ('orders', true, false, true, false),
  ('payments', true, false, false, false),
  ('reports', true, false, false, false),
  ('support', true, true, true, false),
  ('content', true, true, true, true),
  ('analytics', true, false, false, false),
  ('subscriptions', true, false, true, false),
  ('coupons', true, true, true, false)
) AS m(module, v, c, e, d)
WHERE r.name = 'manager';

-- Support agent permissions
INSERT INTO public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, m.module, m.v, m.c, m.e, m.d
FROM public.admin_roles r
CROSS JOIN (VALUES
  ('support', true, true, true, false),
  ('users', true, false, false, false)
) AS m(module, v, c, e, d)
WHERE r.name = 'support_agent';

-- Content manager permissions
INSERT INTO public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
SELECT r.id, m.module, m.v, m.c, m.e, m.d
FROM public.admin_roles r
CROSS JOIN (VALUES
  ('books', true, true, true, true),
  ('content', true, true, true, true),
  ('cms', true, true, true, true)
) AS m(module, v, c, e, d)
WHERE r.name = 'content_manager';
