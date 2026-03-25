/**
 * stripe.normalizer.ts
 *
 * Converts Stripe webhook payloads into our unified NormalizedFailedPayment format.
 *
 * WHY STRIPE ALONGSIDE RAZORPAY?
 * FynBack is India-first but many Indian SaaS companies charge international customers
 * via Stripe (Razorpay doesn't support USD billing well for B2B SaaS).
 * Supporting Stripe from day one opens the full Indian SaaS market.
 *
 * SUPPORTED STRIPE EVENTS:
 *   invoice.payment_failed  → Subscription invoice payment failed (most common)
 *   charge.failed           → One-time charge failed (less common, but covered)
 *
 * STRIPE AMOUNT FORMAT:
 * Stripe amounts are in the currency's smallest unit:
 *   USD: cents (100 = $1.00)
 *   INR: PAISE (100 = ₹1.00)
 * For INR, no conversion is needed. For USD, we convert to INR paise at a fixed
 * rate at ingestion time. WHY FIXED RATE: We store the original currency separately,
 * and the Indian equivalent for analytics. Exact FX accuracy is not critical for
 * recovery decisions — what matters is "is this recoverable?" not exact ₹ amount.
 *
 * REFERENCE:
 * https://stripe.com/docs/api/events/types
 * https://stripe.com/docs/declines/codes
 * https://stripe.com/docs/billing/subscriptions/overview#subscription-statuses
 */

import type {
  NormalizedFailedPayment,
  NormalizerResult,
  DeclineCategory,
  PaymentMethodType,
} from '../types/payment.types';

// ─────────────────────────────────────────────────────────────────────────────
// Internal types matching Stripe's webhook payload shape (simplified)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stripe invoice object (simplified — only fields we use).
 * WHY OPTIONAL FIELDS: Stripe's type definitions are complex with many nullable
 * fields. Using optional types prevents crashes on partial payloads.
 */
interface StripeInvoice {
  id: string;                          // inv_xxx — the invoice ID
  object: 'invoice';
  amount_due: number;                  // In currency's smallest unit
  currency: string;                    // e.g., "inr", "usd" (Stripe uses lowercase)
  customer: string;                    // cus_xxx — Stripe customer ID
  customer_email?: string | null;
  customer_name?: string | null;
  subscription?: string | null;        // sub_xxx if this is a subscription invoice
  payment_intent?: string | null;      // pi_xxx — needed to get decline reason
  charge?: string | null;              // ch_xxx — the charge that failed
  last_payment_error?: {
    code?: string;                     // e.g., "insufficient_funds", "card_declined"
    decline_code?: string;             // More specific: "insufficient_funds", "do_not_honor"
    message?: string;
    type?: string;                     // "card_error", "invalid_request_error", etc.
    payment_method?: {
      type?: string;                   // "card", "sepa_debit", "upi", etc.
      card?: {
        brand?: string;               // "visa", "mastercard", "rupay"
      };
    };
  } | null;
  lines?: {
    data: Array<{
      description?: string;
    }>;
  };
}

/**
 * Stripe charge object (simplified).
 * Used for charge.failed events (one-time payments).
 */
interface StripeCharge {
  id: string;                          // ch_xxx
  object: 'charge';
  amount: number;
  currency: string;
  customer?: string | null;            // cus_xxx
  billing_details?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  payment_method_details?: {
    type?: string;                     // "card", "upi", etc.
  } | null;
  failure_code?: string | null;        // e.g., "insufficient_funds"
  failure_message?: string | null;
  metadata?: Record<string, string>;
}

interface StripeWebhookEvent {
  id: string;                          // evt_xxx — THIS IS OUR IDEMPOTENCY KEY
  object: 'event';
  type: string;                        // e.g., "invoice.payment_failed"
  created: number;                     // UNIX timestamp in seconds
  data: {
    object: Record<string, unknown>;   // The invoice or charge object
  };
  livemode: boolean;                   // false = test mode; true = production
}

// ─────────────────────────────────────────────────────────────────────────────
// Decline code classification for Stripe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stripe's decline_code (more specific than code) drives our classification.
 *
 * WHY STRIPE HAS TWO CODES:
 *   code = the card error type: "card_declined", "expired_card", "incorrect_cvc"
 *   decline_code = bank-specific reason: "insufficient_funds", "do_not_honor"
 * We prioritize decline_code (more specific) then fall back to code.
 *
 * Full list: https://stripe.com/docs/declines/codes
 */
function classifyStripeDecline(
  code?: string | null,
  declineCode?: string | null
): { declineCategory: DeclineCategory; isRecoverable: boolean } {
  const specific = (declineCode ?? '').toLowerCase();
  const general = (code ?? '').toLowerCase();

  // ── Hard declines — do NOT retry ─────────────────────────────────────────
  // These will always fail on retry. Retrying risks merchant account warnings.
  const hardDeclineCodes = [
    'stolen_card',
    'lost_card',
    'pick_up_card',
    'restricted_card',
    'card_velocity_exceeded',     // Too many retries already attempted
    'fraudulent',
    'do_not_honor',               // Generic bank refusal (often permanent)
    'transaction_not_allowed',
    'not_permitted',
    'security_violation',
    'service_not_allowed',
  ];

  if (hardDeclineCodes.includes(specific) || hardDeclineCodes.includes(general)) {
    return { declineCategory: 'hard_decline', isRecoverable: false };
  }

  // ── Expired card ──────────────────────────────────────────────────────────
  if (general === 'expired_card' || specific === 'expired_card') {
    return { declineCategory: 'card_expired', isRecoverable: false };
  }

  // ── Soft declines — retry with spacing ────────────────────────────────────
  const softDeclineCodes = [
    'insufficient_funds',
    'insufficient_funds_in_account',
    'withdrawal_count_limit_exceeded',
    'generic_decline',             // Vague refusal — often resolves on retry
    'processing_error',            // Technical issue at bank
    'reenter_transaction',         // Bank asking to retry
    'try_again_later',
    'online_or_offline_pin_required',
  ];

  if (softDeclineCodes.includes(specific) || softDeclineCodes.includes(general)) {
    return { declineCategory: 'soft_decline', isRecoverable: true };
  }

  // ── Bank-side limits ──────────────────────────────────────────────────────
  const bankDeclineCodes = [
    'approve_with_id',
    'call_issuer',
    'new_account_information_available',
    'no_action_taken',
    'revocation_of_all_authorizations',
    'stop_payment_order',
  ];

  if (bankDeclineCodes.includes(specific)) {
    return { declineCategory: 'bank_decline', isRecoverable: true };
  }

  // ── Default: unknown ──────────────────────────────────────────────────────
  return { declineCategory: 'unknown', isRecoverable: true };
}

/**
 * Maps Stripe payment method type to our PaymentMethodType.
 * WHY: Stripe uses different terms ("card", "sepa_debit") vs our system.
 */
function mapStripePaymentMethod(methodType?: string): PaymentMethodType {
  switch (methodType) {
    case 'card':        return 'credit_card';
    case 'upi':         return 'upi_autopay';
    case 'netbanking':  return 'net_banking';
    case 'wallet':      return 'wallet';
    default:            return 'credit_card';
  }
}

/**
 * Approximate USD→INR conversion for analytics normalization.
 * WHY: FynBack's MRR dashboard shows everything in INR. For USD Stripe charges,
 * we store the USD amount and an approximate INR equivalent for reporting.
 *
 * We use a rough conversion (not a live rate) because:
 *   1. Exact FX is not needed for "is this recoverable?" decisions.
 *   2. Adding a real-time FX API call in the webhook handler adds latency and
 *      a new failure mode — bad for a payment-critical path.
 *
 * The displayed amount in INR is always approximate and labeled as such.
 */
const APPROXIMATE_USD_TO_INR = 84; // Update periodically — rough rate

function convertToINRPaise(amountInSmallestUnit: number, currency: string): number {
  const lowerCurrency = currency.toLowerCase();

  if (lowerCurrency === 'inr') {
    // Stripe INR amounts are already in paise
    return amountInSmallestUnit;
  }

  if (lowerCurrency === 'usd') {
    // USD cents → USD → INR → paise
    // e.g., $10.00 = 1000 cents × (84 INR/USD) × 100 paise/INR = 840000 paise = ₹8400
    const usdAmount = amountInSmallestUnit / 100;
    return Math.round(usdAmount * APPROXIMATE_USD_TO_INR * 100);
  }

  // For other currencies (EUR, GBP, etc.) — return 0 to indicate "unknown INR value"
  // The original currency + amount is stored separately for accurate billing
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main normalizer function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes a Stripe webhook event into our unified NormalizedFailedPayment.
 *
 * Returns { skip: true } for:
 *   - Events that are not payment failures (e.g., invoice.paid, customer.created)
 *   - Test mode events (livemode: false) — we never run recovery on test payments
 *   - Malformed payloads missing required fields
 *
 * WHY SKIP TEST MODE EVENTS:
 * Stripe's test mode and live mode use different API keys but the same webhook endpoint
 * if configured that way. We must never trigger recovery campaigns for test payments —
 * that would spam real customers with fake "payment failed" emails.
 *
 * @param rawPayload - The parsed webhook body (signature already verified upstream)
 */
export function normalizeStripeWebhook(
  rawPayload: Record<string, unknown>
): NormalizerResult {
  const event = rawPayload as unknown as StripeWebhookEvent;

  // ── Reject test mode events immediately ──────────────────────────────────
  if (!event.livemode) {
    return {
      skip: true,
      reason: 'Stripe test mode event ignored — livemode is false.',
    };
  }

  // ── Route by event type ───────────────────────────────────────────────────
  if (event.type === 'invoice.payment_failed') {
    return normalizeInvoicePaymentFailed(event);
  }

  if (event.type === 'charge.failed') {
    return normalizeChargeFailed(event);
  }

  // All other Stripe events (payment_intent.succeeded, customer.created, etc.)
  return {
    skip: true,
    reason: `Unsupported Stripe event type: ${event.type}. Expected invoice.payment_failed or charge.failed.`,
  };
}

/**
 * Handles invoice.payment_failed — the most common Stripe subscription failure.
 * This fires when Stripe tries to collect a subscription renewal and it fails.
 */
function normalizeInvoicePaymentFailed(event: StripeWebhookEvent): NormalizerResult {
  const invoice = event.data.object as unknown as StripeInvoice;

  if (!invoice?.id) {
    return {
      skip: true,
      reason: 'Stripe invoice.payment_failed missing invoice.id — malformed payload.',
    };
  }

  const lastError = invoice.last_payment_error;
  const { declineCategory, isRecoverable } = classifyStripeDecline(
    lastError?.code,
    lastError?.decline_code
  );

  const paymentMethodType = mapStripePaymentMethod(
    lastError?.payment_method?.type
  );

  // Convert amount to INR paise for unified reporting
  const amountPaise = convertToINRPaise(invoice.amount_due, invoice.currency);

  const normalized: NormalizedFailedPayment = {
    gatewayName: 'stripe',

    /**
     * Stripe's event.id is globally unique and is our idempotency key.
     * WHY event.id not invoice.id: Stripe can send the same invoice failure event
     * multiple times (retried delivery). event.id is unique per delivery attempt
     * but has the same value on retries, so it's the correct idempotency key.
     */
    gatewayEventId: event.id,

    // The charge ID is the most useful reference for Stripe API calls
    gatewayPaymentId: invoice.charge ?? invoice.id,
    gatewayOrderId: invoice.id,
    gatewaySubscriptionId: invoice.subscription ?? undefined,
    gatewayCustomerId: invoice.customer,

    customerEmail: invoice.customer_email ?? undefined,
    customerName: invoice.customer_name ?? undefined,
    customerPhone: undefined, // Stripe invoices rarely include phone

    amountPaise,
    currency: invoice.currency.toUpperCase(), // Stripe uses lowercase, we store uppercase

    paymentMethodType,
    declineCode: lastError?.decline_code ?? lastError?.code,
    declineCategory,
    isRecoverable,

    failedAt: new Date(event.created * 1000),

    rawPayload: event as unknown as Record<string, unknown>,
  };

  return { skip: false, data: normalized };
}

/**
 * Handles charge.failed — one-time payment failures (non-subscription).
 * Less common than invoice.payment_failed but important for one-time charges.
 */
function normalizeChargeFailed(event: StripeWebhookEvent): NormalizerResult {
  const charge = event.data.object as unknown as StripeCharge;

  if (!charge?.id) {
    return {
      skip: true,
      reason: 'Stripe charge.failed missing charge.id — malformed payload.',
    };
  }

  const { declineCategory, isRecoverable } = classifyStripeDecline(
    charge.failure_code,
    charge.failure_code  // For charges, failure_code is the most specific we have
  );

  const paymentMethodType = mapStripePaymentMethod(
    charge.payment_method_details?.type
  );

  const amountPaise = convertToINRPaise(charge.amount, charge.currency);

  const normalized: NormalizedFailedPayment = {
    gatewayName: 'stripe',
    gatewayEventId: event.id,
    gatewayPaymentId: charge.id,
    gatewayCustomerId: charge.customer ?? undefined,

    customerEmail: charge.billing_details?.email ?? undefined,
    customerName: charge.billing_details?.name ?? undefined,
    customerPhone: charge.billing_details?.phone ?? undefined,

    amountPaise,
    currency: charge.currency.toUpperCase(),

    paymentMethodType,
    declineCode: charge.failure_code ?? undefined,
    declineCategory,
    isRecoverable,

    failedAt: new Date(event.created * 1000),

    rawPayload: event as unknown as Record<string, unknown>,
  };

  return { skip: false, data: normalized };
}
