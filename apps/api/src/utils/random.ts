import crypto from 'crypto';

/**
 * Generate random string
 */
export function randomString(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate random numeric string
 */
export function randomNumeric(length: number = 6): string {
  const digits = '0123456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += digits[bytes[i] % 10];
  }
  return result;
}