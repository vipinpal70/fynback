/**
 * payment.types.ts
 *
 * Core TypeScript types for the entire payment recovery engine.
 *
 * These types flow through every layer of the system:
 *   webhook route → normalizer → DB insert → recovery queue → worker
 *
 * WHY A UNIFIED TYPE?
 * Each payment gateway sends completely different webhook shapes:
 *   - Razorpay: { payload: { payment: { entity: { ... } } } }
 *   - Stripe:   { type: "invoice.payment_failed", data: { object: { ... } } }
 *   - Cashfree: { data: { order: { ... }, payment: { ... } } }
 * The normalizer converts ALL of them into NormalizedFailedPayment so the recovery
 * engine is 100% gateway-agnostic.
 *
 * WHY PAISE?
 * Floating-point arithmetic is unsafe for money. ₹100.50 stored as 10050 (integer)
 * is always exact — no rounding errors, no "₹99.99999" bugs in dashboards.
 * Rule: amounts leave this system only for display. Display layer divides by 100.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Gateway Identity
// ─────────────────────────────────────────────────────────────────────────────

/** All payment gateways we support. Drives which normalizer to call. */
export type GatewayName = 'razorpay' | 'stripe' | 'cashfree' | 'payu';

// ─────────────────────────────────────────────────────────────────────────────
// Payment Method Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How the customer was being charged.
 *
 * WHY THIS MATTERS FOR RECOVERY:
 *   - upi_autopay: Governed by NPCI rules — max 4 retry attempts per cycle.
 *                  After 4 failures the mandate is permanently cancelled.
 *                  We must track attempt count separately from card retries.
 *   - credit_card / debit_card: Can retry 3-4 times with spacing.
 *   - net_banking: One-time; cannot retry automatically — must send payment link.
 *   - wallet: Low amounts; usually self-resolves; light-touch email is enough.
 *   - emi: Bank-managed; hard to retry; escalate to WhatsApp immediately.
 */
export type PaymentMethodType =
  | 'credit_card'
  | 'debit_card'
  | 'upi_autopay'
  | 'net_banking'
  | 'wallet'
  | 'emi';

// ─────────────────────────────────────────────────────────────────────────────
// Decline Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why the payment failed — drives the recovery strategy.
 *
 * soft_decline   → Retry in 3h, 24h, 72h, 7d. Most recoverable.
 *                  Examples: "insufficient_funds", "network_error", "timeout"
 *
 * hard_decline   → Do NOT auto-retry. Send manual update link immediately.
 *                  Retrying a hard decline can result in merchant account flags.
 *                  Examples: "stolen_card", "fraud", "do_not_honor_velocity"
 *
 * card_expired   → Card is past expiry — retrying will always fail.
 *                  Skip retry entirely. Send "update card" email right away.
 *
 * upi_failure    → UPI AutoPay-specific. Respect NPCI's 4-attempt rule.
 *                  Different retry timing: align with Indian payday windows.
 *
 * bank_decline   → Bank-side block (daily limit, account frozen, etc.)
 *                  Retry once after 24h; if still fails, send WhatsApp.
 *
 * unknown        → Couldn't classify from the decline code.
 *                  Treat like soft_decline: retry once, then email sequence.
 */
export type DeclineCategory =
  | 'soft_decline'
  | 'hard_decline'
  | 'card_expired'
  | 'upi_failure'
  | 'bank_decline'
  | 'unknown';

// ─────────────────────────────────────────────────────────────────────────────
// Recovery State Machine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The lifecycle of every failed payment.
 *
 * RECOVERABLE PAYMENT FLOW:
 *   just_failed → retry_scheduled → retrying → [recovered]
 *                                            → email_sequence → [recovered]
 *                                                             → whatsapp_sent → [recovered]
 *                                                                             → sms_sent → [recovered | cancelled]
 *
 * HARD DECLINE FLOW (skip auto-retry entirely):
 *   just_failed → email_sequence → whatsapp_sent → sms_sent → cancelled
 *
 * UPI AUTOPAY FLOW (NPCI 4-attempt rule):
 *   just_failed → retry_scheduled (up to 3 more retries) → email_sequence
 *   After 4 total attempts the UPI mandate is cancelled — must use payment link.
 *
 * TERMINAL STATES: 'recovered' and 'cancelled'
 */
export type RecoveryJobStatus =
  | 'just_failed'      // Payment just entered our system
  | 'retry_scheduled'  // BullMQ delayed job created — waiting for optimal window
  | 'retrying'         // Worker is actively calling the gateway retry API
  | 'email_sequence'   // In drip email campaign (Step 1 → 2 → 3 over 7 days)
  | 'whatsapp_sent'    // WhatsApp message dispatched via Interakt/MSG91
  | 'sms_sent'         // SMS dispatched via MSG91 DLT
  | 'card_updated'     // Customer clicked payment link and updated their card
  | 'recovered'        // Payment succeeded — TERMINAL STATE
  | 'cancelled';       // Gave up — TERMINAL STATE

// ─────────────────────────────────────────────────────────────────────────────
// Normalized Failed Payment Event
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The unified output of every gateway normalizer.
 *
 * Every normalizer (Razorpay, Stripe, Cashfree, PayU) must produce exactly
 * this shape. The rest of the system only speaks this language.
 */
export interface NormalizedFailedPayment {
  // Which gateway produced this event
  gatewayName: GatewayName;

  /**
   * Unique event ID from the gateway (e.g., Razorpay: evt_xxx, Stripe: evt_xxx).
   * WHY: Webhooks can be retried by the gateway (e.g., our endpoint returned 500).
   * Storing this as a UNIQUE key in the DB means we can safely re-process the same
   * webhook without creating duplicate failed_payments rows.
   */
  gatewayEventId: string;

  // Payment, order, subscription, and customer IDs from the gateway
  // WHY: Needed to call gateway APIs for retry, refund, status lookup
  gatewayPaymentId: string;
  gatewayOrderId?: string;         // Razorpay order / Stripe charge ID
  gatewaySubscriptionId?: string;  // Present for subscription-based payments
  gatewayCustomerId?: string;      // Gateway's own customer object ID

  // Customer contact info (may be partial — gateways don't always send all fields)
  // WHY: Denormalized here so we can send emails without DB joins on hot paths
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;

  /**
   * Amount in PAISE (smallest Indian currency unit).
   * WHY: Integer arithmetic is exact. ₹100.50 = 10050 paise. Never use float for money.
   * When Stripe sends USD amounts in cents, convert to paise via exchange rate at time of failure.
   */
  amountPaise: number;

  /** ISO 4217 currency code. 'INR' for domestic; 'USD' for Stripe international. */
  currency: string;

  paymentMethodType: PaymentMethodType;

  /**
   * Raw decline code from the gateway.
   * Examples: 'insufficient_funds', 'do_not_honor', 'card_declined', 'PAYMENT_TIMEOUT'
   * WHY: Kept raw for debugging and future reclassification without re-processing.
   */
  declineCode?: string;

  /**
   * Our classification of why the payment failed.
   * WHY: This is what drives the recovery strategy — not the raw code.
   * The normalizer maps 100+ gateway-specific codes into our 6 categories.
   */
  declineCategory: DeclineCategory;

  /**
   * Whether automatic recovery is worth attempting.
   * false for hard declines, fraud flags, or stolen card codes.
   * WHY: Retrying a stolen card is a card scheme violation and can lead to fines.
   * For these, we go straight to the email sequence with a payment link instead.
   */
  isRecoverable: boolean;

  /** When the payment actually failed at the gateway (not when we received the webhook). */
  failedAt: Date;

  /**
   * The complete original webhook body from the gateway.
   * WHY: Stored as JSONB for two reasons:
   *   1. Debugging — when something goes wrong, we have the full context.
   *   2. Future normalizer improvements — we can re-process old events without re-ingesting.
   * Indexed with GIN in Postgres for fast JSONB queries.
   */
  rawPayload: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalizer Result (success/failure wrapper)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every normalizer returns this shape.
 *
 * WHY: Normalizers may receive unsupported event types (e.g., 'payment.captured'
 * instead of 'payment.failed'). Rather than throwing, they return { skip: true }
 * so the webhook route can respond 200 OK to the gateway without doing any work.
 * Gateways retry on non-2xx responses — we must always return 200.
 */
export type NormalizerResult =
  | { skip: true; reason: string }                        // Unsupported event type
  | { skip: false; data: NormalizedFailedPayment };       // Ready to persist
