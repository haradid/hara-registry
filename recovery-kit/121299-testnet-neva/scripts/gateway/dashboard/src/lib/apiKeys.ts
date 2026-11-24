import crypto from 'crypto';

export function generateApiKey(): string {
  return `hara_live_${crypto.randomBytes(16).toString('hex')}`;
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function apiKeyPrefix(key: string): string {
  return key.slice(0, 14);
}
