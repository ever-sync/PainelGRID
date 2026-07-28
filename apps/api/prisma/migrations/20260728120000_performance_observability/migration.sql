CREATE TABLE "web_vital_metrics" (
    "id" UUID NOT NULL,
    "metric_name" VARCHAR(10) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "rating" VARCHAR(20) NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "metric_id" VARCHAR(100) NOT NULL,
    "navigation_type" VARCHAR(50),
    "path" VARCHAR(500) NOT NULL,
    "session_id" VARCHAR(64),
    "connection_type" VARCHAR(20),
    "viewport" VARCHAR(20),
    "device_memory_gb" DOUBLE PRECISION,
    "user_agent" VARCHAR(500),
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_vital_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_request_metrics" (
    "id" BIGSERIAL NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "duration_ms" DOUBLE PRECISION NOT NULL,
    "database_duration_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "database_query_count" INTEGER NOT NULL DEFAULT 0,
    "slowest_query_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "response_size_bytes" INTEGER,
    "is_slow" BOOLEAN NOT NULL DEFAULT false,
    "sampled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_metrics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "web_vital_metrics_metric_name_received_at_idx"
    ON "web_vital_metrics"("metric_name", "received_at" DESC);
CREATE UNIQUE INDEX "web_vital_metrics_metric_id_metric_name_path_key"
    ON "web_vital_metrics"("metric_id", "metric_name", "path");
CREATE INDEX "web_vital_metrics_path_received_at_idx"
    ON "web_vital_metrics"("path", "received_at" DESC);
CREATE INDEX "web_vital_metrics_session_id_idx"
    ON "web_vital_metrics"("session_id");

CREATE INDEX "api_request_metrics_sampled_at_idx"
    ON "api_request_metrics"("sampled_at" DESC);
CREATE INDEX "api_request_metrics_path_sampled_at_idx"
    ON "api_request_metrics"("path", "sampled_at" DESC);
CREATE INDEX "api_request_metrics_is_slow_sampled_at_idx"
    ON "api_request_metrics"("is_slow", "sampled_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_leads_client_active_created"
    ON "leads"("client_id", "deleted_at", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_leads_client_event_confirmation"
    ON "leads"("client_id", "event_interest_id", "confirmation_status");
CREATE INDEX IF NOT EXISTS "idx_leads_client_pipeline_stage"
    ON "leads"("client_id", "crm_pipeline_id", "crm_stage_id");
CREATE INDEX IF NOT EXISTS "idx_events_client_status_date"
    ON "events"("client_id", "status", "event_date" DESC);
CREATE INDEX IF NOT EXISTS "idx_conversations_client_last_message"
    ON "conversations"("client_id", "last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_created"
    ON "messages"("conversation_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_appointments_client_status_scheduled"
    ON "appointments"("client_id", "status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "idx_sales_client_sold_at"
    ON "sales"("client_id", "sold_at" DESC);
