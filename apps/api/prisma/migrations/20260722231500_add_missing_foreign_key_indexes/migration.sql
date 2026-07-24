-- Support foreign-key checks and common joins as these tables grow.
CREATE INDEX IF NOT EXISTS "leads_campaign_id_idx" ON "leads"("campaign_id");
CREATE INDEX IF NOT EXISTS "leads_event_interest_id_idx" ON "leads"("event_interest_id");

CREATE INDEX IF NOT EXISTS "crm_history_changed_by_user_id_idx" ON "crm_history"("changed_by_user_id");
CREATE INDEX IF NOT EXISTS "crm_history_from_stage_id_idx" ON "crm_history"("from_stage_id");
CREATE INDEX IF NOT EXISTS "crm_history_to_stage_id_idx" ON "crm_history"("to_stage_id");

CREATE INDEX IF NOT EXISTS "campaign_vendors_vendor_id_idx" ON "campaign_vendors"("vendor_id");

CREATE INDEX IF NOT EXISTS "course_progress_course_id_idx" ON "course_progress"("course_id");
CREATE INDEX IF NOT EXISTS "course_progress_lesson_id_idx" ON "course_progress"("lesson_id");
