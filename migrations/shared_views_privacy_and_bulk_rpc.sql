-- ============================================================
-- Applied to production 2026-07-22 via Supabase MCP.
--
-- 1) PRIVACY FIX: public/community sharing must not expose the
--    author's learning progress or private notes.
--
--    Before: "Users can view public topics" RLS policy exposed ALL
--    topic columns (status, SM-2 fields, next_review_at, user_notes)
--    of public subjects to any client via PostgREST.
--
--    After: that policy is gone. Public consumption goes through
--    sanitized security-definer views that expose only the shared
--    material (title/description/content/flashcards/difficulty/minutes).
-- ============================================================

drop policy if exists "Users can view public topics" on public.topics;

create or replace view public.shared_topics
with (security_invoker = false) as
select
  t.id,
  t.subject_id,
  t.title,
  t.description,
  t.content,
  t.flashcards,
  t.estimated_minutes,
  t.difficulty,
  t.created_at
from public.topics t
join public.subjects s on s.id = t.subject_id
where s.is_public = true;

comment on view public.shared_topics is
  'Sanitized public view of topics belonging to public subjects. Deliberately excludes author progress (status, SM-2 fields, next_review_at) and private user_notes. Security definer: the WHERE is_public clause is the access gate.';

grant select on public.shared_topics to anon, authenticated;

-- Topic counts for community listings (replaces the topics(count) embed,
-- which stops working for non-owners once the policy above is dropped).
create or replace view public.shared_subject_stats
with (security_invoker = false) as
select s.id as subject_id, count(t.id)::int as topic_count
from public.subjects s
left join public.topics t on t.subject_id = s.id
where s.is_public = true
group by s.id;

comment on view public.shared_subject_stats is
  'Topic counts for public subjects, for community listings.';

grant select on public.shared_subject_stats to anon, authenticated;

-- ============================================================
-- 2) Bulk status update RPC for the unlock engine (Phase 2.2).
--    SECURITY INVOKER: RLS update policies still apply row-by-row,
--    so callers can only update topics they own. The topics.status
--    CHECK constraint rejects invalid statuses.
-- ============================================================

create or replace function public.apply_topic_status_updates(p_updates jsonb)
returns integer
language sql
security invoker
set search_path = public, pg_temp
as $$
  with u as (
    select (e->>'id')::uuid as id, e->>'status' as status
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) e
  ),
  upd as (
    update public.topics t
    set status = u.status
    from u
    where t.id = u.id
      and t.status is distinct from u.status
    returning 1
  )
  select coalesce(count(*), 0)::int from upd;
$$;

revoke execute on function public.apply_topic_status_updates(jsonb) from public, anon;
grant execute on function public.apply_topic_status_updates(jsonb) to authenticated, service_role;
