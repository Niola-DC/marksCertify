-- Idempotency guard for cohort-completion cert generation. Kept separate
-- from `status` (which is admin-facing progress tracking) rather than
-- adding a 'generating' status value — this column is a pure internal
-- lock the server claims atomically before doing any generation work,
-- so two overlapping "mark completed" triggers for the same participant
-- (a retried batch, a double click, a resumed webhook) can't both pass
-- the same stale check and issue duplicate certificates.
alter table cohort_members
  add column if not exists generation_claimed_at timestamptz;
