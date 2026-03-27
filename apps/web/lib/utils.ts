import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Resolves the best available customer identifier for display.
 *
 * Priority: real email → phone number → fallback string.
 *
 * WHY CHECK void@razorpay.com: Razorpay substitutes this placeholder when
 * a customer has no email on file. The webhook normalizer now sanitizes it
 * to null before storing, but historical records may still contain it.
 * Checking here ensures both old and new records display correctly.
 */
const RAZORPAY_VOID_EMAIL = 'void@razorpay.com';

export function resolveCustomerDisplay(
  email: string | null | undefined,
  phone: string | null | undefined,
  fallback = 'No contact info'
): string {
  if (email && email !== RAZORPAY_VOID_EMAIL) return email;
  if (phone) return phone;
  return fallback;
}
