import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';
import { fetchProducts } from '@/lib/shopify';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shop = searchParams.get('shop');
  if (!shop) return NextResponse.json({ error: 'Missing shop' }, { status: 400 });
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('shopify_stores')
      .select('access_token')
      .eq('store_domain', shop)
      .maybeSingle();
    if (error) throw error;
    if (!data?.access_token) return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    const products = await fetchProducts(shop, data.access_token);
    return NextResponse.json(products);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch products' }, { status: 500 });
  }
}

