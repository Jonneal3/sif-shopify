import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyShopifyCallbackHmac } from '@/lib/crypto';
import { exchangeAccessToken, fetchShopDetails, registerUninstallWebhook } from '@/lib/shopify';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const shop = params.get('shop');
  const code = params.get('code');
  const state = params.get('state');
  const host = params.get('host');

  if (!shop || !code || !state) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
  }

  const stateCookie = cookies().get('shopify_oauth_state')?.value;
  if (!stateCookie || stateCookie !== state) {
    console.warn('[shopify_auth_callback] state_mismatch', { shop, hasStateCookie: Boolean(stateCookie) });
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
  }

  // Verify HMAC
  if (!verifyShopifyCallbackHmac(params)) {
    console.warn('[shopify_auth_callback] invalid_hmac', { shop });
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 400 });
  }

  try {
    console.log('[shopify_auth_callback] exchanging_token_start', { shop });
    const { access_token } = await exchangeAccessToken(shop, code);
    console.log('[shopify_auth_callback] exchanging_token_success', { shop });

    console.log('[shopify_auth_callback] fetch_shop_start', { shop });
    const shopDetails = await fetchShopDetails(shop, access_token);
    console.log('[shopify_auth_callback] fetch_shop_success', { shop, shopId: String(shopDetails.id) });

    // Upsert to Supabase
    const supabase = getSupabaseServiceClient();
    console.log('[shopify_auth_callback] upsert_store_start', { shop, shopId: String(shopDetails.id) });
    const { error } = await supabase
      .from('shopify_stores')
      .upsert({
        store_domain: shop,
        shop_id: String(shopDetails.id),
        shop_name: shopDetails.name ?? null,
        shop_owner_email: shopDetails.email ?? null,
        access_token,
      }, { onConflict: 'store_domain' });
    if (error) throw error;
    console.log('[shopify_auth_callback] upsert_store_success', { shop, shopId: String(shopDetails.id) });

    // Register webhook (best-effort)
    try {
      console.log('[shopify_auth_callback] register_webhook_start', { shop });
      await registerUninstallWebhook(shop, access_token);
      console.log('[shopify_auth_callback] register_webhook_success', { shop });
    } catch (e) {
      console.warn('[shopify_auth_callback] register_webhook_failed', { shop, message: (e as any)?.message });
    }

    const qp = new URLSearchParams();
    qp.set('shop', shop);
    if (host) qp.set('host', host);
    const redirectUrl = `${process.env.SHOPIFY_APP_URL}/?${qp.toString()}`;
    console.log('[shopify_auth_callback] redirect_success', { shop, redirectUrl });
    return NextResponse.redirect(redirectUrl);
  } catch (e: any) {
    const safeMessage = e?.message ? String(e.message).slice(0, 200) : 'Auth callback failed';
    console.error('[shopify_auth_callback] error', { shop, message: safeMessage });
    // Prefer redirect back to app with an error indicator for better UX in embedded flows
    try {
      const qp = new URLSearchParams();
      if (shop) qp.set('shop', shop);
      if (host) qp.set('host', host!);
      qp.set('error', 'shopify_auth_failed');
      qp.set('error_message', safeMessage);
      const redirectUrl = `${process.env.SHOPIFY_APP_URL}/?${qp.toString()}`;
      return NextResponse.redirect(redirectUrl);
    } catch {
      return NextResponse.json({ error: safeMessage }, { status: 500 });
    }
  }
}

