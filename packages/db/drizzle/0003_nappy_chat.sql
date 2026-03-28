CREATE TYPE "public"."campaign_channel" AS ENUM('email', 'whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."campaign_run_status" AS ENUM('active', 'paused', 'recovered', 'exhausted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('system_default', 'merchant_master');--> statement-breakpoint
CREATE TYPE "public"."pause_offer_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."run_step_status" AS ENUM('scheduled', 'sent', 'delivered', 'failed', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TABLE "campaign_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_run_id" uuid NOT NULL,
	"campaign_step_id" uuid NOT NULL,
	"message_template_id" uuid,
	"step_number" integer NOT NULL,
	"channel_used" "campaign_channel" NOT NULL,
	"status" "run_step_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"bullmq_job_id" varchar(255),
	"outreach_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"failed_payment_id" uuid NOT NULL,
	"campaign_template_id" uuid NOT NULL,
	"customer_id" uuid,
	"status" "campaign_run_status" DEFAULT 'active' NOT NULL,
	"channels_active" jsonb DEFAULT '["email"]' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"total_steps" integer NOT NULL,
	"pause_offer_sent" boolean DEFAULT false NOT NULL,
	"pause_offer_status" "pause_offer_status",
	"payday_notification_sent" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_template_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"day_offset" integer NOT NULL,
	"preferred_channel" "campaign_channel" NOT NULL,
	"is_pause_offer" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"name" varchar(100) NOT NULL,
	"description" text,
	"type" "campaign_type" NOT NULL,
	"plan_required" varchar(20) NOT NULL,
	"decline_category_filter" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"max_steps" integer NOT NULL,
	"pause_offer_step" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"gateway_customer_id" varchar(255),
	"email" varchar(320),
	"phone" varchar(20),
	"name" varchar(255),
	"email_valid" boolean DEFAULT true NOT NULL,
	"has_whatsapp" boolean,
	"whatsapp_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_step_id" uuid NOT NULL,
	"channel" "campaign_channel" NOT NULL,
	"subject" varchar(200),
	"body_html" text,
	"body_text" text,
	"variables" jsonb DEFAULT '[]' NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchant_brand_settings" ADD COLUMN "default_campaign_preference" text DEFAULT 'standard_10d';--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "campaigns_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "failed_payments" ADD COLUMN "active_campaign_run_id" uuid;--> statement-breakpoint
ALTER TABLE "outreach_events" ADD COLUMN "campaign_run_step_id" uuid;--> statement-breakpoint
ALTER TABLE "recovery_jobs" ADD COLUMN "campaign_run_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_run_steps" ADD CONSTRAINT "campaign_run_steps_campaign_run_id_campaign_runs_id_fk" FOREIGN KEY ("campaign_run_id") REFERENCES "public"."campaign_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_run_steps" ADD CONSTRAINT "campaign_run_steps_campaign_step_id_campaign_steps_id_fk" FOREIGN KEY ("campaign_step_id") REFERENCES "public"."campaign_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_run_steps" ADD CONSTRAINT "campaign_run_steps_message_template_id_message_templates_id_fk" FOREIGN KEY ("message_template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_run_steps" ADD CONSTRAINT "campaign_run_steps_outreach_event_id_outreach_events_id_fk" FOREIGN KEY ("outreach_event_id") REFERENCES "public"."outreach_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_failed_payment_id_failed_payments_id_fk" FOREIGN KEY ("failed_payment_id") REFERENCES "public"."failed_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_campaign_template_id_campaign_templates_id_fk" FOREIGN KEY ("campaign_template_id") REFERENCES "public"."campaign_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_campaign_template_id_campaign_templates_id_fk" FOREIGN KEY ("campaign_template_id") REFERENCES "public"."campaign_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_campaign_step_id_campaign_steps_id_fk" FOREIGN KEY ("campaign_step_id") REFERENCES "public"."campaign_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_run_steps_run_idx" ON "campaign_run_steps" USING btree ("campaign_run_id");--> statement-breakpoint
CREATE INDEX "campaign_run_steps_run_status_idx" ON "campaign_run_steps" USING btree ("campaign_run_id","status");--> statement-breakpoint
CREATE INDEX "campaign_run_steps_bullmq_job_idx" ON "campaign_run_steps" USING btree ("bullmq_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_runs_failed_payment_uniq" ON "campaign_runs" USING btree ("failed_payment_id");--> statement-breakpoint
CREATE INDEX "campaign_runs_merchant_status_idx" ON "campaign_runs" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "campaign_runs_customer_idx" ON "campaign_runs" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_steps_template_step_uniq" ON "campaign_steps" USING btree ("campaign_template_id","step_number");--> statement-breakpoint
CREATE INDEX "campaign_steps_template_idx" ON "campaign_steps" USING btree ("campaign_template_id");--> statement-breakpoint
CREATE INDEX "campaign_templates_merchant_idx" ON "campaign_templates" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "campaign_templates_plan_active_idx" ON "campaign_templates" USING btree ("plan_required","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_merchant_email_idx" ON "customers" USING btree ("merchant_id","email");--> statement-breakpoint
CREATE INDEX "customers_merchant_phone_idx" ON "customers" USING btree ("merchant_id","phone");--> statement-breakpoint
CREATE INDEX "customers_gateway_customer_idx" ON "customers" USING btree ("merchant_id","gateway_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_step_channel_uniq" ON "message_templates" USING btree ("campaign_step_id","channel");--> statement-breakpoint
CREATE INDEX "message_templates_step_idx" ON "message_templates" USING btree ("campaign_step_id");