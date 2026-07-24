-- MarksCertify Stage 1 schema

create extension if not exists pgcrypto;

-- ── institutions ──────────────────────────────────────────────
create table if not exists institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  plan_tier text not null default 'starter'
    check (plan_tier in ('starter', 'growth', 'scale', 'enterprise')),
  certs_issued_this_month int not null default 0,
  billing_cycle_start date not null default current_date,
  created_at timestamptz not null default now()
);

-- ── admin_users — one row per Supabase Auth user, links them to an institution ──
create table if not exists admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid not null references institutions(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'owner')),
  created_at timestamptz not null default now()
);

-- ── earners ───────────────────────────────────────────────────
create table if not exists earners (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  full_name text not null,
  email text,
  phone_number text,
  created_at timestamptz not null default now()
);
create index if not exists idx_earners_institution_email on earners(institution_id, email);

-- ── certificates ──────────────────────────────────────────────
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  cert_id text not null unique,
  institution_id uuid not null references institutions(id) on delete cascade,
  earner_id uuid not null references earners(id) on delete cascade,
  course_title text not null,
  issue_date date not null default current_date,
  expiry_date date,
  signatory_name text not null,
  signatory_title text not null,
  pdf_url text,
  verify_url text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  revocation_reason text,
  email_sent boolean not null default false,
  email_sent_at timestamptz,
  whatsapp_sent boolean not null default false,
  whatsapp_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_certificates_institution on certificates(institution_id);
create index if not exists idx_certificates_cert_id on certificates(cert_id);

-- ── Cert ID generator — MC-YYYY-NG-00001, sequential, immutable once issued ──
create sequence if not exists cert_id_seq start 1;

create or replace function generate_cert_id()
returns text
language plpgsql
as $$
declare
  next_val bigint;
begin
  next_val := nextval('cert_id_seq');
  return 'MC-' || to_char(current_date, 'YYYY') || '-NG-' || lpad(next_val::text, 5, '0');
end;
$$;

-- ── Row Level Security ───────────────────────────────────────
-- All application routes use the service-role key (bypasses RLS), so these
-- policies only matter if the anon/user key is ever queried directly
-- (e.g. a future client-side dashboard). Default posture: admins can only
-- see their own institution's data; no public/anon access to raw tables.
alter table institutions enable row level security;
alter table admin_users enable row level security;
alter table earners enable row level security;
alter table certificates enable row level security;

create policy "admins read own institution" on institutions
  for select using (
    id in (select institution_id from admin_users where admin_users.id = auth.uid())
  );

create policy "admins read own row" on admin_users
  for select using (id = auth.uid());

create policy "admins read own earners" on earners
  for select using (
    institution_id in (select institution_id from admin_users where admin_users.id = auth.uid())
  );

create policy "admins read own certificates" on certificates
  for select using (
    institution_id in (select institution_id from admin_users where admin_users.id = auth.uid())
  );
