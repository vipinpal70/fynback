import { pgTable, text, timestamp, uuid, pgEnum, boolean, smallint, integer, bigint, char, varchar, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const businessTypeEnum = pgEnum('business_type', ['saas', 'd2c_subscription', 'edtech', 'ott_media', 'fintech', 'other']);
export const mrrRangeEnum = pgEnum('mrr_range', ['under_1l', '1l_to_5l', '5l_to_25l', '25l_to_1cr', 'above_1cr']);
export const planTierEnum = pgEnum('plan_tier', ['trial', 'starter', 'growth', 'scale', 'suspended', 'cancelled']);
export const billingCycleEnum = pgEnum('billing_cycle', ['monthly', 'annual']);
export const merchantStatusEnum = pgEnum('merchant_status', ['onboarding', 'active', 'trial_expired', 'suspended', 'cancelled']);
export const teamRoleEnum = pgEnum('team_role', ['owner', 'admin', 'viewer']);
export const digestFrequencyEnum = pgEnum('digest_frequency', ['realtime', 'daily', 'weekly', 'never']);

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkUserId: text('clerk_user_id').notNull().unique(),
    email: text('email').notNull(),
    fullName: text('full_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('users_clerk_idx').on(table.clerkUserId),
    index('users_email_idx').on(table.email),
]);

export const merchants = pgTable('merchants', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyName: text('company_name').notNull(),
    businessLegalName: text('business_legal_name'),
    websiteUrl: text('website_url'),
    businessType: businessTypeEnum('business_type'),
    mrrRange: mrrRangeEnum('mrr_range'),
    country: char('country', { length: 2 }).notNull().default('IN'),
    gstNumber: varchar('gst_number', { length: 15 }),
    gstVerified: boolean('gst_verified').notNull().default(false),
    panNumber: varchar('pan_number', { length: 10 }),
    plan: planTierEnum('plan').notNull().default('trial'),
    billingCycle: billingCycleEnum('billing_cycle').notNull().default('monthly'),
    trialStartedAt: timestamp('trial_started_at', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    trialActivationPaid: boolean('trial_activation_paid').notNull().default(false),
    trialActivationTxnId: text('trial_activation_txn_id'),
    planSelectedAt: timestamp('plan_selected_at', { withTimezone: true }),
    status: merchantStatusEnum('status').notNull().default('onboarding'),
    onboardingStep: smallint('onboarding_step').notNull().default(1),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    totalFailedAmountPaise: bigint('total_failed_amount_paise', { mode: 'number' }).notNull().default(0),
    totalRecoveredAmountPaise: bigint('total_recovered_amount_paise', { mode: 'number' }).notNull().default(0),
    recoveryRatePct: smallint('recovery_rate_pct').notNull().default(0),
    activeFailedPaymentsCount: integer('active_failed_payments_count').notNull().default(0),
    statsLastCalculatedAt: timestamp('stats_last_calculated_at', { withTimezone: true }),
    /**
     * When true, the campaign worker skips scheduling new campaign runs for this merchant.
     * Growth/Scale merchants can toggle this from the dashboard.
     * WHY ON MERCHANT (not template): system defaults are shared across all merchants —
     * we can't set isPaused on them per-merchant. This flag is the merchant-level kill switch.
     */
    campaignsPaused: boolean('campaigns_paused').default(false).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('merchants_status_idx').on(table.status),
    index('merchants_plan_idx').on(table.plan),
    index('merchants_created_at_idx').on(table.createdAt),
    index('merchants_gst_idx').on(table.gstNumber),
]);

export const memberships = pgTable('memberships', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    merchantId: uuid('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    role: teamRoleEnum('role').notNull().default('viewer'),
    invitedBy: uuid('invited_by').references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('memberships_user_merchant_idx').on(table.userId, table.merchantId),
    index('memberships_user_idx').on(table.userId),
    index('memberships_merchant_idx').on(table.merchantId),
]);

export const invites = pgTable('invites', {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: teamRoleEnum('role').notNull().default('viewer'),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('pending'),
    invitedBy: uuid('invited_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('invites_merchant_idx').on(table.merchantId),
    index('invites_token_idx').on(table.token),
    index('invites_email_idx').on(table.email),
]);

export const merchantBrandSettings = pgTable('merchant_brand_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id').notNull().unique().references(() => merchants.id, { onDelete: 'cascade' }),
    fromName: text('from_name'),
    fromEmail: text('from_email'),
    replyToEmail: text('reply_to_email'),
    emailDomainVerified: boolean('email_domain_verified').notNull().default(false),
    resendDomainId: text('resend_domain_id'),
    emailDomainVerifiedAt: timestamp('email_domain_verified_at', { withTimezone: true }),
    logoUrl: text('logo_url'),
    logoStoragePath: text('logo_storage_path'),
    brandColorHex: char('brand_color_hex', { length: 7 }).notNull().default('#3b82f6'),
    companyTagline: text('company_tagline'),
    whatsappEnabled: boolean('whatsapp_enabled').notNull().default(false),
    interaktApiKeyEncrypted: text('interakt_api_key_encrypted'),
    whatsappSenderName: text('whatsapp_sender_name'),
    whatsappPhoneNumber: text('whatsapp_phone_number'),
    whatsappTemplatesApproved: boolean('whatsapp_templates_approved').notNull().default(false),
    whatsappConnectedAt: timestamp('whatsapp_connected_at', { withTimezone: true }),
    smsEnabled: boolean('sms_enabled').notNull().default(false),
    msg91ApiKeyEncrypted: text('msg91_api_key_encrypted'),
    msg91SenderId: char('msg91_sender_id', { length: 6 }),
    dltRegistered: boolean('dlt_registered').notNull().default(false),
    dltEntityId: text('dlt_entity_id'),
    smsConnectedAt: timestamp('sms_connected_at', { withTimezone: true }),
    slackWebhookUrl: text('slack_webhook_url_encrypted'),
    slackChannelName: text('slack_channel_name'),
    notifyOnRecovery: boolean('notify_on_recovery').notNull().default(true),
    notifyOnFailure: boolean('notify_on_failure').notNull().default(true),
    notifyOnHardDecline: boolean('notify_on_hard_decline').notNull().default(true),
    notifyOnGatewayIssue: boolean('notify_on_gateway_issue').notNull().default(true),
    digestFrequency: digestFrequencyEnum('digest_frequency').notNull().default('daily'),
    digestEmail: text('digest_email'),
    digestSendTime: text('digest_send_time').notNull().default('09:00:00'),
    notificationConfig: text('notification_config'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('brand_settings_merchant_idx').on(table.merchantId),
]);
