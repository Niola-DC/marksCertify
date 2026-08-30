-- Template Builder — per-institution certificate customization
--
-- Single JSONB blob rather than one column per field — this is deliberately
-- the same shape the future AI Design Studio (Stage 4) will write into when
-- it generates a config from a prompt instead of from manual picker input,
-- so no schema migration is needed when that work starts.
--
-- Default reproduces the current hardcoded certificate.html look exactly,
-- so institutions that never open the Template Builder keep rendering the
-- same certificate they get today.
alter table institutions
  add column if not exists template_config jsonb not null default '{
    "baseStyle": "classic",
    "primaryColor": "#B8962E",
    "secondaryColor": "#0D0D0D",
    "fontFamily": "georgia"
  }'::jsonb;
