-- Track the last delivery error per channel so failed sends can be
-- distinguished from never-attempted ones (both currently look
-- identical as email_sent/whatsapp_sent = false) and surfaced as a
-- "failed deliveries" metric with a retry action.
alter table certificates
  add column if not exists email_error text,
  add column if not exists whatsapp_error text;
