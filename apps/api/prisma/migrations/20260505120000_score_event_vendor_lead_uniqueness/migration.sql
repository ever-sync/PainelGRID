-- Remove duplicate score events for the same client/vendor/lead/kind before enforcing uniqueness.
DELETE FROM "score_events" s
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY client_id, vendor_id, lead_id, kind
           ORDER BY created_at ASC, earned_at ASC, id ASC
         ) AS rn
  FROM "score_events"
) dup
WHERE s.id = dup.id
  AND dup.rn > 1;

ALTER TABLE "score_events"
  ADD CONSTRAINT "score_events_client_id_vendor_id_lead_id_kind_key"
  UNIQUE ("client_id", "vendor_id", "lead_id", "kind");
