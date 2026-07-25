-- Repair migration for any database that ran 20260723000400_assessment.sql in
-- its original form.
--
-- That migration ended with:
--   revoke select (correct_index, answer_key) on public.assessment_items
--     from anon, authenticated;
--
-- which reports success and has no effect. Supabase grants TABLE-level SELECT on
-- new public tables to anon and authenticated by default, and in Postgres a
-- table-level privilege is not a collection of column privileges you can
-- subtract from — it continues to cover every column, including the ones just
-- "revoked". The answer keys stayed readable by any logged-in user.
--
-- Caught by the verification query in the P14 runbook when it was run against
-- production on 2026-07-25, which is exactly why that check is in the runbook.
--
-- Idempotent: safe to run on a database that already has the corrected form.

revoke select on public.assessment_items from anon, authenticated;

grant select (
  id, subject_id, topic_id, concept, concept_key,
  kind, difficulty, stem, options, created_at, updated_at
) on public.assessment_items to anon, authenticated;
