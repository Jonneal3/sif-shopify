import { URLSearchParams } from 'node:url';

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-07';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function buildAuthUrl(shop: string, state: string) {
  const clientId = requireEnv('SHOPIFY_API_KEY');
  const appUrl = requireEnv('SHOPIFY_APP_URL');
  const redirectUri = `${appUrl}/api/auth/callback`;
  const scopes = requireEnv('SHOPIFY_SCOPES');

  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });
  const url = `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  return url;
}

export async function exchangeAccessToken(shop: string, code: string): Promise<{ access_token: string; scope: string; }> {
  const clientId = requireEnv('SHOPIFY_API_KEY');
  const clientSecret = requireEnv('SHOPIFY_API_SECRET');
  const body = { client_id: clientId, client_secret: clientSecret, code };
  const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

export async function fetchShopDetails(shop: string, accessToken: string): Promise<{ id: number; name: string; email: string | null; domain: string; myshopify_domain: string; }>
{
  const resp = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`fetchShopDetails failed: ${resp.status} ${text}`);
  }
  const json = await resp.json();
  return json.shop;
}

export async function registerUninstallWebhook(shop: string, accessToken: string) {
  const appUrl = requireEnv('SHOPIFY_APP_URL');
  const address = `${appUrl}/api/webhooks`;
  const payload = {
    webhook: {
      topic: 'app/uninstalled',
      address,
      format: 'json',
    },
  };
  const resp = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    // Not fatal; log only
    console.warn('registerUninstallWebhook failed', await resp.text());
  }
}

export async function fetchProducts(shop: string, accessToken: string) {
  const resp = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=25`, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`fetchProducts failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

