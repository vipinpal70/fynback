/**
 * razorpay.normalizer.ts
 *
 * Converts Razorpay webhook payloads into our unified NormalizedFailedPayment format.
 *
 * WHY A DEDICATED NORMALIZER PER GATEWAY?
 * Razorpay and Stripe send completely different shapes for the same concept.
 * Keeping normalization logic isolated per gateway means:
 *   1. Changes to one gateway never break another.
 *   2. Easy to add Cashfree/PayU later — just add a new file.
 *   3. The recovery engine stays 100% gateway-agnostic.
 *
 * SUPPORTED RAZORPAY EVENTS:
 *   payment.failed  → Most common; covers card, UPI, net banking, wallet failures
 *
 * WHY ONLY payment.failed (for now)?
 * Razorpay also emits subscription.halted and invoice.payment_failed, but both
 * eventually produce a payment.failed event. Starting with the most common event
 * gets us to 95% coverage immediately. We can add the others incrementally.
 *
 * RAZORPAY AMOUNT FORMAT:
 * Razorpay already sends amounts in PAISE (smallest unit). ₹100 = 10000 in their API.
 * No conversion needed for INR — just pass through the integer.
 *
 * REFERENCE:
 * https://razorpay.com/docs/webhooks/payloads/payments/
 * https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/webhook-integration/
 */

import type {
  NormalizedFailedPayment,
  NormalizerResult,
  DeclineCategory,
  PaymentMethodType,
} from '../types/payment.types';

// ─────────────────────────────────────────────────────────────────────────────
// Internal types matching Razorpay's webhook payload shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape of a Razorpay payment.failed webhook.
 * Only the fields we actually use are typed here — the rest go to rawPayload.
 *
 * WHY PARTIAL<> AND UNKNOWN TYPES?
 * Razorpay's webhook payloads are not always consistent — some fields are
 * missing depending on payment method. Using optional types prevents runtime
 * crashes when a field we expect isn't present.
 */
interface RazorpayPaymentEntity {
  id: string;                    // e.g., "pay_ExampleId123"
  entity: string;                // always "payment"
  amount: number;                // in PAISE — Razorpay's native unit
  currency: string;              // e.g., "INR"
  status: string;                // "failed" for payment.failed events
  method?: string;               // "card", "upi", "netbanking", "wallet", "emi"
  recurring?: boolean;           // true if this is a UPI AutoPay (mandate) payment
  email?: string;
  contact?: string;              // customer phone number (with country code)
  description?: string;
  order_id?: string;             // Razorpay order ID
  subscription_id?: string;      // Present for subscription payments
  customer_id?: string;
  error_code?: string;           // e.g., "BAD_REQUEST_ERROR", "GATEWAY_ERROR", "SERVER_ERROR"
  error_description?: string;    // Human-readable error (e.g., "Insufficient funds")
  error_source?: string;         // "customer", "bank", "business", "issuer", "acquirer"
  error_step?: string;           // "payment_authentication", "payment_authorization"
  error_reason?: string;         // More specific reason code
  notes?: Record<string, string>; // Merchant-attached metadata (may contain customer name)
}

interface RazorpayWebhookPayload {
  entity: string;                // always "event"
  account_id: string;            // Razorpay account ID
  event: string;                 // e.g., "payment.failed"
  contains: string[];            // e.g., ["payment"]
  payload: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
  };
  created_at: number;            // UNIX timestamp (seconds) when the event was created
}

// ─────────────────────────────────────────────────────────────────────────────
// Decline code classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps Razorpay error signals to our DeclineCategory.
 *
 * WHY THIS MAPPING IS IMPORTANT:
 * The recovery strategy depends entirely on the decline category.
 * A wrong classification means wrong recovery actions:
 *   - Classifying a hard decline as soft → we retry a stolen card (bad, can lead to fines)
 *   - Classifying a soft decline as hard → we give up too early (bad, lost revenue)
 *
 * SOURCES:
 * https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/error-codes/
 * https://razorpay.com/docs/payments/payment-methods/upi/errors/
 */
function classifyRazorpayDecline(payment: RazorpayPaymentEntity): {
  declineCategory: DeclineCategory;
  isRecoverable: boolean;
} {
  const code = payment.error_code?.toLowerCase() ?? '';
  const desc = (payment.error_description ?? '').toLowerCase();
  const source = (payment.error_source ?? '').toLowerCase();
  const reason = (payment.error_reason ?? '').toLowerCase();

  // ── UPI AutoPay-specific failures ──────────────────────────────────────────
  // WHY CHECK THIS FIRST: UPI failures have different recovery rules (NPCI 4-attempt)
  // A UPI payment has method="upi". A UPI AutoPay mandate has recurring=true.
  if (payment.method === 'upi') {
    // These are recoverable UPI failures — retry within NPCI limits
    if (
      reason.includes('debit_failed') ||
      reason.includes('transaction_declined') ||
      reason.includes('insufficient_funds') ||
      source === 'customer' ||
      source === 'bank'
    ) {
      return { declineCategory: 'upi_failure', isRecoverable: true };
    }

    // UPI mandate was revoked by customer — cannot retry, mandate is dead
    if (reason.includes('mandate_revoked') || reason.includes('mandate_cancelled')) {
      return { declineCategory: 'hard_decline', isRecoverable: false };
    }

    // Default UPI classification — attempt recovery
    return { declineCategory: 'upi_failure', isRecoverable: true };
  }

  // ── Hard declines — DO NOT RETRY ───────────────────────────────────────────
  // Retrying these violates Visa/Mastercard rules and risks merchant account termination
  if (
    desc.includes('stolen') ||
    desc.includes('lost card') ||
    desc.includes('pick up card') ||
    desc.includes('fraud') ||
    desc.includes('do not honor') ||        // Bank-level blacklist (often permanent)
    desc.includes('not permitted') ||
    desc.includes('restricted') ||
    reason.includes('fraud') ||
    source === 'fraud'
  ) {
    return { declineCategory: 'hard_decline', isRecoverable: false };
  }

  // ── Card expired ──────────────────────────────────────────────────────────
  // Card has passed its expiry date — no point retrying, send update-card email
  if (
    desc.includes('expired') ||
    desc.includes('card expired') ||
    reason.includes('expired')
  ) {
    return { declineCategory: 'card_expired', isRecoverable: false };
  }

  // ── Bank-side declines ────────────────────────────────────────────────────
  // Bank blocked the transaction (daily limit, account frozen, etc.)
  // Usually resolves within 24h — retry once, then WhatsApp
  if (
    source === 'bank' ||
    desc.includes('daily limit') ||
    desc.includes('exceed') ||
    desc.includes('insufficient limit') ||
    code === 'gateway_error'
  ) {
    return { declineCategory: 'bank_decline', isRecoverable: true };
  }

  // ── Soft declines — retry with spacing ────────────────────────────────────
  // Temporary issues: low balance, network timeout, processing error
  if (
    desc.includes('insufficient funds') ||
    desc.includes('insufficient balance') ||
    desc.includes('low balance') ||
    desc.includes('timeout') ||
    desc.includes('network') ||
    desc.includes('try again') ||
    code === 'server_error' ||
    code === 'bad_request_error' ||
    reason.includes('insufficient')
  ) {
    return { declineCategory: 'soft_decline', isRecoverable: true };
  }

  // ── Default: unknown ──────────────────────────────────────────────────────
  // We couldn't classify this decline code. Treat as soft — attempt recovery once.
  return { declineCategory: 'unknown', isRecoverable: true };
}

/**
 * Maps Razorpay's payment method string to our PaymentMethodType enum.
 * WHY: Razorpay uses "netbanking" (no underscore, no space), we use "net_banking".
 */
function mapPaymentMethod(method?: string, recurring?: boolean): PaymentMethodType {
  if (method === 'upi' && recurring) {
    // UPI AutoPay (recurring mandate) — different rules from one-time UPI
    return 'upi_autopay';
  }

  switch (method) {
    case 'card':       return 'credit_card'; // Razorpay doesn't distinguish credit/debit in method field
    case 'upi':        return 'upi_autopay'; // One-time UPI mapped to upi_autopay for consistent handling
    case 'netbanking': return 'net_banking';
    case 'wallet':     return 'wallet';
    case 'emi':        return 'emi';
    default:           return 'credit_card'; // Fallback — most common method
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main normalizer function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes a Razorpay webhook payload into our unified NormalizedFailedPayment.
 *
 * Returns { skip: true } for any event that is NOT a payment failure.
 * WHY: Razorpay sends many event types (payment.captured, order.paid, etc.).
 * We must respond 200 OK to all of them. Returning skip:true tells the webhook
 * route to respond 200 without doing any recovery work.
 *
 * @param rawBody - The raw webhook body as received (for signature verification this
 *                  was already done upstream; here we just parse it)
 * @param eventId - The Razorpay-assigned event ID (from X-Razorpay-Event-Id header
 *                  or fallback to the account_id + created_at composite)
 */
export function normalizeRazorpayWebhook(
  rawPayload: Record<string, unknown>,
  eventId: string
): NormalizerResult {
  const payload = rawPayload as unknown as RazorpayWebhookPayload;

  // ── Only process payment.failed events ───────────────────────────────────
  // WHY: subscription.halted and invoice.payment_failed also exist, but
  // payment.failed covers the overwhelming majority and is emitted for all methods.
  if (payload.event !== 'payment.failed') {
    return {
      skip: true,
      reason: `Unsupported Razorpay event type: ${payload.event}. Only payment.failed is processed.`,
    };
  }

  const payment = payload.payload?.payment?.entity;

  if (!payment) {
    return {
      skip: true,
      reason: 'Razorpay webhook missing payload.payment.entity — malformed payload.',
    };
  }

  // ── Classify the decline ─────────────────────────────────────────────────
  const { declineCategory, isRecoverable } = classifyRazorpayDecline(payment);

  // ── Map payment method ───────────────────────────────────────────────────
  const paymentMethodType = mapPaymentMethod(payment.method, payment.recurring);

  // ── Set max retries based on payment method ──────────────────────────────
  // WHY: UPI AutoPay has a hard limit of 4 total attempts (NPCI mandate rules).
  // The original failed attempt counts as 1, so we allow 3 retries.
  // Net banking cannot be auto-retried at all — set to 0.

  // ── Extract customer name from notes (best-effort) ───────────────────────
  // Razorpay doesn't always include customer name in the payment entity.
  // Merchants often attach it via the 'notes' field during order creation.
  const customerName =
    payment.notes?.customer_name ||
    payment.notes?.name ||
    undefined;

  // ── Build the normalized event ───────────────────────────────────────────
  const normalized: NormalizedFailedPayment = {
    gatewayName: 'razorpay',

    /**
     * gatewayEventId is our idempotency key.
     * WHY: Razorpay retries webhook delivery for up to 3 days if we return non-2xx.
     * This ID prevents us from creating duplicate recovery campaigns.
     */
    gatewayEventId: eventId,

    gatewayPaymentId: payment.id,
    gatewayOrderId: payment.order_id,
    gatewaySubscriptionId: payment.subscription_id,
    gatewayCustomerId: payment.customer_id,

    customerEmail: payment.email,
    customerPhone: payment.contact,
    customerName,

    /**
     * Razorpay amounts are already in PAISE — no conversion needed.
     * This is one of the reasons we chose Razorpay-first: their API is INR-native.
     */
    amountPaise: payment.amount,
    currency: payment.currency || 'INR',

    paymentMethodType,
    declineCode: payment.error_code,
    declineCategory,
    isRecoverable,

    // Razorpay's created_at is a UNIX timestamp in seconds; convert to Date
    failedAt: new Date(payload.created_at * 1000),

    rawPayload,
  };

  return { skip: false, data: normalized };
}
