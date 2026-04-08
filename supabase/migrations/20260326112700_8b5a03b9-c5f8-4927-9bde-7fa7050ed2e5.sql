
-- Accounting ledger table for income/expense tracking
CREATE TABLE public.accounting_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL DEFAULT 'income' CHECK (type IN ('income', 'expense')),
  category text NOT NULL DEFAULT 'general',
  description text,
  amount numeric NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accounting_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage accounting_ledger" ON public.accounting_ledger
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Add cost columns to book_formats for per-book costing
ALTER TABLE public.book_formats ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0;
ALTER TABLE public.book_formats ADD COLUMN IF NOT EXISTS printing_cost numeric DEFAULT 0;

-- Add fulfillment cost columns to orders for per-order costing
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_cost numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packaging_cost numeric DEFAULT 0;
