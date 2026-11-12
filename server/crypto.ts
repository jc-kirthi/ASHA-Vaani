import crypto from 'crypto';

/**
 * Encrypts and decrypts visit records using the ENCRYPTION_KEY.
 * Compatible with AES-256-GCM authenticated encryption.
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || 'default-secret-encryption-key-32';
  // Derive a 32-byte key using SHA-256
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptPayload(data: string | object): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

export function decryptPayload(token: string): string {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format');
    }
    const [ivB64, authTagB64, encryptedText] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const key = getKey();

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
}
