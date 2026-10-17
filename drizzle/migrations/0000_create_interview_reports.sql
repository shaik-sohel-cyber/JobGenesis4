CREATE TABLE public.interview_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL UNIQUE REFERENCES public.interviews(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  summary jsonb,
  data jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_reports TO authenticated;
GRANT ALL ON public.interview_reports TO service_role;
ALTER TABLE public.interview_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own interview reports" ON public.interview_reports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));
CREATE TRIGGER interview_reports_updated_at BEFORE UPDATE ON public.interview_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();