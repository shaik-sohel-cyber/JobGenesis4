
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['resume_skills','resume_projects','resume_experience','resume_education','resume_certifications','resume_achievements','resume_claims']
  LOOP
    EXECUTE format('DROP POLICY "own resume rows" ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "own resume rows" ON public.%I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = %I.resume_id AND r.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = %I.resume_id AND r.user_id = auth.uid()))$f$, t, t, t);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.owns_resume(UUID);

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
