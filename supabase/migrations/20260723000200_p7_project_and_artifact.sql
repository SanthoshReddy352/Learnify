-- P7.3 / P7.4 storage.
--
-- project_track: a scaffolded project-based learning track for a subject (P7.4).
-- artifact: a self-contained interactive widget for a topic, rendered in a
--           sandboxed iframe (P7.3).
-- Both inherit existing RLS on their tables.
--
-- DEFERRED to P14 (standing constraint). Code writes these columns only behind
-- CONTENT_PROJECT / CONTENT_ARTIFACT flags, so they stay dormant until applied.

alter table public.subjects
  add column if not exists project_track jsonb;

alter table public.topics
  add column if not exists artifact jsonb;
