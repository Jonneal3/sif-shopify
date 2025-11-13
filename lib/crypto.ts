import crypto from 'node:crypto';

export function generateState(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function verifyShopifyCallbackHmac(urlSearchParams: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_API_SECRET as string;
  if (!secret) throw new Error('SHOPIFY_API_SECRET missing');

  const hmac = urlSearchParams.get('hmac');
  if (!hmac) return false;

  const message = Array.from(urlSearchParams.entries())
    .filter(([key]) => key !== 'hmac' && key !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  const computed = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(computed, 'utf-8'), Buffer.from(hmac, 'utf-8'));
}

export async function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | null): Promise<boolean> {
  if (!hmacHeader) return false;
  const secret = process.env.SHOPIFY_API_SECRET as string;
  if (!secret) throw new Error('SHOPIFY_API_SECRET missing');
  const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

