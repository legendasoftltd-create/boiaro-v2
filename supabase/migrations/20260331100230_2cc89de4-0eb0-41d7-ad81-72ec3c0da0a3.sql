
-- Drop existing check constraint on orders.status and add access_granted + partial_refunded
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'pending', 'awaiting_payment', 'confirmed', 'processing',
    'ready_for_pickup', 'pickup_received', 'in_transit', 'shipped',
    'delivered', 'cancelled', 'returned', 'paid', 'payment_failed',
    'access_granted', 'refunded'
  )
);
