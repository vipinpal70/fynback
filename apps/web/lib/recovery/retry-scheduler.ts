/**
 * lib/recovery/retry-scheduler.ts
 *
 * Calculates the optimal time to retry a failed payment.
 *
 * WHY THIS IS CRITICAL FOR INDIA:
 * Indian payment recovery is fundamentally different from global dunning tools.
 * Three factors dominate recovery rates in India:
 *
 * 1. PAYDAY CYCLES: Indian salaries are credited on the 1st–7th of the month.
 *    Many companies pay on the 1st, others by the 7th. Retrying on the 3rd or 4th
 *    of the month catches the vast majority of salary credits. A retry on the 15th
 *    (mid-month) is the worst time — bank balances are at their lowest.
 *
 * 2. NPCI 4-ATTEMPT RULE: For UPI AutoPay mandates, NPCI (National Payments
 *    Corporation of India) enforces a hard limit of 4 total debit attempts per
 *    payment cycle (billing period). This includes the original failed attempt.
 *    If we use all 4 attempts carelessly (e.g., retry every hour), we exhaust
 *    the quota on a low-balance day and lose the mandate permanently.
 *    Strategy: Space UPI retries to hit the payday window.
 *
 * 3. BANK CUTOVER TIMES: Indian banks process settlements in batches:
 *    - IMPS/UPI: Real-time, but bank risk engines reset at midnight
 *    - NEFT: Hourly batches between 8am-7pm IST
 *    - Bank-side "daily limit" errors reset at midnight IST (18:30 UTC)
 *    Retrying after 12:30am IST (18:30 UTC previous day) catches fresh daily limits.
 *
 * RETRY WINDOWS (by payment method):
 *
 * Card (credit/debit):
 *   Attempt 1: +3 hours (catches network/technical errors)
 *   Attempt 2: +24 hours (catches daily limit resets)
 *   Attempt 3: +72 hours OR next payday window (whichever is sooner in a good window)
 *
 * UPI AutoPay (NPCI 4-attempt rule — 3 retries max):
 *   Attempt 1: +24 hours (bank balance usually updates next day)
 *   Attempt 2: Next payday window (1st-7th or 25th-28th)
 *   Attempt 3: Last payday day before billing cutoff
 *
 * Net Banking:
 *   No retry — must use payment link.
 */

import type { DeclineCategory, PaymentMethodType } from '@fynback/shared';

/**
 * The result of scheduling a retry.
 * delayMs is the number of milliseconds to delay the BullMQ job.
 */
export interface RetrySchedule {
  delayMs: number;        // How long to delay the BullMQ job (in milliseconds)
  scheduledAt: Date;      // The absolute timestamp when the retry should run
  reason: string;         // Human-readable explanation (for logging/debugging)
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HOURS_MS = (h: number) => h * 60 * 60 * 1000;
const DAYS_MS = (d: number) => d * 24 * 60 * 60 * 1000;

/**
 * IST offset from UTC: +5:30 = 5.5 hours = 330 minutes.
 * WHY: All Indian payday logic operates in IST. We convert from UTC to IST
 * to check which day of month it is in India.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Best retry windows (Indian payday cycles — IST day of month ranges).
 *
 * PRIMARY WINDOW: Days 1-7 (post-salary credit, most bank balances full)
 * SECONDARY WINDOW: Days 25-28 (advance salary, pre-month financial planning)
 * AVOID: Days 10-20 (mid-month, lowest average bank balances)
 */
const PAYDAY_WINDOW_DAYS = [1, 2, 3, 4, 5, 6, 7];        // Best window
const PRE_MONTH_WINDOW_DAYS = [25, 26, 27, 28];            // Second best
const OPTIMAL_RETRY_HOUR_IST = 10;                         // 10am IST — banks fully open, people active

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Check if a date is in a payday window
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if a given UTC timestamp falls within a good Indian payday retry window.
 * Converts to IST first to check the Indian calendar day.
 */
function isInPaydayWindow(utcDate: Date): boolean {
  // Convert UTC to IST
  const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
  const dayOfMonth = istDate.getUTCDate(); // Use getUTCDate() since we manually offset

  return (
    PAYDAY_WINDOW_DAYS.includes(dayOfMonth) ||
    PRE_MONTH_WINDOW_DAYS.includes(dayOfMonth)
  );
}

/**
 * Finds the next payday window date from a given UTC timestamp.
 * Returns a Date object set to 10am IST on the next good retry day.
 *
 * WHY 10am IST?
 * - Banks are fully open (8am opens, 10am is when most credits are processed)
 * - People have checked their balances (post-morning routine)
 * - Not too early to seem aggressive, not so late they've already spent the money
 */
function getNextPaydayWindowDate(fromUtc: Date): Date {
  // Convert to IST to work with Indian calendar days
  const istNow = new Date(fromUtc.getTime() + IST_OFFSET_MS);

  // Start checking from tomorrow (can't retry same day — too soon)
  const checkDate = new Date(istNow);
  checkDate.setUTCDate(checkDate.getUTCDate() + 1);
  checkDate.setUTCHours(OPTIMAL_RETRY_HOUR_IST - 5, 30, 0, 0); // 10am IST = 4:30am UTC

  // Search forward up to 40 days to find the next payday window
  for (let i = 0; i < 40; i++) {
    const dayOfMonth = checkDate.getUTCDate();
    if (PAYDAY_WINDOW_DAYS.includes(dayOfMonth) || PRE_MONTH_WINDOW_DAYS.includes(dayOfMonth)) {
      // Convert back to UTC
      return new Date(checkDate.getTime() - IST_OFFSET_MS);
    }
    checkDate.setUTCDate(checkDate.getUTCDate() + 1);
  }

  // Fallback: return 7 days from now (shouldn't happen but TypeScript needs a return)
  return new Date(fromUtc.getTime() + DAYS_MS(7));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scheduler function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates the optimal retry delay for a failed payment.
 *
 * @param paymentMethodType - How the customer was being charged
 * @param declineCategory   - Why the payment failed (drives retry timing)
 * @param attemptNumber     - Which retry attempt this is (1-indexed)
 * @param fromDate          - Current time (used as the base for delay calculation)
 */
export function getRetrySchedule(
  paymentMethodType: PaymentMethodType | string,
  declineCategory: DeclineCategory | string,
  attemptNumber: number,
  fromDate: Date = new Date()
): RetrySchedule {

  // ── Net banking: no auto-retry possible ─────────────────────────────────
  // Net banking is a redirect-based flow — the customer must initiate manually.
  // Auto-retry has no mechanism to work here.
  if (paymentMethodType === 'net_banking') {
    return {
      delayMs: 0,
      scheduledAt: fromDate,
      reason: 'Net banking cannot be auto-retried. Sending payment link email immediately.',
    };
  }

  // ── Hard decline: no retry ───────────────────────────────────────────────
  // Hard declines (stolen card, fraud) should never be retried.
  // This is a safety net — the webhook route should have already caught this.
  if (declineCategory === 'hard_decline') {
    return {
      delayMs: 0,
      scheduledAt: fromDate,
      reason: 'Hard decline — no auto-retry. Sending update-card link email immediately.',
    };
  }

  // ── Card expired: no retry ───────────────────────────────────────────────
  if (declineCategory === 'card_expired') {
    return {
      delayMs: 0,
      scheduledAt: fromDate,
      reason: 'Card expired — no auto-retry. Sending card-update email immediately.',
    };
  }

  // ── UPI AutoPay: payday-window aligned retries ────────────────────────────
  if (paymentMethodType === 'upi_autopay') {
    return getUpiRetrySchedule(attemptNumber, fromDate);
  }

  // ── Cards (credit/debit) and wallets: standard retry ladder ──────────────
  return getCardRetrySchedule(declineCategory as DeclineCategory, attemptNumber, fromDate);
}

// ─────────────────────────────────────────────────────────────────────────────
// UPI AutoPay retry schedule (NPCI 4-attempt rule)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UPI AutoPay retry timing respects NPCI's 4-attempt rule.
 *
 * NPCI RULE: A UPI AutoPay mandate allows at most 4 total debit attempts per
 * payment cycle. The original failed attempt counts as 1. We have 3 retries.
 *
 * STRATEGY:
 *   Retry 1 (+24h): Catches same-day liquidity issues (timing of salary credit)
 *   Retry 2 (next payday window): Best chance of success — align with salary
 *   Retry 3 (last payday day before period ends): Final attempt before giving up
 *
 * WHY NOT RETRY FASTER?
 * If we burn all 4 attempts in 3 hours, we lose the mandate permanently.
 * Better to space them strategically and maximize each attempt's success probability.
 */
function getUpiRetrySchedule(attemptNumber: number, fromDate: Date): RetrySchedule {
  switch (attemptNumber) {
    case 1:
      // Wait 24 hours — bank credits often process overnight
      return {
        delayMs: HOURS_MS(24),
        scheduledAt: new Date(fromDate.getTime() + HOURS_MS(24)),
        reason: 'UPI retry 1: +24h — bank credit often processes overnight.',
      };

    case 2: {
      // Next payday window — highest success probability
      const paydayDate = getNextPaydayWindowDate(fromDate);
      const delayMs = paydayDate.getTime() - fromDate.getTime();
      return {
        delayMs: Math.max(delayMs, HOURS_MS(48)), // Minimum 48h between attempts
        scheduledAt: paydayDate,
        reason: `UPI retry 2: Aligned with next Indian payday window (${paydayDate.toISOString()}).`,
      };
    }

    case 3: {
      // Last attempt — 7 days after the failure or next payday window (whichever is later)
      const sevenDaysLater = new Date(fromDate.getTime() + DAYS_MS(7));
      const paydayAfterWeek = getNextPaydayWindowDate(sevenDaysLater);
      const finalDate = paydayAfterWeek > sevenDaysLater ? paydayAfterWeek : sevenDaysLater;
      return {
        delayMs: finalDate.getTime() - fromDate.getTime(),
        scheduledAt: finalDate,
        reason: 'UPI retry 3 (final): Last attempt before mandate expires.',
      };
    }

    default:
      // Beyond 3 retries: NPCI rule exhausted — should not reach here
      return {
        delayMs: 0,
        scheduledAt: fromDate,
        reason: 'UPI: Max retries (NPCI 4-attempt rule) exhausted. Escalating to email.',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Card retry schedule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Card payment retry ladder.
 *
 * Decline-category aware:
 *   - soft_decline + unknown → standard spacing (3h, 24h, 72h)
 *   - bank_decline → wait 24h (bank's daily limits reset overnight)
 *
 * Payday optimization: If attempt 3 would land in the mid-month dead zone
 * (days 10-20), push it to the next payday window instead.
 */
function getCardRetrySchedule(
  declineCategory: DeclineCategory,
  attemptNumber: number,
  fromDate: Date
): RetrySchedule {

  // Bank declines: wait for bank daily limits to reset (24h)
  if (declineCategory === 'bank_decline') {
    const delay = HOURS_MS(24) * attemptNumber; // 24h, 48h, 72h
    return {
      delayMs: delay,
      scheduledAt: new Date(fromDate.getTime() + delay),
      reason: `Bank decline retry ${attemptNumber}: +${attemptNumber * 24}h (daily limit reset).`,
    };
  }

  // Standard soft decline / unknown decline retry ladder
  switch (attemptNumber) {
    case 1:
      // 3 hours: catches transient network errors and brief insufficient-fund situations
      return {
        delayMs: HOURS_MS(3),
        scheduledAt: new Date(fromDate.getTime() + HOURS_MS(3)),
        reason: 'Card retry 1: +3h — catches transient network errors and brief low-balance.',
      };

    case 2:
      // 24 hours: catches "will deposit salary tomorrow" situations
      return {
        delayMs: HOURS_MS(24),
        scheduledAt: new Date(fromDate.getTime() + HOURS_MS(24)),
        reason: 'Card retry 2: +24h — catches next-day salary/transfer credits.',
      };

    case 3: {
      // 72 hours base, but push to payday window if mid-month
      const threeDaysLater = new Date(fromDate.getTime() + DAYS_MS(3));

      if (!isInPaydayWindow(threeDaysLater)) {
        // 72h would land in mid-month dead zone — push to next payday window
        const paydayDate = getNextPaydayWindowDate(fromDate);
        return {
          delayMs: paydayDate.getTime() - fromDate.getTime(),
          scheduledAt: paydayDate,
          reason: `Card retry 3: Pushed to payday window (${paydayDate.toISOString()}) to maximize success.`,
        };
      }

      return {
        delayMs: DAYS_MS(3),
        scheduledAt: threeDaysLater,
        reason: 'Card retry 3: +72h — final attempt before escalating to email sequence.',
      };
    }

    default:
      // Beyond max retries
      return {
        delayMs: 0,
        scheduledAt: fromDate,
        reason: 'Card: Max retries exhausted. Escalating to email sequence.',
      };
  }
}
