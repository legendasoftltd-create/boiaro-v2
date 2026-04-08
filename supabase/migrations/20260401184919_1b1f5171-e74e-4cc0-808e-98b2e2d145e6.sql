-- Drop the existing policy and recreate with explicit WITH CHECK for INSERT
DROP POLICY IF EXISTS "Admins can manage accounting_ledger" ON public.accounting_ledger;

CREATE POLICY "Admins can manage accounting_ledger"
ON public.accounting_ledger
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
