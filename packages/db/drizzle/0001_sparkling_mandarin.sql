CREATE TYPE "public"."decline_category" AS ENUM('soft_decline', 'hard_decline', 'card_expired', 'upi_failure', 'bank_decline', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."gateway_name" AS ENUM('razorpay', 'stripe', 'cashfree', 'payu');--> statement-breakpoint
CREATE TYPE "public"."outreach_channel" AS ENUM('email', 'whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."outreach_status" AS ENUM('pending', 'sent', 'delivered', 'failed', 'opened', 'clicked');--> statement-breakpoint
CREATE TYPE "public"."payment_event_status" AS ENUM('just_failed', 'retry_scheduled', 'retrying', 'email_sequence', 'whatsapp_sent', 'sms_sent', 'card_updated', 'recovered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method_type" AS ENUM('credit_card', 'debit_card', 'upi_autopay', 'net_banking', 'wallet', 'emi');--> statement-breakpoint
CREATE TYPE "public"."recovery_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"failed_amount_paise" bigint DEFAULT 0 NOT NULL,
	"recovered_amount_paise" bigint DEFAULT 0 NOT NULL,
	"at_risk_amount_paise" bigint DEFAULT 0 NOT NULL,
	"failed_payments_count" integer DEFAULT 0 NOT NULL,
	"recovered_payments_count" integer DEFAULT 0 NOT NULL,
	"active_recovery_jobs_count" integer DEFAULT 0 NOT NULL,
	"recovery_rate_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"recovered_via_email" integer DEFAULT 0 NOT NULL,
	"recovered_via_whatsapp" integer DEFAULT 0 NOT NULL,
	"recovered_via_sms" integer DEFAULT 0 NOT NULL,
	"recovered_via_auto_retry" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failed_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"gateway_connection_id" uuid,
	"gateway_name" "gateway_name" NOT NULL,
	"gateway_event_id" varchar(255) NOT NULL,
	"gateway_payment_id" varchar(255),
	"gateway_order_id" varchar(255),
	"gateway_subscription_id" varchar(255),
	"gateway_customer_id" varchar(255),
	"customer_email" varchar(320),
	"customer_phone" varchar(20),
	"customer_name" varchar(255),
	"amount_paise" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"payment_method_type" "payment_method_type" DEFAULT 'credit_card' NOT NULL,
	"decline_code" varchar(100),
	"decline_category" "decline_category" DEFAULT 'unknown' NOT NULL,
	"is_recoverable" boolean DEFAULT true NOT NULL,
	"status" "payment_event_status" DEFAULT 'just_failed' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_retry_at" timestamp with time zone,
	"recovered_at" timestamp with time zone,
	"recovered_amount_paise" integer,
	"recovery_attributed_to_fynback" boolean,
	"failed_at" timestamp with time zone NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "failed_payments_gateway_event_id_unique" UNIQUE("gateway_event_id")
);
--> statement-breakpoint
CREATE TABLE "gateway_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"gateway_name" "gateway_name" NOT NULL,
	"api_key_encrypted" text,
	"api_secret_encrypted" text,
	"oauth_access_token_encrypted" text,
	"oauth_refresh_token_encrypted" text,
	"oauth_expires_at" timestamp with time zone,
	"webhook_secret_encrypted" text,
	"webhook_url" text,
	"webhook_registered_at" timestamp with time zone,
	"last_webhook_received_at" timestamp with time zone,
	"is_active" boolean DEFAULT false NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"failed_payment_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"channel" "outreach_channel" NOT NULL,
	"recipient_email" varchar(320),
	"recipient_phone" varchar(20),
	"template_id" varchar(100),
	"step_number" integer DEFAULT 1 NOT NULL,
	"status" "outreach_status" DEFAULT 'pending' NOT NULL,
	"provider_message_id" varchar(255),
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"failed_payment_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"bullmq_job_id" varchar(255),
	"job_type" varchar(50) NOT NULL,
	"status" "recovery_job_status" DEFAULT 'pending' NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_message" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failed_payments" ADD CONSTRAINT "failed_payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failed_payments" ADD CONSTRAINT "failed_payments_gateway_connection_id_gateway_connections_id_fk" FOREIGN KEY ("gateway_connection_id") REFERENCES "public"."gateway_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_connections" ADD CONSTRAINT "gateway_connections_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_failed_payment_id_failed_payments_id_fk" FOREIGN KEY ("failed_payment_id") REFERENCES "public"."failed_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_jobs" ADD CONSTRAINT "recovery_jobs_failed_payment_id_failed_payments_id_fk" FOREIGN KEY ("failed_payment_id") REFERENCES "public"."failed_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_jobs" ADD CONSTRAINT "recovery_jobs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_snapshots_merchant_date_uniq" ON "analytics_snapshots" USING btree ("merchant_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "analytics_snapshots_merchant_date_idx" ON "analytics_snapshots" USING btree ("merchant_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "failed_payments_merchant_status_idx" ON "failed_payments" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "failed_payments_merchant_date_idx" ON "failed_payments" USING btree ("merchant_id","failed_at");--> statement-breakpoint
CREATE INDEX "failed_payments_subscription_idx" ON "failed_payments" USING btree ("gateway_subscription_id");--> statement-breakpoint
CREATE INDEX "failed_payments_connection_idx" ON "failed_payments" USING btree ("gateway_connection_id");--> statement-breakpoint
CREATE INDEX "failed_payments_status_retry_idx" ON "failed_payments" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_connections_merchant_gateway_idx" ON "gateway_connections" USING btree ("merchant_id","gateway_name");--> statement-breakpoint
CREATE INDEX "gateway_connections_merchant_idx" ON "gateway_connections" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "outreach_events_failed_payment_idx" ON "outreach_events" USING btree ("failed_payment_id");--> statement-breakpoint
CREATE INDEX "outreach_events_merchant_channel_idx" ON "outreach_events" USING btree ("merchant_id","channel");--> statement-breakpoint
CREATE INDEX "outreach_events_provider_msg_idx" ON "outreach_events" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "recovery_jobs_failed_payment_idx" ON "recovery_jobs" USING btree ("failed_payment_id");--> statement-breakpoint
CREATE INDEX "recovery_jobs_merchant_status_idx" ON "recovery_jobs" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "recovery_jobs_bullmq_job_idx" ON "recovery_jobs" USING btree ("bullmq_job_id");