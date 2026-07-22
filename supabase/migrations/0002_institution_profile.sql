-- MarksCertify — institution profile fields
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run)

alter table institutions
  add column if not exists location text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website text,
  add column if not exists instagram_url text,
  add column if not exists twitter_url text,
  add column if not exists linkedin_url text,
  add column if not exists default_signatory_name text,
  add column if not exists default_signatory_title text,
  add column if not exists signature_url text;

alter table admin_users
  add column if not exists phone_number text,
  add column if not exists avatar_url text;
