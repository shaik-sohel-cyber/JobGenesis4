CREATE TABLE public.ai_capacity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  key_label text NOT NULL,
  model text NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  observed_limit integer,
  benched_until timestamptz,
  bench_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, key_label, model)
);

GRANT SELECT ON public.ai_capacity TO authenticated;
GRANT ALL ON public.ai_capacity TO service_role;

ALTER TABLE public.ai_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read ai capacity"
ON public.ai_capacity FOR SELECT TO authenticated
USING (true);