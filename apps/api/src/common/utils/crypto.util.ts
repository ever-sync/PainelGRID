import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// Derives a 32-byte key from any input secret using SHA-256
function getEncryptionKey(secret?: string): Buffer {
  const keyStr = secret || 'leadflow_fallback_encryption_secret_key_32';
  return createHash('sha256').update(keyStr).digest();
}

// Deterministic IV to allow querying by encrypted token value while keeping database breach protection
const STATIC_IV = Buffer.alloc(16);

/**
 * Encrypts a raw token string (hex format) deterministically using AES-256-CTR.
 * Returns a 24-character hex string.
 */
export function encryptCheckinToken(rawTokenHex: string, secret?: string): string {
  const key = getEncryptionKey(secret);
  const cipher = createCipheriv('aes-256-ctr', key, STATIC_IV);
  const plaintext = Buffer.from(rawTokenHex, 'hex');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return ciphertext.toString('hex');
}

/**
 * Decrypts a stored token string (24-character hex string) back to raw token (hex format).
 */
export function decryptCheckinToken(storedTokenHex: string, secret?: string): string {
  // If not valid hex or incorrect length, it might be legacy or invalid
  if (!storedTokenHex || storedTokenHex.length !== 24 || !/^[0-9a-fA-F]+$/.test(storedTokenHex)) {
    return storedTokenHex;
  }
  const key = getEncryptionKey(secret);
  const decipher = createDecipheriv('aes-256-ctr', key, STATIC_IV);
  const ciphertext = Buffer.from(storedTokenHex, 'hex');
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('hex');
}

/**
 * Generates a raw token: 12 random bytes as a 24-character hex string.
 */
export function generateRawCheckinToken(): string {
  return randomBytes(12).toString('hex');
}

/**
 * Token opaco do link publico de avaliacao (permanente, 1:1 com o vendedor).
 * Sem criptografia/claims: diferente do voucher de check-in, nao precisa expirar.
 */
export function generateRatingToken(): string {
  return randomBytes(16).toString('hex');
}
