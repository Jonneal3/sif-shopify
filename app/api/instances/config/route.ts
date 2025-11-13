import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

type ButtonConfig = { text: string; bg: string; color: string; radius: number };
type OverlayConfig = { text: string; bg: string; color: string };

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get('shop');
    const instanceId = searchParams.get('instance_id');
    if (!shop || !instanceId) {
      return NextResponse.json({ error: 'Missing shop or instance_id' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();

    // Resolve store
    const { data: store, error: storeErr } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('store_domain', shop)
      .maybeSingle();
    if (storeErr) throw storeErr;
    if (!store?.id) return NextResponse.json({ config: null }, { status: 200 });

    // Prefer the link row whose selected_instance_id matches
    let { data: link, error: linkErr } = await supabase
      .from('accounts_shopify' as any)
      .select('enable_product_button, enable_product_image, button_config, overlay_config' as any)
      .eq('shopify_store_id', store.id)
      .eq('selected_instance_id', instanceId)
      .maybeSingle();
    if (linkErr) throw linkErr;

    // Fallback to any active row for the store if none explicitly selected
    if (!link) {
      const { data: activeLink, error: activeErr } = await supabase
        .from('accounts_shopify' as any)
        .select('enable_product_button, enable_product_image, button_config, overlay_config' as any)
        .eq('shopify_store_id', store.id)
        .eq('is_active', true)
        .maybeSingle();
      if (activeErr) throw activeErr;
      link = activeLink ?? null;
    }

    // Shape response for storefront
    const row: any = link ?? null;
    const button: ButtonConfig | null = row?.button_config ?? null;
    const overlay: OverlayConfig | null = row?.overlay_config ?? null;
    const enableButton: boolean = Boolean(row?.enable_product_button);
    const enableOverlay: boolean = Boolean(row?.enable_product_image);

    return NextResponse.json({
      config: {
        enableButton,
        enableOverlay,
        button,
        overlay,
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load instance config' }, { status: 500 });
  }
}


