ALTER TABLE public.interviews ADD COLUMN camera_consent text, ADD COLUMN camera_state text;

CREATE TABLE public.interview_visual_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.interview_questions(id) ON DELETE SET NULL,
  client_event_id text NOT NULL,
  event_type text NOT NULL,
  started_at timestamptz NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  confidence real,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interview_id, client_event_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_visual_events TO authenticated;
GRANT ALL ON public.interview_visual_events TO service_role;
ALTER TABLE public.interview_visual_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own interview rows" ON public.interview_visual_events FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));
CREATE INDEX ON public.interview_visual_events (interview_id, started_at);

CREATE TABLE public.interview_visual_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interview_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_visual_summaries TO authenticated;
GRANT ALL ON public.interview_visual_summaries TO service_role;
ALTER TABLE public.interview_visual_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own interview rows" ON public.interview_visual_summaries FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));
CREATE TRIGGER interview_visual_summaries_updated_at BEFORE UPDATE ON public.interview_visual_summaries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();