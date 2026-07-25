-- Concept ledger column (Plan P6.5).
--
-- A compact per-topic subject-memory record extracted after generation
-- ({ summary, concepts_introduced, terms_defined, notation_introduced,
-- prerequisites_used }). Read back into DAG-neighbor continuity context (P6.3)
-- so a topic references what earlier topics actually taught instead of the raw
-- description. Inherits the existing `topics` RLS policies.
--
-- DEFERRED to P14 (see standing constraint) — the code writes/reads this column
-- only behind CONTENT_LEDGER=true, so it stays dormant until this is applied.

alter table public.topics
  add column if not exists concept_ledger jsonb;
