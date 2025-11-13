import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shop = searchParams.get('shop');
  if (!shop) {
    return NextResponse.json({ error: 'Missing shop' }, { status: 400 });
  }
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('shopify_stores')
      .select('id, store_domain, shop_id, shop_name, shop_owner_email, created_at, updated_at, installed_at')
      .eq('store_domain', shop)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ exists: false }, { status: 404 });
    }
    return NextResponse.json({ exists: true, store: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Lookup failed' }, { status: 500 });
  }
}


