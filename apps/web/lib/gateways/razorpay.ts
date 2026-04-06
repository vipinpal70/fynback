/**
 * lib/gateways/razorpay.ts
 *
 * Thin wrapper around Razorpay REST API v1.
 * Used by the gateway connect flow and historical sync.
 * WHY NOT use the razorpay npm package: it requires Node.js HTTP internals
 * that conflict with Next.js edge runtime. fetch() works cleanly everywhere.
 */

const BASE = 'https://api.razorpay.com/v1';

function authHeader(key: string, secret: string): string {
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
}

export function isTestKey(key: string): boolean {
  return key.startsWith('rzp_test_');
}

/** Validate credentials by making a real API call (count=1 is the lightest possible). */
export async function validateCredentials(key: string, secret: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const r = await fetch(`${BASE}/payments?count=1`, {
      headers: { Authorization: authHeader(key, secret) },
    });
    if (r.status === 200) return { valid: true };
    if (r.status === 401) return { valid: false, error: 'Invalid API key or secret' };
    return { valid: false, error: `Gateway returned ${r.status}` };
  } catch (err) {
    return { valid: false, error: 'Could not reach Razorpay API' };
  }
}

/** Auto-registers the FynBack webhook with the merchant's Razorpay account. */
export async function registerWebhook(
  key: string,
  secret: string,
  webhookUrl: string,
  webhookSecret: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const r = await fetch(`${BASE}/webhooks`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(key, secret),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        alert_email: '',
        secret: webhookSecret,
        active: true,
        events: {
          'payment.failed': true,
          'subscription.paused': true,
          'subscription.halted': true,
          'subscription.cancelled': true,
          'payment_link.partially_paid': true,
          'payment_link.expired': true,
          'payment_link.cancelled': true,
        },
      }),
    });
    if (r.ok) return { success: true };
    const errBody = await r.json().catch(() => ({}));
    return { success: false, error: errBody.error?.description || `Gateway returned ${r.status}` };
  } catch (err) {
    return { success: false, error: 'Could not reach Razorpay API' };
  }
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  subscription_id: string | null;
  customer_id: string | null;
  email: string | null;
  contact: string | null;
  amount: number;        // paise
  currency: string;
  method: string;
  card?: { type?: string; network?: string; issuer?: string };
  bank?: string;
  wallet?: string;
  status: string;        // 'failed' | 'captured' | 'authorized' | ...
  error_code: string | null;
  error_description: string | null;
  error_reason: string | null;
  error_source: string | null;
  error_step: string | null;
  created_at: number;    // Unix timestamp
  description: string | null;
  notes: Record<string, string>;
}

/**
 * Fetch ALL payments in a time range, paginating automatically.
 * Returns only failed ones to save processing time.
 */
export async function fetchFailedPayments(
  key: string,
  secret: string,
  fromTs: number,
  toTs: number,
  maxPages = 20  // safety cap — 20 × 100 = 2000 payments per sync
): Promise<RazorpayPayment[]> {
  const auth = authHeader(key, secret);
  const failed: RazorpayPayment[] = [];
  let skip = 0;
  const count = 100;

  for (let page = 0; page < maxPages; page++) {
    const url = `${BASE}/payments?count=${count}&from=${fromTs}&to=${toTs}&skip=${skip}`;
    const r = await fetch(url, { headers: { Authorization: auth } });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      throw new Error(`Razorpay API error ${r.status} on page ${page + 1}: ${errText}`);
    }

    const body = await r.json();
    const items: RazorpayPayment[] = body.items ?? [];

    for (const p of items) {
      if (p.status === 'failed') failed.push(p);
    }

    if (items.length < count) break; // last page — we're done
    skip += count;
  }

  return failed;
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

export type DeclineCategory =
  | 'soft_decline'
  | 'hard_decline'
  | 'card_expired'
  | 'upi_failure'
  | 'bank_decline'
  | 'unknown';

export type PaymentMethodType =
  | 'credit_card'
  | 'debit_card'
  | 'upi_autopay'
  | 'net_banking'
  | 'wallet'
  | 'emi';

export function categorizeDecline(p: RazorpayPayment): DeclineCategory {
  const reason = (p.error_reason ?? '').toLowerCase();
  const code = (p.error_code ?? '').toLowerCase();
  const desc = (p.error_description ?? '').toLowerCase();

  if (desc.includes('expired') || code.includes('expired') || reason.includes('expired')) {
    return 'card_expired';
  }
  if (p.method === 'upi' || reason.includes('upi') || code.includes('upi')) {
    return 'upi_failure';
  }
  if (p.method === 'netbanking' || p.error_source === 'bank' || reason.includes('bank')) {
    return 'bank_decline';
  }
  if (
    reason.includes('cancelled') ||
    reason.includes('timeout') ||
    reason.includes('insufficient') ||
    code === 'payment_cancelled' ||
    code === 'insufficient_funds' ||
    code === 'limit_exceeded'
  ) {
    return 'soft_decline';
  }
  if (
    reason.includes('do_not_honor') ||
    reason.includes('invalid') ||
    code.includes('invalid') ||
    code === 'card_velocity_exceeded'
  ) {
    return 'hard_decline';
  }
  return 'unknown';
}

export function mapPaymentMethod(p: RazorpayPayment): PaymentMethodType {
  switch (p.method) {
    case 'card':
      return p.card?.type === 'debit' ? 'debit_card' : 'credit_card';
    case 'upi':
      return 'upi_autopay';
    case 'netbanking':
      return 'net_banking';
    case 'wallet':
      return 'wallet';
    case 'emi':
      return 'emi';
    default:
      return 'credit_card';
  }
}
