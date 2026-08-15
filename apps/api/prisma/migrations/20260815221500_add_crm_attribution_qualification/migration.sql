ALTER TABLE "leads"
  ADD COLUMN "original_source" "LeadSource",
  ADD COLUMN "original_attribution" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "qualification" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "first_contact_at" TIMESTAMP(3),
  ADD COLUMN "last_contact_at" TIMESTAMP(3);

UPDATE "leads"
SET
  "original_source" = "source",
  "original_attribution" = jsonb_strip_nulls(jsonb_build_object(
    'source', "source",
    'campaign_id', "campaign_id",
    'facebook_campaign_id', "facebook_campaign_id",
    'facebook_campaign_name', "facebook_campaign_name",
    'facebook_ad_set_id', "facebook_ad_set_id",
    'facebook_ad_set_name', "facebook_ad_set_name",
    'facebook_ad_id', "facebook_ad_id",
    'facebook_ad_name', "facebook_ad_name",
    'facebook_form_id', "facebook_form_id",
    'captured_at', COALESCE("source_created_at", "created_at")
  ))
WHERE "original_source" IS NULL;

CREATE OR REPLACE FUNCTION preserve_lead_original_attribution()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."original_source" := COALESCE(NEW."original_source", NEW."source");
    IF NEW."original_attribution" = '{}'::jsonb THEN
      NEW."original_attribution" := jsonb_strip_nulls(jsonb_build_object(
        'source', NEW."source",
        'campaign_id', NEW."campaign_id",
        'facebook_campaign_id', NEW."facebook_campaign_id",
        'facebook_campaign_name', NEW."facebook_campaign_name",
        'facebook_ad_set_id', NEW."facebook_ad_set_id",
        'facebook_ad_set_name', NEW."facebook_ad_set_name",
        'facebook_ad_id', NEW."facebook_ad_id",
        'facebook_ad_name', NEW."facebook_ad_name",
        'facebook_form_id', NEW."facebook_form_id",
        'captured_at', COALESCE(NEW."source_created_at", NEW."created_at", NOW())
      ));
    END IF;
  ELSE
    NEW."original_source" := OLD."original_source";
    NEW."original_attribution" := OLD."original_attribution";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_preserve_lead_original_attribution"
BEFORE INSERT OR UPDATE ON "leads"
FOR EACH ROW EXECUTE FUNCTION preserve_lead_original_attribution();

CREATE INDEX "leads_original_source_idx" ON "leads"("original_source");
CREATE INDEX "leads_last_contact_at_idx" ON "leads"("last_contact_at");
