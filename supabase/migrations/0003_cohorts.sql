-- Cohort & Completion Management
--
-- certificateGenerator.js already writes to cohort_members (cohort_id,
-- earner_id, status, cert_id) when a cert is generated with a cohortId —
-- this migration just makes that table (and the cohorts it belongs to)
-- actually exist.
--
-- Both tables already existed from earlier scaffolding, but with a
-- different (and for cohort_members, incomplete — no institution_id)
-- shape, and confirmed empty (0 rows) before this ran. Dropping and
-- recreating rather than patching column-by-column.
drop table if exists cohort_members cascade;
drop table if exists cohorts cascade;

-- ── cohorts ───────────────────────────────────────────────────
create table if not exists cohorts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  name text not null,
  program text not null,               -- course/program title used as course_title on generated certs
  start_date date,
  end_date date,
  completion_criteria text,            -- free-text reference note; no automated scoring (assessment layer out of scope)
  signatory_name text not null,
  signatory_title text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cohorts_institution on cohorts(institution_id);

-- ── cohort_members ────────────────────────────────────────────
create table if not exists cohort_members (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohorts(id) on delete cascade,
  institution_id uuid not null references institutions(id) on delete cascade,
  earner_id uuid not null references earners(id) on delete cascade,
  status text not null default 'enrolled'
    check (status in ('enrolled', 'in_progress', 'completed', 'dropped')),
  cert_id uuid references certificates(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cohort_id, earner_id)
);
create index if not exists idx_cohort_members_cohort on cohort_members(cohort_id);
create index if not exists idx_cohort_members_institution on cohort_members(institution_id);

-- ── Row Level Security ───────────────────────────────────────
-- Same posture as the rest of the schema: app routes use the service-role
-- key, so these only matter for any future direct anon/user-key access.
alter table cohorts enable row level security;
alter table cohort_members enable row level security;

create policy "admins read own cohorts" on cohorts
  for select using (
    institution_id in (select institution_id from admin_users where admin_users.id = auth.uid())
  );

create policy "admins read own cohort members" on cohort_members
  for select using (
    institution_id in (select institution_id from admin_users where admin_users.id = auth.uid())
  );

-- Deferred: score-based completion threshold (e.g. auto-complete a member
-- at score >= 70%). Out of scope while the assessment layer is skipped —
-- completion stays a manual status change. See PRD 5.1.
