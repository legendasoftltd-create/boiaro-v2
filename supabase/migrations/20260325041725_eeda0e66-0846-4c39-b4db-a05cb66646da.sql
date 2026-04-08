
-- Support Tickets table
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE DEFAULT 'TKT-' || substr(gen_random_uuid()::text, 1, 8),
  user_id uuid NOT NULL,
  user_name text,
  user_email text,
  user_phone text,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  type text NOT NULL DEFAULT 'ticket',
  message text NOT NULL,
  attachment_url text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own tickets" ON public.support_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all tickets" ON public.support_tickets FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_type ON public.support_tickets(type);

-- Ticket Replies table
CREATE TABLE public.ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  sender_name text,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view public replies on own tickets" ON public.ticket_replies FOR SELECT TO authenticated
  USING (
    is_internal = false AND EXISTS (
      SELECT 1 FROM public.support_tickets WHERE id = ticket_replies.ticket_id AND user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert replies on own tickets" ON public.ticket_replies FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND is_admin = false AND is_internal = false AND EXISTS (
      SELECT 1 FROM public.support_tickets WHERE id = ticket_replies.ticket_id AND user_id = auth.uid()
    )
  );
CREATE POLICY "Admins can manage all replies" ON public.ticket_replies FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ticket_replies_ticket ON public.ticket_replies(ticket_id);
