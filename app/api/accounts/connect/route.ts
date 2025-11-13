import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

type ConnectBody = {
  account_id?: string;
  shop?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ConnectBody;
    const accountId = body.account_id;
    const shop = body.shop;
    if (!accountId || !shop) {
      return NextResponse.json({ error: 'Missing account_id or shop' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();

    // Find target shopify_store id
    const { data: store, error: storeErr } = await supabase
      .from('shopify_stores')
      .select('id, store_domain')
      .eq('store_domain', shop)
      .maybeSingle();
    if (storeErr) throw storeErr;
    if (!store?.id) {
      return NextResponse.json({ error: 'Shop not installed' }, { status: 404 });
    }

    // Ensure only one active link per shopify_store: deactivate others
    await supabase
      .from('accounts_shopify')
      .update({ is_active: false })
      .eq('shopify_store_id', store.id);

    // Upsert/insert the new relationship as active
    const { error: linkErr } = await supabase
      .from('accounts_shopify')
      .upsert({
        account_id: accountId,
        shopify_store_id: store.id,
        is_active: true,
      });
    if (linkErr) throw linkErr;

    // Reset any previously installed SeeItFirst script tags when switching accounts
    try {
      const appUrl = process.env.SHOPIFY_APP_URL as string;
      // Fetch access token for the store
      const { data: storeRow, error: tokenErr } = await supabase
        .from('shopify_stores')
        .select('access_token')
        .eq('id', store.id)
        .maybeSingle();
      if (tokenErr) throw tokenErr;
      const accessToken = storeRow?.access_token as string | undefined;
      if (accessToken) {
        const version = process.env.SHOPIFY_API_VERSION || '2024-07';
        const listResp = await fetch(`https://${store.store_domain}/admin/api/${version}/script_tags.json`, {
          headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
        });
        if (listResp.ok) {
          const json = await listResp.json();
          const tags = (json?.script_tags || []) as Array<{ id: number; src: string }>;
          for (const t of tags) {
            if (typeof t.src === 'string' && t.src.includes('/api/embed/script')) {
              // Only delete our app's script tags
              await fetch(`https://${store.store_domain}/admin/api/${version}/script_tags/${t.id}.json`, {
                method: 'DELETE',
                headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
              });
            }
          }
        }
      }
    } catch (e) {
      // best-effort cleanup; ignore errors
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to connect account' }, { status: 500 });
  }
}


