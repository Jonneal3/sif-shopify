import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shop = searchParams.get('shop');
  if (!shop) return NextResponse.json({ error: 'Missing shop' }, { status: 400 });
  try {
    const supabase = getSupabaseServiceClient();
    const { data: store, error: storeErr } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('store_domain', shop)
      .maybeSingle();
    if (storeErr) throw storeErr;
    if (!store?.id) return NextResponse.json({ connected: false });

    const { data: link, error: linkErr } = await supabase
      .from('accounts_shopify')
      .select('account_id, is_active')
      .eq('shopify_store_id', store.id)
      .eq('is_active', true)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link?.account_id) return NextResponse.json({ connected: false });
    return NextResponse.json({ connected: true, account_id: link.account_id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Lookup failed' }, { status: 500 });
  }
}


