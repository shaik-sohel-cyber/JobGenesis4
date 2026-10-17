# Admin Dashboard — users, sign-ins, AI capacity

A private `/admin` page only your account can open, showing every registered user with their last sign-in, plus the Gemini key-pool capacity.

## What you'll see at /admin
- **Users & sign-ins**: every registered account — name, email, sign-up date, last sign-in time.
- **AI capacity**: the existing 6-key pool status (requests used today, benched keys, interviews remaining), reusing the same data the settings page card shows.
- Anyone else who visits `/admin` (even signed in) sees a "not authorized" page. No admin link appears in the normal app; you reach it by typing the address.

## Your admin account
You send me the email + password you want. I create the account, mark it as admin in the database, and confirm it works. Regular visitors can never make themselves admin — the flag lives in a separate roles table that only the backend can write.

## Technical details
- **Migration**: `app_role` enum (`admin`, `user`), `public.user_roles` table (user_id + role, unique), GRANTs (select to authenticated, all to service_role), RLS enabled with one policy — users can read only their own role rows. A `has_role(user_id, role)` SECURITY DEFINER function for server-side checks.
- **Server functions** (`src/lib/admin.functions.ts`): `getAdminOverview` — `requireSupabaseAuth`, verifies the caller has the admin role through `context.supabase` (never client-side flags), then loads `supabaseAdmin` inside the handler to call the Auth Admin API (`listUsers` for email/created/last_sign_in) and join `profiles` for names. AI capacity reuses the existing `getCapacity` path (`ai_capacity` is already readable by signed-in users).
- **Route**: `src/routes/_authenticated/admin.tsx` — sign-in gate comes free from the existing `_authenticated` layout; the loader calls `getAdminOverview` and non-admins get a friendly "admins only" screen. Head metadata with `noindex`.
- **Account setup**: after you send credentials, I sign the account up through the app's own signup flow, then insert its `user_roles` row (`role = 'admin'`) with one SQL statement. The password is used once and never stored or repeated.

## Verification
Sign in as the new admin, open `/admin`, confirm the user list shows real accounts with last sign-in times and the capacity numbers match the settings card. Then sign in as a normal test account and confirm `/admin` refuses access.
