
-- Email templates table for admin management
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_type text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  variables text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_type)
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email templates"
ON public.email_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed default templates
INSERT INTO public.email_templates (name, template_type, subject, body_html, body_text, variables) VALUES
('Welcome Email', 'welcome', 'Welcome to BoiAro, {{user_name}}!', '<h1>Welcome to BoiAro!</h1><p>Hi {{user_name}},</p><p>Thank you for joining BoiAro. Start exploring thousands of books today.</p>', 'Welcome to BoiAro! Hi {{user_name}}, Thank you for joining.', ARRAY['user_name', 'email']),
('Email Verification', 'email_verification', 'Verify your email - BoiAro', '<h1>Verify Your Email</h1><p>Hi {{user_name}},</p><p>Please click the link below to verify your email address.</p><p><a href="{{verification_url}}">Verify Email</a></p>', 'Verify your email: {{verification_url}}', ARRAY['user_name', 'verification_url']),
('Password Reset', 'password_reset', 'Reset your password - BoiAro', '<h1>Password Reset</h1><p>Hi {{user_name}},</p><p>Click the link below to reset your password.</p><p><a href="{{reset_url}}">Reset Password</a></p>', 'Reset your password: {{reset_url}}', ARRAY['user_name', 'reset_url']),
('Order Confirmation', 'order_confirmation', 'Order Confirmed #{{order_id}} - BoiAro', '<h1>Order Confirmed!</h1><p>Hi {{user_name}},</p><p>Your order #{{order_id}} has been placed successfully.</p><p>Total: BDT {{total_amount}}</p>', 'Order #{{order_id}} confirmed. Total: BDT {{total_amount}}', ARRAY['user_name', 'order_id', 'total_amount']),
('Payment Success', 'payment_success', 'Payment Received - BoiAro', '<h1>Payment Successful</h1><p>Hi {{user_name}},</p><p>We received your payment of BDT {{amount}} for order #{{order_id}}.</p>', 'Payment of BDT {{amount}} received for order #{{order_id}}.', ARRAY['user_name', 'amount', 'order_id']),
('Payment Failed', 'payment_failed', 'Payment Failed - BoiAro', '<h1>Payment Failed</h1><p>Hi {{user_name}},</p><p>Your payment for order #{{order_id}} could not be processed.</p>', 'Payment failed for order #{{order_id}}.', ARRAY['user_name', 'order_id']),
('Creator Application Received', 'creator_application_received', 'Application Received - BoiAro', '<h1>Application Received</h1><p>Hi {{user_name}},</p><p>We received your {{role}} application. We will review it shortly.</p>', 'Your {{role}} application has been received.', ARRAY['user_name', 'role']),
('Creator Approved', 'creator_approved', 'Application Approved! - BoiAro', '<h1>Congratulations!</h1><p>Hi {{user_name}},</p><p>Your {{role}} application has been approved. You can now access your creator dashboard.</p>', 'Your {{role}} application has been approved!', ARRAY['user_name', 'role']),
('Creator Rejected', 'creator_rejected', 'Application Update - BoiAro', '<h1>Application Update</h1><p>Hi {{user_name}},</p><p>Unfortunately your {{role}} application was not approved at this time.</p>', 'Your {{role}} application was not approved.', ARRAY['user_name', 'role']),
('Withdrawal Approved', 'withdrawal_approved', 'Withdrawal Approved - BoiAro', '<h1>Withdrawal Approved</h1><p>Hi {{user_name}},</p><p>Your withdrawal request of BDT {{amount}} has been approved.</p>', 'Withdrawal of BDT {{amount}} approved.', ARRAY['user_name', 'amount']),
('Withdrawal Rejected', 'withdrawal_rejected', 'Withdrawal Update - BoiAro', '<h1>Withdrawal Update</h1><p>Hi {{user_name}},</p><p>Your withdrawal request of BDT {{amount}} was not approved.</p>', 'Withdrawal of BDT {{amount}} was not approved.', ARRAY['user_name', 'amount']),
('Subscription Activated', 'subscription_activated', 'Subscription Active - BoiAro', '<h1>Subscription Active!</h1><p>Hi {{user_name}},</p><p>Your {{subscription_name}} subscription is now active until {{expiry_date}}.</p>', 'Your {{subscription_name}} subscription is active.', ARRAY['user_name', 'subscription_name', 'expiry_date']),
('Subscription Expiry Reminder', 'subscription_expiry_reminder', 'Subscription Expiring Soon - BoiAro', '<h1>Subscription Expiring</h1><p>Hi {{user_name}},</p><p>Your {{subscription_name}} subscription expires on {{expiry_date}}. Renew now to continue.</p>', 'Your {{subscription_name}} expires on {{expiry_date}}.', ARRAY['user_name', 'subscription_name', 'expiry_date']),
('Admin Announcement', 'admin_announcement', '{{subject}} - BoiAro', '<h1>{{subject}}</h1><p>{{message}}</p>', '{{subject}}: {{message}}', ARRAY['subject', 'message']);
