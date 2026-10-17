-- Untested, transaction-wrapped execution copy for target project pxclqsjzoljgjohphzmx.
-- Use only after independently verifying the target project; this is not a tested migration.

BEGIN;

-- JobGenesis consolidated fresh-project schema proposal.
--
-- TARGET PROJECT REFERENCE: pxclqsjzoljgjohphzmx
--
-- STATUS: REVIEW ONLY. Do not execute until the target project is verified
-- empty, all manual prerequisites below are met, and every security gate in
-- supabase/migrations-review/REVIEW.md has been resolved.
--
-- This is a consolidated final schema derived from the ten checked-in
-- migrations. It is not a data migration and does not create Auth users,
-- move existing records, create the resumes bucket, configure Google OAuth,
-- or grant anonymous direct access to interview_reports. Public report
-- sharing is handled by the application server function described below.
--
-- The application server function uses the server-only Supabase admin
-- client, requires shared = true, status = 'ready', and an exact share_token
-- match, then returns an explicit allowlist of sanitized public fields.
-- Anonymous direct SELECT access to interview_reports remains disabled.
-- This application path has had static review only; build and runtime
-- verification remain outstanding. See REVIEW.md.

-- 1. Profiles, resumes, resume analysis tables, and updated-at/profile hooks

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile"
  ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  stage TEXT,
  error_message TEXT,
  raw_text TEXT,
  parsed_profile JSONB,
  analysis_version TEXT NOT NULL DEFAULT 'v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX resumes_user_id_idx ON public.resumes (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own resumes"
  ON public.resumes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER resumes_updated_at
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.resume_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  proficiency_claim TEXT,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.resume_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  technologies JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsibilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
  claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.resume_experience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  employment_type TEXT,
  start_date TEXT,
  end_date TEXT,
  description TEXT,
  technologies JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsibilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.resume_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  institution TEXT NOT NULL,
  degree TEXT,
  field TEXT,
  start_date TEXT,
  end_date TEXT,
  grade TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.resume_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuer TEXT,
  date TEXT,
  credential_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.resume_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.resume_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  claim TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  related_skill TEXT,
  related_project TEXT,
  evidence TEXT,
  verification_priority TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'resume_skills',
    'resume_projects',
    'resume_experience',
    'resume_education',
    'resume_certifications',
    'resume_achievements',
    'resume_claims'
  ]
  LOOP
    EXECUTE format('CREATE INDEX %I ON public.%I (resume_id)', t || '_resume_id_idx', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "own resume rows" ON public.%I FOR ALL TO authenticated
       USING (EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = %I.resume_id AND r.user_id = auth.uid()))
       WITH CHECK (EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = %I.resume_id AND r.user_id = auth.uid()))',
      t, t, t
    );
  END LOOP;
END;
$$;

-- The Storage service/schema and storage.objects are Supabase-managed.
-- The bucket itself is created separately in the Dashboard; see REVIEW.md.
CREATE POLICY "read own resume files"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'resumes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "upload own resume files"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "delete own resume files"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'resumes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Final state of source migration 20260928062707: the temporary
-- owns_resume(UUID) helper has been removed and these privileges revoked.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- 2. Interview core tables

CREATE TABLE public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'created',
  mode TEXT NOT NULL DEFAULT 'mixed',
  current_stage TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own interviews"
  ON public.interviews
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.resumes r
      WHERE r.id = resume_id AND r.user_id = auth.uid()
    )
  );

CREATE TRIGGER interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX interviews_user_id_idx ON public.interviews (user_id);

CREATE TABLE public.interview_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  objective TEXT NOT NULL,
  target_skill TEXT,
  target_claim_id UUID REFERENCES public.resume_claims(id) ON DELETE SET NULL,
  target_project TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  order_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  blueprint_id UUID REFERENCES public.interview_blueprints(id) ON DELETE SET NULL,
  parent_question_id UUID REFERENCES public.interview_questions(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  objective TEXT,
  target_skill TEXT,
  target_claim_id UUID REFERENCES public.resume_claims(id) ON DELETE SET NULL,
  depth_level INTEGER NOT NULL DEFAULT 1,
  sequence_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.interview_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  transcript TEXT NOT NULL,
  response_duration INTEGER,
  answer_quality JSONB,
  evidence JSONB,
  follow_up_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id)
);

CREATE TABLE public.interview_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES public.resume_claims(id) ON DELETE SET NULL,
  skill TEXT,
  project TEXT,
  evidence TEXT NOT NULL,
  evidence_strength TEXT NOT NULL,
  source_question_id UUID REFERENCES public.interview_questions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.interview_claim_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.resume_claims(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Requires further verification',
  confidence INTEGER NOT NULL DEFAULT 0,
  unanswered JSONB NOT NULL DEFAULT '[]'::jsonb,
  contradictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interview_id, claim_id)
);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'interview_blueprints',
    'interview_questions',
    'interview_answers',
    'interview_evidence',
    'interview_claim_status'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "own interview rows" ON public.%I FOR ALL TO authenticated
       USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = %I.interview_id AND i.user_id = auth.uid()))
       WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = %I.interview_id AND i.user_id = auth.uid()))',
      t, t, t
    );
    EXECUTE format('CREATE INDEX ON public.%I (interview_id)', t);
  END LOOP;
END;
$$;

-- 3. Interview session handshake and answer idempotency

ALTER TABLE public.interviews
  ADD COLUMN session_state TEXT NOT NULL DEFAULT 'PREPARING',
  ADD COLUMN session_updated_at TIMESTAMPTZ;

ALTER TABLE public.interview_answers
  ADD COLUMN client_turn_id TEXT;

CREATE UNIQUE INDEX interview_answers_client_turn_uidx
  ON public.interview_answers (interview_id, client_turn_id)
  WHERE client_turn_id IS NOT NULL;

-- 4. Optional camera event recording

ALTER TABLE public.interviews
  ADD COLUMN camera_consent TEXT,
  ADD COLUMN camera_state TEXT;

CREATE TABLE public.interview_visual_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.interview_questions(id) ON DELETE SET NULL,
  client_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  confidence REAL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interview_id, client_event_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_visual_events TO authenticated;
GRANT ALL ON public.interview_visual_events TO service_role;
ALTER TABLE public.interview_visual_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own interview rows"
  ON public.interview_visual_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id AND i.user_id = auth.uid()
    )
  );

CREATE INDEX interview_visual_events_interview_id_started_at_idx
  ON public.interview_visual_events (interview_id, started_at);

CREATE TABLE public.interview_visual_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interview_id, question_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_visual_summaries TO authenticated;
GRANT ALL ON public.interview_visual_summaries TO service_role;
ALTER TABLE public.interview_visual_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own interview rows"
  ON public.interview_visual_summaries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id AND i.user_id = auth.uid()
    )
  );

CREATE TRIGGER interview_visual_summaries_updated_at
  BEFORE UPDATE ON public.interview_visual_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Interview reports (private owner-only access by default)

CREATE TABLE public.interview_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL UNIQUE REFERENCES public.interviews(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  summary JSONB,
  data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_reports TO authenticated;
GRANT ALL ON public.interview_reports TO service_role;
ALTER TABLE public.interview_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own interview reports"
  ON public.interview_reports
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id AND i.user_id = auth.uid()
    )
  );

CREATE TRIGGER interview_reports_updated_at
  BEFORE UPDATE ON public.interview_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Source migration 0004's shared/share_token fields and lookup index are
-- included so the owner sharing controls can store/revoke share tokens.
ALTER TABLE public.interview_reports
  ADD COLUMN shared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN share_token UUID;

CREATE INDEX interview_reports_share_token_idx
  ON public.interview_reports (share_token)
  WHERE shared = true;

-- SECURITY GATE: intentionally do not create an anon SELECT policy or grant.
-- getSharedReport uses the server-only Supabase admin client and requires
-- shared = true, status = 'ready', and an exact share_token match, returning
-- only an explicit sanitized public-field allowlist. The source migration's
-- broad shared=true policy exposes full private report rows; do not copy it.
REVOKE ALL ON TABLE public.interview_reports FROM PUBLIC, anon;

-- 6. AI capacity accounting

CREATE TABLE public.ai_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  key_label TEXT NOT NULL,
  model TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  observed_limit INTEGER,
  benched_until TIMESTAMPTZ,
  bench_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (day, key_label, model)
);

GRANT SELECT ON public.ai_capacity TO authenticated;
GRANT ALL ON public.ai_capacity TO service_role;
ALTER TABLE public.ai_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read ai capacity"
  ON public.ai_capacity
  FOR SELECT TO authenticated
  USING (true);

-- 7. Admin roles

CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own roles"
  ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 8. Role context and integrity event logging

ALTER TABLE public.interviews
  ADD COLUMN target_role TEXT,
  ADD COLUMN job_description TEXT,
  ADD COLUMN required_skills TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE public.interview_integrity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  client_event_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  question_id UUID REFERENCES public.interview_questions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interview_id, client_event_id)
);

CREATE INDEX interview_integrity_events_interview_id_idx
  ON public.interview_integrity_events (interview_id);

GRANT SELECT, INSERT ON public.interview_integrity_events TO authenticated;
GRANT ALL ON public.interview_integrity_events TO service_role;
ALTER TABLE public.interview_integrity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read integrity events"
  ON public.interview_integrity_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners add integrity events while live"
  ON public.interview_integrity_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id
        AND i.user_id = auth.uid()
        AND i.session_state = 'INTERVIEW_ACTIVE'
    )
  );

-- End of proposed consolidated schema.
-- This does not create the resumes bucket or configure Auth/OAuth/dashboard
-- settings. See supabase/migrations-review/REVIEW.md.

COMMIT;
