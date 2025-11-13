import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhookHmac } from '@/lib/crypto';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  const hmac = req.headers.get('x-shopify-hmac-sha256');
  const topic = req.headers.get('x-shopify-topic');
  const shopDomain = req.headers.get('x-shopify-shop-domain');
  const rawBody = await req.text();

  const valid = await verifyShopifyWebhookHmac(rawBody, hmac);
  if (!valid) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (topic === 'app/uninstalled' && shopDomain) {
    const supabase = getSupabaseServiceClient();
    await supabase.from('shopify_stores').delete().eq('store_domain', shopDomain);
  }

  return new NextResponse(null, { status: 200 });
}

