-- Allow authenticated users to insert payment_events for their own orders
CREATE POLICY "Users can insert own payment events"
ON public.payment_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = payment_events.order_id
      AND orders.user_id = auth.uid()
  )
);

-- Allow authenticated users to insert daily_book_stats
CREATE POLICY "Authenticated users can insert daily_book_stats"
ON public.daily_book_stats
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update daily_book_stats
CREATE POLICY "Authenticated users can update daily_book_stats"
ON public.daily_book_stats
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to select daily_book_stats (needed for the upsert check)
CREATE POLICY "Authenticated users can read daily_book_stats"
ON public.daily_book_stats
FOR SELECT
TO authenticated
USING (true);