-- Opt-in public sharing of interview reports.
-- A report is only publicly readable when its owner turns sharing on;
-- the unguessable share_token identifies it on the public page.
alter table public.interview_reports
  add column if not exists shared boolean not null default false,
  add column if not exists share_token uuid;

create index if not exists interview_reports_share_token_idx
  on public.interview_reports (share_token)
  where shared = true;

drop policy if exists "Shared reports are publicly readable" on public.interview_reports;
create policy "Shared reports are publicly readable"
  on public.interview_reports
  for select
  to anon
  using (shared = true);

grant select on public.interview_reports to anon;
