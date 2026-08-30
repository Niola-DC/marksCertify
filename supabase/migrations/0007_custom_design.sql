-- Custom Design add-on (PRD 6.2) — institutions upload their own certificate
-- background image and position dynamic fields on top of it, instead of
-- using MarksCertify's built-in HTML/CSS template.
--
-- `addons` is a JSONB flag bag, not a boolean column per add-on, because the
-- PRD names more paid add-ons coming later (white-label portal, verification
-- API) — this shape needs no further migration when those land. No Paystack
-- integration exists yet, so this flag is toggled manually in the DB for now;
-- its webhook will set the same flag later, no schema rework.
--
-- Default '{"customDesign": false}' means every existing institution is
-- unaffected: no upload UI shows, and custom_design_enabled defaulting to
-- false means generateCertificateForEarner keeps using template_config /
-- certificate.html exactly as it does today.
--
-- custom_design_enabled is a separate "go live" switch from "has the addon"
-- and from "has uploaded a file" — an institution can upload + position
-- fields as a draft, preview it, and only flip this on once required fields
-- (EARNER_NAME, COURSE_TITLE, QR_CODE) are placed. Enforced server-side in
-- app/api/institution/custom-design/fields/route.js, not just client-side.
alter table institutions
  add column if not exists addons jsonb not null default '{"customDesign": false}'::jsonb,
  add column if not exists custom_design_url text,
  add column if not exists custom_design_fields jsonb,
  add column if not exists custom_design_enabled boolean not null default false;
