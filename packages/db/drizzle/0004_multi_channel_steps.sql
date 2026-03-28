-- 0004_multi_channel_steps.sql
--
-- Adds a `channels` text[] column to campaign_steps so a single step can
-- send on multiple channels (email + whatsapp, email + sms, etc.) on the same day.
-- The worker creates one BullMQ job per channel listed here.
--
-- Backward compat: existing rows get channels = ARRAY[preferred_channel::text]
-- so old data continues to work with zero changes to running campaigns.

ALTER TABLE campaign_steps
  ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT ARRAY['email']::text[];

-- Backfill from the single preferred_channel value so existing steps aren't broken
UPDATE campaign_steps
  SET channels = ARRAY[preferred_channel::text]
  WHERE channels = ARRAY['email']::text[]
    AND preferred_channel <> 'email';
