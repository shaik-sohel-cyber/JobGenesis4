ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS target_role text,
  ADD COLUMN IF NOT EXISTS job_description text,
  ADD COLUMN IF NOT EXISTS required_skills text[] NOT NULL DEFAULT '{}';

CREATE TABLE public.interview_integrity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  client_event_id text NOT NULL,
  kind text NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  question_id uuid REFERENCES public.interview_questions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interview_id, client_event_id)
);
CREATE INDEX ON public.interview_integrity_events (interview_id);

GRANT SELECT, INSERT ON public.interview_integrity_events TO authenticated;
GRANT ALL ON public.interview_integrity_events TO service_role;
ALTER TABLE public.interview_integrity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read integrity events" ON public.interview_integrity_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));
CREATE POLICY "Owners add integrity events while live" ON public.interview_integrity_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid() AND i.session_state = 'INTERVIEW_ACTIVE'));