-- Applied to production 2026-07-22 via Supabase MCP.
-- Per-user AI provider configuration (BYOK for all providers, not just Gemini).
-- user_secrets already has owner-only RLS; these columns inherit it.
alter table public.user_secrets
  add column if not exists anthropic_api_key text,
  add column if not exists openai_compat_base_url text,
  add column if not exists openai_compat_api_key text,
  add column if not exists openai_compat_models text;

comment on table public.user_secrets is
  'Per-user AI provider credentials (owner-only RLS). User-configured providers take priority over server env providers.';
