-- Fix payments method CHECK constraint to include all valid methods
ALTER TABLE public.payments DROP CONSTRAINT payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check 
  CHECK (method = ANY (ARRAY['bkash', 'nagad', 'rocket', 'card', 'cod', 'demo', 'sslcommerz', 'stripe', 'paypal']));

-- Fix payments status CHECK constraint to include all valid statuses
ALTER TABLE public.payments DROP CONSTRAINT payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check 
  CHECK (status = ANY (ARRAY['pending', 'completed', 'failed', 'refunded', 'paid', 'awaiting_payment', 'cod_pending']));