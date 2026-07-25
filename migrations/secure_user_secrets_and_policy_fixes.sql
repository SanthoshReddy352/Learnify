-- ============================================================
-- Phase 0 security migration (2026-07-22 audit)
-- Applied to production 2026-07-22 via Supabase MCP.
-- 1) Move plaintext AI API keys out of publicly-readable profiles
-- 2) Fix broken classroom-invite RLS policy (self-join typo)
-- 3) Lock down handle_new_user RPC exposure
-- 4) Pin search_path on flagged functions
-- 5) Remove public listing policy on topic-images bucket
-- ============================================================

-- 1) Owner-only secrets table
create table if not exists public.user_secrets (
  id uuid primary key references auth.users(id) on delete cascade,
  gemini_api_key text,
  huggingface_api_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_secrets enable row level security;

drop policy if exists "Users can view own secrets" on public.user_secrets;
create policy "Users can view own secrets"
  on public.user_secrets for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own secrets" on public.user_secrets;
create policy "Users can insert own secrets"
  on public.user_secrets for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own secrets" on public.user_secrets;
create policy "Users can update own secrets"
  on public.user_secrets for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can delete own secrets" on public.user_secrets;
create policy "Users can delete own secrets"
  on public.user_secrets for delete
  using (auth.uid() = id);

-- Migrate existing keys, then drop the exposed columns
insert into public.user_secrets (id, gemini_api_key, huggingface_api_key)
select id, gemini_api_key, huggingface_api_key
from public.profiles
where gemini_api_key is not null or huggingface_api_key is not null
on conflict (id) do update
  set gemini_api_key = excluded.gemini_api_key,
      huggingface_api_key = excluded.huggingface_api_key;

alter table public.profiles drop column if exists gemini_api_key;
alter table public.profiles drop column if exists huggingface_api_key;

-- 2) Fix invite policy: was comparing classroom_invites.classroom_id to its own id
drop policy if exists "Invitees can view pending classrooms" on public.classrooms;
create policy "Invitees can view pending classrooms"
  on public.classrooms for select
  using (
    exists (
      select 1
      from public.classroom_invites
      where classroom_invites.classroom_id = classrooms.id
        and lower(classroom_invites.email) = auth_email()
        and classroom_invites.status = 'pending'
        and classroom_invites.expires_at > now()
    )
  );

-- 3) handle_new_user is a trigger function; it must not be a public RPC.
--    (Auth trigger execution is unaffected: it runs under the definer/admin role.)
revoke execute on function public.handle_new_user() from anon, authenticated;

-- NOTE: auth_email(), is_teacher(), is_classroom_student(uuid), is_classroom_teacher(uuid)
-- intentionally remain executable: they are invoked inside RLS policies under the
-- querying role (including anon for public subject/topic reads) and only reveal
-- the caller's own auth context.

-- 4) Pin search_path on functions flagged by the linter
alter function public.update_updated_at_column() set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;

-- 5) Public bucket: object URLs don't need a SELECT policy; listing does. Remove listing.
drop policy if exists "Public Access" on storage.objects;

-- Follow-up (same day): the execute grant on handle_new_user was inherited via
-- PUBLIC, so the role-specific revoke above was not sufficient.
revoke execute on function public.handle_new_user() from public;
