-- db/migrations/001_init.sql
-- Atlas: schema for the AI Career Agent, Email Studio and campaign engine.
-- Plain SQL on purpose: runs unchanged on Neon, any Postgres, and PGlite (tests).

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- AES-256-GCM ciphertext only (API keys, admin password hash). Never plaintext.
create table secrets (
  name text primary key,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

create table profile (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table documents (
  id bigserial primary key,
  kind text not null check (kind in ('cv', 'other')),
  filename text not null,
  mime text not null,
  size int not null,
  sha256 text not null,
  content bytea not null,
  source text not null check (source in ('upload', 'sync')),
  source_url text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index documents_one_default_cv on documents (kind) where is_default and kind = 'cv';

create table gmail_account (
  id int primary key default 1 check (id = 1),
  email text not null,
  refresh_token_enc text not null,
  access_token_enc text,
  access_expires_at timestamptz,
  scopes text,
  status text not null default 'connected' check (status in ('connected', 'reauth_required')),
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table companies (
  id bigserial primary key,
  name text not null,
  name_key text not null unique,
  website text,
  domain text,
  industry text,
  location text,
  description text,
  remote boolean,
  source text not null,
  source_url text,
  status text not null default 'discovered' check (status in (
    'discovered', 'researched', 'ready_for_outreach', 'email_sent', 'replied',
    'interested', 'rejected', 'no_response', 'do_not_contact'
  )),
  notes text,
  roles jsonb not null default '[]'::jsonb,
  research jsonb,
  research_quality int,
  discovered_at timestamptz not null default now(),
  researched_at timestamptz,
  last_contacted_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index companies_domain_unique on companies (domain) where domain is not null;
create index companies_status_idx on companies (status);

create table contacts (
  id bigserial primary key,
  company_id bigint not null references companies (id) on delete cascade,
  name text,
  role text,
  email text not null,
  email_key text not null unique,
  verification text not null default 'unverified' check (verification in ('verified', 'unverified', 'invalid')),
  verification_note text,
  source_url text,
  mx_ok boolean,
  created_at timestamptz not null default now()
);
create index contacts_company_idx on contacts (company_id);

create table campaigns (
  id bigserial primary key,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  config jsonb not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table outreach (
  id bigserial primary key,
  campaign_id bigint references campaigns (id) on delete set null,
  company_id bigint references companies (id) on delete set null,
  contact_id bigint references contacts (id) on delete set null,
  kind text not null check (kind in ('outreach', 'followup', 'studio', 'reply')),
  to_email text not null,
  to_name text,
  subject text not null,
  body text not null,
  attach_cv boolean not null default false,
  attachment_ids jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'approved', 'sending', 'sent', 'failed', 'rejected', 'bounced'
  )),
  content_hash text,
  approved_at timestamptz,
  sent_at timestamptz,
  gmail_message_id text,
  gmail_thread_id text,
  rfc_message_id text,
  parent_outreach_id bigint references outreach (id) on delete set null,
  reply_to_message_id text,
  error text,
  attempts int not null default 0,
  lint jsonb,
  generation jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index outreach_status_idx on outreach (status);
create index outreach_company_idx on outreach (company_id);
create index outreach_sent_at_idx on outreach (sent_at);
create index outreach_thread_idx on outreach (gmail_thread_id);
create index outreach_to_email_idx on outreach (to_email);

create table inbox_messages (
  id bigserial primary key,
  gmail_message_id text not null unique,
  thread_id text,
  rfc_message_id text,
  from_email text,
  from_name text,
  subject text,
  snippet text,
  body text,
  received_at timestamptz not null,
  outreach_id bigint references outreach (id) on delete set null,
  company_id bigint references companies (id) on delete set null,
  category text not null default 'other' check (category in (
    'interested', 'interview', 'more_info', 'rejection', 'follow_up_required',
    'other', 'bounce', 'opt_out', 'auto_reply'
  )),
  category_reason text,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
create index inbox_received_idx on inbox_messages (received_at desc);

create table suppression (
  id bigserial primary key,
  kind text not null check (kind in ('email', 'domain')),
  value text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

-- Background job queue (claimed with FOR UPDATE SKIP LOCKED, retried with backoff).
create table jobs (
  id bigserial primary key,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 3,
  last_error text,
  locked_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index jobs_dedupe_active on jobs (dedupe_key) where dedupe_key is not null and status in ('queued', 'running');
create index jobs_ready_idx on jobs (status, run_at);

create table activity_log (
  id bigserial primary key,
  level text not null default 'info',
  event text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on activity_log (created_at desc);

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- Single-flight lease so overlapping cron ticks never double-send.
create table locks (
  name text primary key,
  locked_until timestamptz not null
);

-- Politeness cache for job-board APIs (Remotive asks clients not to poll often).
create table http_cache (
  key text primary key,
  body jsonb not null,
  fetched_at timestamptz not null default now()
);
