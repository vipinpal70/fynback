-- 0005_cancellation_reason.sql
--
-- Adds `cancellation_reason` to failed_payments so the dashboard and workers
-- can record WHY a recovery was abandoned without human-readable guesswork.
--
-- Known values set by the recovery worker:
--   'email_not_found_whatsapp_disabled'          — contact has no email AND merchant WhatsApp is off
--   'email_sequence_exhausted_whatsapp_disabled' — 3 emails sent, WhatsApp disabled, no more channels
--   'email_sequence_exhausted_no_phone'          — 3 emails sent, no phone number to escalate to WhatsApp

ALTER TABLE failed_payments
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
