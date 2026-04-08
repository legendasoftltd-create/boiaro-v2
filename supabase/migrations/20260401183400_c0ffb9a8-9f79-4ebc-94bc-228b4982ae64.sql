
ALTER TABLE public.accounting_ledger
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto';

COMMENT ON COLUMN public.accounting_ledger.source IS 'Origin of the entry: auto (system-generated), manual (admin-created), system (edge function)';
