ALTER TABLE "service_ratings"
ADD COLUMN "event_score" INTEGER,
ADD COLUMN "nps_score" INTEGER,
ADD COLUMN "google_review_requested_at" TIMESTAMP(3),
ADD COLUMN "google_review_clicked_at" TIMESTAMP(3),
ADD COLUMN "google_review_verified_at" TIMESTAMP(3);

ALTER TABLE "service_ratings"
ADD CONSTRAINT "service_ratings_event_score_check"
CHECK ("event_score" IS NULL OR "event_score" BETWEEN 1 AND 5),
ADD CONSTRAINT "service_ratings_nps_score_check"
CHECK ("nps_score" IS NULL OR "nps_score" BETWEEN 0 AND 10);

CREATE INDEX "service_ratings_event_id_event_score_idx"
ON "service_ratings"("event_id", "event_score");

CREATE INDEX "service_ratings_event_id_nps_score_idx"
ON "service_ratings"("event_id", "nps_score");
