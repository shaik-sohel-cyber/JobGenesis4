# JobGenesis fresh Supabase setup proposal

**Status: review only — not approved or verified safe to execute.** No
database connection or SQL execution was performed. The target reference
provided by the user is `pxclqsjzoljgjohphzmx`; confirm it in the Supabase
Dashboard before any work. The repository's `supabase/config.toml` contains
a different project reference.

## Source order and consolidation

The source migrations have this dependency-consistent order:

1. `supabase/migrations/20260928062636_79b10f12-8ac0-4be8-8818-1f73a2bfa96f.sql`
2. `supabase/migrations/20260928062707_43e3f692-1cab-4430-bce9-83bde0d15a9d.sql`
3. `supabase/migrations/20260928071657_445ba0a5-f56e-41cf-bf24-d76def1d4a1e.sql`
4. `supabase/migrations/20260930060838_41e45e98-e2b4-432b-bac7-d7f89141e80f.sql`
5. `supabase/migrations/20261002052056_62cb9fd2-4ec8-4341-9007-7356f17eea8d.sql`
6. `drizzle/migrations/0000_create_interview_reports.sql`
7. `drizzle/migrations/0001_add_ai_capacity_tracking.sql`
8. `drizzle/migrations/0002_user_roles.sql`
9. `drizzle/migrations/0003_role_context_and_integrity.sql`
10. `drizzle/migrations/0004_shareable_report_token.sql`

`supabase/migrations-review/INITIAL_SETUP_PROPOSAL.sql` consolidates the
final schema represented by these files. It avoids the temporary
`owns_resume(UUID)` helper lifecycle from the first two Supabase migrations
by defining the final resume-child policies directly. It is intentionally a
proposal, not a generated migration in the normal migration directory.

The Supabase series establishes profiles/resumes and interview tables; the
Drizzle series depends on those objects (`interview_reports` requires
`interviews`, `0003` alters `interviews`, and `0004` alters
`interview_reports`). The two directories are separate migration histories,
so this order is a fresh-schema proposal, not evidence of the source
project's applied migration history.

## Security decisions and unresolved reviews

- `drizzle/migrations/0004_shareable_report_token.sql` creates an anonymous
  `SELECT` policy based only on `shared = true` and grants `anon` table
  `SELECT`. It does **not** enforce `share_token`. Rows contain full report
  JSON and can include transcripts, candidate/resume information, claims,
  evidence, and interview details.
- The current share page at `src/routes/share/report.$token.tsx` calls
  `getSharedReport` in `src/lib/report.functions.ts`. The TanStack Start
  server function uses the server-only Supabase admin client to query reports
  requiring `shared = true`, `status = 'ready'`, and an exact `share_token`
  match. It constructs an explicit allowlist of sanitized public fields and
  does not return the full report row or private JSON. The application code
  has had static review only; build and runtime verification remain
  outstanding.
- The proposal includes `shared`, `share_token`, and its partial index, but
  intentionally omits anonymous table `SELECT` and the anon grant.
  Anonymous direct reads of `interview_reports` remain disabled; public
  sharing is served only through the token-validating server function. Do
  not restore the source migration's broad public policy. Verify the
  application path with build and runtime tests before deployment.
- The source migration `drizzle/migrations/0002_user_roles.sql` defines
  `public.has_role`, but the application has no runtime callers. The fresh
  setup proposal omits this unused function. The admin server function checks
  `user_roles` directly for the server-verified authenticated user's ID; the
  proposal retains the `app_role` enum, `user_roles` table, own-row SELECT
  policy, and current grants, without granting client-side role assignment.
- After Supabase authentication is configured, the first admin role must be
  provisioned through a trusted administrative process. Do not expose a
  client-side role assignment path or allow users to self-promote.
- `src/lib/admin.functions.ts` currently treats a failed `user_roles` query
  like a missing admin row because it does not inspect the Supabase `error`.
  This fails closed, but explicit error handling would improve diagnostics
  by distinguishing query/configuration failures from an authenticated
  non-admin. Application code is unchanged in this proposal-only update.
- Resume uploads use a fresh UUID in each object path and no longer send
  `x-upsert: true`; the normal upload path therefore uses INSERT rather than
  overwrite. The Storage policies grant `SELECT`, `INSERT`, and `DELETE`
  only—not `UPDATE`. If overwrite behavior is added later, verify Storage's
  policy requirements and consider only a narrowly owner-scoped `UPDATE`
  policy.

## Storage setup — separate manual step

The source SQL adds policies on the Supabase-managed `storage.objects`
table. It does **not** create the bucket. Before uploads, create a bucket
named `resumes` in the verified target project's Storage Dashboard and set
**Public bucket = off** (private). Then apply/review the three policies in
the proposal:

- authenticated users may read objects only in their own user-ID folder;
- authenticated users may insert objects only in their own user-ID folder;
- authenticated users may delete objects only in their own user-ID folder.

The app uploads paths beginning with the authenticated user's ID and later
downloads via Supabase Storage. Verify the bucket's file-size and MIME
settings match the app's accepted files and 10 MB upload limit.

## Fresh-project assumptions and manual configuration

The SQL assumes standard Supabase-managed schemas, tables, functions, and
roles exist: `auth.users`, `auth.uid()`, `storage.objects`,
`storage.foldername(...)`, `authenticated`, `anon`, and `service_role`.
It does not provision Google OAuth, email/SMTP settings, Auth redirect
allowlists/site URL, API keys, Edge Functions, or deployment environment
variables.

Before treating this as runnable:

1. Verify the target reference and inspect the target project's table list,
   migration history, Auth users, Storage buckets, and policies. Do not
   infer emptiness from the URL. These statements are mostly not idempotent;
   existing objects can make them fail or change security behavior.
2. Confirm the new target is genuinely fresh, or stop and reconcile its
   current schema rather than using this fresh setup script.
3. Review the report-sharing design above and determine the trusted process
   for provisioning the first admin after authentication is configured.
4. Create and verify the private `resumes` bucket separately.
5. Confirm Google provider credentials and redirect settings in Supabase
   Auth/Google Cloud and configure app environment variables separately.
6. Back up any existing target data before any later execution and test on
   a disposable staging project first.

No claim is made that this SQL has been executed, validated against the live
project, or is safe to run.
