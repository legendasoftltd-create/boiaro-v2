
-- FIX 1: Remove duplicate handle_new_user trigger (keep on_auth_user_created, drop trg_handle_new_user)
DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;

-- FIX 2: Remove duplicate auto_ledger_on_withdrawal trigger (keep trg_auto_ledger_on_withdrawal, drop trg_auto_ledger_withdrawal)
DROP TRIGGER IF EXISTS trg_auto_ledger_withdrawal ON public.withdrawal_requests;

-- FIX 3: Update order status constraint to include awaiting_payment and payment_failed
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    'pending'::text, 'awaiting_payment'::text, 'confirmed'::text, 'processing'::text,
    'ready_for_pickup'::text, 'pickup_received'::text, 'in_transit'::text,
    'shipped'::text, 'delivered'::text, 'cancelled'::text, 'returned'::text,
    'paid'::text, 'payment_failed'::text
  ])
);
