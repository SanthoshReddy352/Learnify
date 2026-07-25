-- Review reminders + engagement preferences (Plan P11).
--
-- Spaced repetition is inert until something pulls the learner back on the day a
-- review comes due. This adds the two things the sender needs: where to deliver
-- (push_subscriptions) and when/whether the learner wants it
-- (notification_preferences, which also holds the P11.2 weekly goal target).
--
-- DEFERRED to P14 (see standing constraint). Every code path that touches these
-- tables is behind REVIEW_REMINDERS=true and fails soft, so their absence
-- changes nothing until the migration is applied.

-- ---------------------------------------------------------------------------
-- notification_preferences: one row per learner, owner-writable.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Master switch for due-review reminders.
  review_reminders boolean not null default true,
  -- Per-channel switches. Push additionally requires at least one row in
  -- push_subscriptions; email requires a configured mail sender on the server.
  push_enabled boolean not null default true,
  email_enabled boolean not null default false,
  -- Hour of the learner's OWN local day to deliver at (0-23). The sender runs
  -- hourly in UTC and resolves each user's local hour from `timezone`, so a
  -- reminder never arrives in the middle of someone's night.
  reminder_hour smallint not null default 18 check (reminder_hour between 0 and 23),
  -- IANA zone name, e.g. 'Asia/Kolkata'. Captured from the browser.
  timezone text not null default 'UTC',
  -- P11.2: reviews the learner is aiming to complete per week. A target, not a
  -- quota — nothing is withheld for missing it.
  weekly_review_goal smallint not null default 15
    check (weekly_review_goal between 1 and 500),
  -- Send bookkeeping, in the learner's LOCAL calendar date, so "at most one
  -- reminder a day" means one per day where they live. Written only by the
  -- sender (service role); the preferences API deliberately does not accept it
  -- from the client, so a learner cannot clear it to re-trigger sends.
  last_reminder_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reuse the existing shared trigger (search_path pinned in Phase 0.6).
drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.update_updated_at_column();

alter table public.notification_preferences enable row level security;

-- Owner-writable, like user_concept_state: these are the learner's own
-- preferences and they gate nothing that has to be trustworthy.
drop policy if exists "Users read own notification preferences" on public.notification_preferences;
create policy "Users read own notification preferences"
  on public.notification_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own notification preferences" on public.notification_preferences;
create policy "Users insert own notification preferences"
  on public.notification_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own notification preferences" on public.notification_preferences;
create policy "Users update own notification preferences"
  on public.notification_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- push_subscriptions: Web Push endpoints, one row per browser/device.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The push service URL. Globally unique: one physical browser has exactly one
  -- endpoint, and if a different account signs in on that browser the row is
  -- reassigned rather than duplicated (see app/api/notifications/subscribe).
  endpoint text not null unique,
  -- Client public key + auth secret from the PushSubscription. Required to
  -- encrypt the payload; useless without the server's VAPID private key.
  p256dh text not null,
  auth text not null,
  platform text not null default 'web' check (platform in ('web', 'android')),
  user_agent text,
  -- Consecutive delivery failures. The sender prunes a subscription once the
  -- push service reports it permanently gone (404/410).
  failure_count integer not null default 0 check (failure_count >= 0),
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Read + delete for the owner (so a learner can see and revoke their own
-- devices); INSERT/UPDATE are service-role only, like generation_jobs. The
-- subscribe route authorizes with the user's client and then writes with the
-- admin client, because reassigning an endpoint from a previous account on a
-- shared browser touches a row the new user does not yet own.
drop policy if exists "Users read own push subscriptions" on public.push_subscriptions;
create policy "Users read own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Users delete own push subscriptions" on public.push_subscriptions;
create policy "Users delete own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
