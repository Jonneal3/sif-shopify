import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

async function shopifyGet(shop: string, token: string, path: string) {
  const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}${path}`, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`${path} failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get('shop');
    if (!shop) return NextResponse.json({ error: 'Missing shop' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('access_token')
      .eq('store_domain', shop)
      .maybeSingle();
    if (error) throw error;
    const token = store?.access_token as string | undefined;
    if (!token) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const themes = await shopifyGet(shop, token, '/themes.json');
    return NextResponse.json({ ok: true, themes: themes?.themes || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to list themes' }, { status: 500 });
  }
}


