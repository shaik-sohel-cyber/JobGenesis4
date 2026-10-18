CREATE TABLE public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feature text NOT NULL CHECK (feature IN ('resume_analysis', 'ai_interview', 'interview_report', 'other')),
  category text NOT NULL CHECK (category IN ('general', 'bug', 'feature_request', 'performance_voice')),
  message text NOT NULL CHECK (
    char_length(regexp_replace(message, '^[[:space:]]+|[[:space:]]+$', '', 'g')) BETWEEN 10 AND 3000
  ),
  contact_email text CHECK (
    contact_email IS NULL OR (
      char_length(contact_email) BETWEEN 3 AND 254 AND
      contact_email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9-]+([.][A-Z0-9-]+)+$'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.feedback_submissions FROM anon, authenticated;
GRANT INSERT ON public.feedback_submissions TO authenticated;
REVOKE ALL ON public.feedback_submissions FROM service_role;
GRANT SELECT ON public.feedback_submissions TO service_role;

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users may submit feedback as themselves"
  ON public.feedback_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX feedback_submissions_created_at_idx
  ON public.feedback_submissions (created_at DESC);
