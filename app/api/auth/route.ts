import { NextRequest, NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/shopify';
import { generateState } from '@/lib/crypto';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shop = searchParams.get('shop');
  if (!shop || !shop.endsWith('.myshopify.com')) {
    return NextResponse.json({ error: 'Missing or invalid shop param' }, { status: 400 });
  }
  const state = generateState();
  const sameSiteEnv = (process.env.SHOPIFY_OAUTH_SAMESITE || 'none').toLowerCase();
  const sameSite = (['lax', 'strict', 'none'].includes(sameSiteEnv) ? sameSiteEnv : 'none') as 'lax' | 'strict' | 'none';
  const secure = (process.env.SHOPIFY_OAUTH_SECURE || 'true').toLowerCase() !== 'false';
  cookies().set('shopify_oauth_state', state, { httpOnly: true, secure, sameSite, path: '/' });
  const url = buildAuthUrl(shop, state);
  return NextResponse.redirect(url);
}

