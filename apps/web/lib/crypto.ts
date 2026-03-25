/**
 * lib/crypto.ts
 *
 * AES-256-GCM encrypt/decrypt for API keys stored in the database.
 * WHY GCM: authenticated encryption — detects tampering, no padding oracle.
 * WHY NOT @fynback/crypto: that package uses CryptoJS (browser-compatible AES-CBC)
 * and has a TS compilation issue with @fynback/shared. Node's built-in crypto is
 * faster and available server-side only.
 *
 * Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

import crypto from 'crypto';

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET ?? 'dev-only-secret-must-change-prod!';
  // Always 32 bytes — pad or truncate
  return Buffer.from(secret.padEnd(32, '0').substring(0, 32), 'utf8');
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}
