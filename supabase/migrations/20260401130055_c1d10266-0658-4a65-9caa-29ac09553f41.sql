
-- Table to store pending edit requests from creators
CREATE TABLE public.content_edit_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL, -- 'book' or 'book_format'
  content_id UUID NOT NULL,
  submitted_by UUID NOT NULL,
  proposed_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_edit_requests ENABLE ROW LEVEL SECURITY;

-- Creators can view their own requests
CREATE POLICY "Creators can view own edit requests"
ON public.content_edit_requests
FOR SELECT
USING (auth.uid() = submitted_by);

-- Creators can insert their own requests
CREATE POLICY "Creators can submit edit requests"
ON public.content_edit_requests
FOR INSERT
WITH CHECK (auth.uid() = submitted_by);

-- Admins can view all
CREATE POLICY "Admins can view all edit requests"
ON public.content_edit_requests
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update (approve/reject)
CREATE POLICY "Admins can update edit requests"
ON public.content_edit_requests
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Index for fast lookups
CREATE INDEX idx_content_edit_requests_status ON public.content_edit_requests(status);
CREATE INDEX idx_content_edit_requests_content ON public.content_edit_requests(content_type, content_id);

-- Timestamp trigger
CREATE TRIGGER update_content_edit_requests_updated_at
BEFORE UPDATE ON public.content_edit_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
