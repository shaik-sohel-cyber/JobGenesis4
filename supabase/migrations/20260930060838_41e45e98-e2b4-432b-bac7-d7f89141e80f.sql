ALTER TABLE public.interviews ADD COLUMN session_state text NOT NULL DEFAULT 'PREPARING',
  ADD COLUMN session_updated_at timestamptz;
ALTER TABLE public.interview_answers ADD COLUMN client_turn_id text;
CREATE UNIQUE INDEX interview_answers_client_turn_uidx ON public.interview_answers(interview_id, client_turn_id) WHERE client_turn_id IS NOT NULL;