-- ---------------------------------------------------------------------------
-- 0009  Content Management, T&C acceptance, and feature flags.
--
-- The PRD only requires T&C updates. The prototype's Content Management
-- screen also covers Privacy Policy, Help, About and Contact, so this is
-- modelled as a general content_pages table — flagged as expanded scope in
-- the Phase 1 report.
-- ---------------------------------------------------------------------------

create table if not exists public.content_pages (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique
               check (slug in ('terms', 'privacy', 'help', 'about', 'contact')),
  title      text not null check (length(btrim(title)) > 0),
  version    integer not null default 1 check (version > 0),
  body       text not null default '',
  status     text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_pages_status_idx on public.content_pages (status);

drop trigger if exists content_pages_set_updated_at on public.content_pages;
create trigger content_pages_set_updated_at
  before update on public.content_pages
  for each row execute function public.set_updated_at();

-- accepted_version is denormalised on purpose. content_pages.slug is unique
-- (per the spec), so a page is edited in place and its version number is
-- bumped; without capturing the version at acceptance time, "which text did
-- this user actually agree to" would be unanswerable after the next edit.
create table if not exists public.user_terms_acceptance (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  content_id       uuid not null references public.content_pages (id) on delete cascade,
  accepted_version integer not null check (accepted_version > 0),
  accepted_at      timestamptz not null default now(),
  constraint user_terms_acceptance_user_content_version_key
    unique (user_id, content_id, accepted_version)
);

create index if not exists user_terms_acceptance_user_idx
  on public.user_terms_acceptance (user_id, accepted_at desc);

-- Single flag table. Financial Health Score (PRD 6.10) is DEFERRED: no
-- scoring engine, no factors, no weightings — just a switch the Phase 2 UI
-- reads to decide whether to render the "Coming Soon" placeholder.
create table if not exists public.feature_flags (
  key         text primary key,
  enabled     boolean not null default false,
  description text,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ RLS ----
alter table public.content_pages         enable row level security;
alter table public.user_terms_acceptance enable row level security;
alter table public.feature_flags         enable row level security;

-- Published pages are readable by any authenticated user — they need the live
-- T&C and Privacy text. Drafts and every write are admin-only.
drop policy if exists content_pages_select_published on public.content_pages;
create policy content_pages_select_published on public.content_pages
  for select to authenticated using (status = 'published');

drop policy if exists content_pages_select_admin on public.content_pages;
create policy content_pages_select_admin on public.content_pages
  for select to authenticated using (public.is_super_admin());

drop policy if exists content_pages_insert_admin on public.content_pages;
create policy content_pages_insert_admin on public.content_pages
  for insert to authenticated with check (public.is_super_admin());

drop policy if exists content_pages_update_admin on public.content_pages;
create policy content_pages_update_admin on public.content_pages
  for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists content_pages_delete_admin on public.content_pages;
create policy content_pages_delete_admin on public.content_pages
  for delete to authenticated using (public.is_super_admin());

-- An acceptance is a historical fact: insert once, never edit or remove.
drop policy if exists user_terms_acceptance_select_own on public.user_terms_acceptance;
create policy user_terms_acceptance_select_own on public.user_terms_acceptance
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists user_terms_acceptance_select_admin on public.user_terms_acceptance;
create policy user_terms_acceptance_select_admin on public.user_terms_acceptance
  for select to authenticated using (public.is_super_admin());

drop policy if exists user_terms_acceptance_insert_own on public.user_terms_acceptance;
create policy user_terms_acceptance_insert_own on public.user_terms_acceptance
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_account_active());

-- Flags are read by everyone, written by admins.
drop policy if exists feature_flags_select_all on public.feature_flags;
create policy feature_flags_select_all on public.feature_flags
  for select to authenticated using (true);

drop policy if exists feature_flags_write_admin on public.feature_flags;
create policy feature_flags_write_admin on public.feature_flags
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

insert into public.feature_flags (key, enabled, description) values
  ('financial_health_score', false,
   'PRD 6.10 is deferred. While false the UI shows a Coming Soon placeholder. No scoring schema exists in Phase 1.')
on conflict (key) do nothing;

insert into public.content_pages (slug, title, version, body, status, published_at) values
  ('terms',   'Terms & Conditions', 1, 'Placeholder. Replace via Content Management before launch.', 'published', now()),
  ('privacy', 'Privacy Policy',     1, 'Placeholder. Replace via Content Management before launch.', 'published', now()),
  ('help',    'Help',               1, 'Placeholder. Replace via Content Management before launch.', 'draft',     null),
  ('about',   'About Monetiq',      1, 'Placeholder. Replace via Content Management before launch.', 'draft',     null),
  ('contact', 'Contact',            1, 'Placeholder. Replace via Content Management before launch.', 'draft',     null)
on conflict (slug) do nothing;

comment on policy feature_flags_select_all on public.feature_flags is
  'Intentional readable-by-all-authenticated: a flag is non-sensitive UI configuration that every signed-in client must read to render correctly. This is the only USING (true) policy in the schema.';
