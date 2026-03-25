/**
 * apps/worker/src/lib/retry-scheduler.ts
 *
 * Retry scheduling logic for the recovery worker.
 *
 * WHY DUPLICATED (not imported from apps/web)?
 * apps/web and apps/worker are separate applications — they should not import
 * from each other. Shared code belongs in packages/. This file is intentionally
 * identical to apps/web/lib/recovery/retry-scheduler.ts.
 *
 * TODO: Move getRetrySchedule to packages/shared so both apps import it from
 * one place. Deferred for MVP to keep the package lean.
 *
 * See apps/web/lib/recovery/retry-scheduler.ts for full comments explaining
 * the India-specific retry logic (NPCI rules, payday cycles, etc.).
 */

import type { DeclineCategory, PaymentMethodType } from '@fynback/shared';

export interface RetrySchedule {
  delayMs: number;
  scheduledAt: Date;
  reason: string;
}

const HOURS_MS = (h: number) => h * 60 * 60 * 1000;
const DAYS_MS = (d: number) => d * 24 * 60 * 60 * 1000;

// IST = UTC + 5:30 = UTC + 330 minutes
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Indian payday windows: days 1-7 (post-salary) and 25-28 (pre-month)
const PAYDAY_WINDOW_DAYS = [1, 2, 3, 4, 5, 6, 7];
const PRE_MONTH_WINDOW_DAYS = [25, 26, 27, 28];
const OPTIMAL_RETRY_HOUR_IST = 10; // 10am IST

function isInPaydayWindow(utcDate: Date): boolean {
  const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
  const dayOfMonth = istDate.getUTCDate();
  return PAYDAY_WINDOW_DAYS.includes(dayOfMonth) || PRE_MONTH_WINDOW_DAYS.includes(dayOfMonth);
}

function getNextPaydayWindowDate(fromUtc: Date): Date {
  const checkDate = new Date(fromUtc.getTime() + IST_OFFSET_MS);
  checkDate.setUTCDate(checkDate.getUTCDate() + 1);
  checkDate.setUTCHours(OPTIMAL_RETRY_HOUR_IST - 5, 30, 0, 0); // 10am IST = 4:30am UTC

  for (let i = 0; i < 40; i++) {
    const dayOfMonth = checkDate.getUTCDate();
    if (PAYDAY_WINDOW_DAYS.includes(dayOfMonth) || PRE_MONTH_WINDOW_DAYS.includes(dayOfMonth)) {
      return new Date(checkDate.getTime() - IST_OFFSET_MS);
    }
    checkDate.setUTCDate(checkDate.getUTCDate() + 1);
  }
  return new Date(fromUtc.getTime() + DAYS_MS(7));
}

export function getRetrySchedule(
  paymentMethodType: PaymentMethodType | string,
  declineCategory: DeclineCategory | string,
  attemptNumber: number,
  fromDate: Date = new Date()
): RetrySchedule {
  if (paymentMethodType === 'net_banking') {
    return { delayMs: 0, scheduledAt: fromDate, reason: 'Net banking cannot be auto-retried.' };
  }
  if (declineCategory === 'hard_decline' || declineCategory === 'card_expired') {
    return { delayMs: 0, scheduledAt: fromDate, reason: `${declineCategory} — no retry.` };
  }
  if (paymentMethodType === 'upi_autopay') {
    return getUpiRetrySchedule(attemptNumber, fromDate);
  }
  return getCardRetrySchedule(declineCategory as DeclineCategory, attemptNumber, fromDate);
}

function getUpiRetrySchedule(attemptNumber: number, fromDate: Date): RetrySchedule {
  switch (attemptNumber) {
    case 1:
      return { delayMs: HOURS_MS(24), scheduledAt: new Date(fromDate.getTime() + HOURS_MS(24)), reason: 'UPI retry 1: +24h' };
    case 2: {
      const paydayDate = getNextPaydayWindowDate(fromDate);
      const delayMs = Math.max(paydayDate.getTime() - fromDate.getTime(), HOURS_MS(48));
      return { delayMs, scheduledAt: paydayDate, reason: `UPI retry 2: payday window ${paydayDate.toISOString()}` };
    }
    case 3: {
      const sevenDaysLater = new Date(fromDate.getTime() + DAYS_MS(7));
      const paydayAfterWeek = getNextPaydayWindowDate(sevenDaysLater);
      const finalDate = paydayAfterWeek > sevenDaysLater ? paydayAfterWeek : sevenDaysLater;
      return { delayMs: finalDate.getTime() - fromDate.getTime(), scheduledAt: finalDate, reason: 'UPI retry 3 (final)' };
    }
    default:
      return { delayMs: 0, scheduledAt: fromDate, reason: 'UPI: NPCI 4-attempt rule exhausted.' };
  }
}

function getCardRetrySchedule(declineCategory: DeclineCategory, attemptNumber: number, fromDate: Date): RetrySchedule {
  if (declineCategory === 'bank_decline') {
    const delay = HOURS_MS(24) * attemptNumber;
    return { delayMs: delay, scheduledAt: new Date(fromDate.getTime() + delay), reason: `Bank decline retry ${attemptNumber}: +${attemptNumber * 24}h` };
  }
  switch (attemptNumber) {
    case 1:
      return { delayMs: HOURS_MS(3), scheduledAt: new Date(fromDate.getTime() + HOURS_MS(3)), reason: 'Card retry 1: +3h' };
    case 2:
      return { delayMs: HOURS_MS(24), scheduledAt: new Date(fromDate.getTime() + HOURS_MS(24)), reason: 'Card retry 2: +24h' };
    case 3: {
      const threeDaysLater = new Date(fromDate.getTime() + DAYS_MS(3));
      if (!isInPaydayWindow(threeDaysLater)) {
        const paydayDate = getNextPaydayWindowDate(fromDate);
        return { delayMs: paydayDate.getTime() - fromDate.getTime(), scheduledAt: paydayDate, reason: `Card retry 3: pushed to payday window` };
      }
      return { delayMs: DAYS_MS(3), scheduledAt: threeDaysLater, reason: 'Card retry 3: +72h' };
    }
    default:
      return { delayMs: 0, scheduledAt: fromDate, reason: 'Card: max retries exhausted.' };
  }
}
