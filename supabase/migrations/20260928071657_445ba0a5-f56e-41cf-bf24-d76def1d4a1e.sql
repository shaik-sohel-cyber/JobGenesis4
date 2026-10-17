CREATE TABLE public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'created',
  mode text NOT NULL DEFAULT 'mixed',
  current_stage text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own interviews" ON public.interviews FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = auth.uid()));
CREATE TRIGGER interviews_updated_at BEFORE UPDATE ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX ON public.interviews(user_id);

CREATE TABLE public.interview_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  stage text NOT NULL,
  objective text NOT NULL,
  target_skill text,
  target_claim_id uuid REFERENCES public.resume_claims(id) ON DELETE SET NULL,
  target_project text,
  difficulty text NOT NULL DEFAULT 'medium',
  order_index integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.interview_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  blueprint_id uuid REFERENCES public.interview_blueprints(id) ON DELETE SET NULL,
  parent_question_id uuid REFERENCES public.interview_questions(id) ON DELETE SET NULL,
  question text NOT NULL,
  category text NOT NULL,
  difficulty text NOT NULL DEFAULT 'medium',
  objective text,
  target_skill text,
  target_claim_id uuid REFERENCES public.resume_claims(id) ON DELETE SET NULL,
  depth_level integer NOT NULL DEFAULT 1,
  sequence_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.interview_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  transcript text NOT NULL,
  response_duration integer,
  answer_quality jsonb,
  evidence jsonb,
  follow_up_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id)
);
CREATE TABLE public.interview_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES public.resume_claims(id) ON DELETE SET NULL,
  skill text,
  project text,
  evidence text NOT NULL,
  evidence_strength text NOT NULL,
  source_question_id uuid REFERENCES public.interview_questions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.interview_claim_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.resume_claims(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Requires further verification',
  confidence integer NOT NULL DEFAULT 0,
  unanswered jsonb NOT NULL DEFAULT '[]'::jsonb,
  contradictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interview_id, claim_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['interview_blueprints','interview_questions','interview_answers','interview_evidence','interview_claim_status'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "own interview rows" ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = %I.interview_id AND i.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = %I.interview_id AND i.user_id = auth.uid()))', t, t, t);
    EXECUTE format('CREATE INDEX ON public.%I(interview_id)', t);
  END LOOP;
END $$;