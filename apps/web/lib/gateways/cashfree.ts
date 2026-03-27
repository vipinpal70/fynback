/**
 * lib/gateways/cashfree.ts
 *
 * Thin utilities for Cashfree gateway credential handling.
 *
 * CASHFREE TEST KEY PATTERNS (confirmed from official sandbox credentials):
 *   API key:    starts with "TEST"   
 *   Secret key: contains "_test_"   
 *
 * Live keys use numeric merchant IDs (no "TEST" prefix) and
 * secrets with "_prod_" or no environment segment.
 */

/**
 * Returns true if either the API key or the secret key is a Cashfree sandbox credential.
 * Both are checked because a misconfigured merchant could mix live/test keys.
 */
export function isTestKey(apiKey: string, apiSecret: string): boolean {
  return apiKey.startsWith('TEST') || apiSecret.includes('_test_');
}
