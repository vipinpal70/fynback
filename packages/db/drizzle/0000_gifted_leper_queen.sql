CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."business_type" AS ENUM('saas', 'd2c_subscription', 'edtech', 'ott_media', 'fintech', 'other');--> statement-breakpoint
CREATE TYPE "public"."digest_frequency" AS ENUM('realtime', 'daily', 'weekly', 'never');--> statement-breakpoint
CREATE TYPE "public"."merchant_status" AS ENUM('onboarding', 'active', 'trial_expired', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."mrr_range" AS ENUM('under_1l', '1l_to_5l', '5l_to_25l', '25l_to_1cr', 'above_1cr');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('trial', 'starter', 'growth', 'scale', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('owner', 'admin', 'viewer');--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "team_role" DEFAULT 'viewer' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"role" "team_role" DEFAULT 'viewer' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_brand_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"from_name" text,
	"from_email" text,
	"reply_to_email" text,
	"email_domain_verified" boolean DEFAULT false NOT NULL,
	"resend_domain_id" text,
	"email_domain_verified_at" timestamp with time zone,
	"logo_url" text,
	"logo_storage_path" text,
	"brand_color_hex" char(7) DEFAULT '#3b82f6' NOT NULL,
	"company_tagline" text,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"interakt_api_key_encrypted" text,
	"whatsapp_sender_name" text,
	"whatsapp_phone_number" text,
	"whatsapp_templates_approved" boolean DEFAULT false NOT NULL,
	"whatsapp_connected_at" timestamp with time zone,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"msg91_api_key_encrypted" text,
	"msg91_sender_id" char(6),
	"dlt_registered" boolean DEFAULT false NOT NULL,
	"dlt_entity_id" text,
	"sms_connected_at" timestamp with time zone,
	"slack_webhook_url_encrypted" text,
	"slack_channel_name" text,
	"notify_on_recovery" boolean DEFAULT true NOT NULL,
	"notify_on_failure" boolean DEFAULT true NOT NULL,
	"notify_on_hard_decline" boolean DEFAULT true NOT NULL,
	"notify_on_gateway_issue" boolean DEFAULT true NOT NULL,
	"digest_frequency" "digest_frequency" DEFAULT 'daily' NOT NULL,
	"digest_email" text,
	"digest_send_time" text DEFAULT '09:00:00' NOT NULL,
	"notification_config" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_brand_settings_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"business_legal_name" text,
	"website_url" text,
	"business_type" "business_type",
	"mrr_range" "mrr_range",
	"country" char(2) DEFAULT 'IN' NOT NULL,
	"gst_number" varchar(15),
	"gst_verified" boolean DEFAULT false NOT NULL,
	"pan_number" varchar(10),
	"plan" "plan_tier" DEFAULT 'trial' NOT NULL,
	"billing_cycle" "billing_cycle" DEFAULT 'monthly' NOT NULL,
	"trial_started_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"trial_activation_paid" boolean DEFAULT false NOT NULL,
	"trial_activation_txn_id" text,
	"plan_selected_at" timestamp with time zone,
	"status" "merchant_status" DEFAULT 'onboarding' NOT NULL,
	"onboarding_step" smallint DEFAULT 1 NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"total_failed_amount_paise" bigint DEFAULT 0 NOT NULL,
	"total_recovered_amount_paise" bigint DEFAULT 0 NOT NULL,
	"recovery_rate_pct" smallint DEFAULT 0 NOT NULL,
	"active_failed_payments_count" integer DEFAULT 0 NOT NULL,
	"stats_last_calculated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "merchants_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_brand_settings" ADD CONSTRAINT "merchant_brand_settings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_merchant_idx" ON "invites" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "invites_token_idx" ON "invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invites_email_idx" ON "invites" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_merchant_idx" ON "memberships" USING btree ("user_id","merchant_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_merchant_idx" ON "memberships" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "brand_settings_merchant_idx" ON "merchant_brand_settings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchants_status_idx" ON "merchants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "merchants_plan_idx" ON "merchants" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "merchants_created_at_idx" ON "merchants" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "merchants_gst_idx" ON "merchants" USING btree ("gst_number");--> statement-breakpoint
CREATE INDEX "users_clerk_idx" ON "users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");