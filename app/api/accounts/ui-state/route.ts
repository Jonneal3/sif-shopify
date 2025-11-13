import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

type ButtonConfig = {
  text: string;
  bg: string;
  color: string;
  radius: number;
};

type OverlayConfig = {
  text: string;
  bg: string;
  color: string;
};

type UiState = {
  selected_instance_id: string | null;
  enable_product_button: boolean | null;
  enable_product_image: boolean | null;
  button_config: ButtonConfig | null;
  overlay_config: OverlayConfig | null;
  // Legacy fields for backward compatibility
  btn_text?: string | null;
  btn_bg?: string | null;
  btn_color?: string | null;
  btn_radius?: number | null;
  overlay_text?: string | null;
  overlay_bg?: string | null;
  overlay_color?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get('shop');
    const accountId = searchParams.get('account_id');
    if (!shop || !accountId) {
      return NextResponse.json({ error: 'Missing shop or account_id' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: store, error: storeErr } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('store_domain', shop)
      .maybeSingle();
    if (storeErr) throw storeErr;
    if (!store?.id) return NextResponse.json({ state: null }, { status: 200 });

    // Prefer explicit account row; fallback to active row for the store
    let { data: link, error: linkErr } = await supabase
      .from('accounts_shopify' as any)
      .select('selected_instance_id, enable_product_button, enable_product_image, button_config, overlay_config' as any)
      .eq('shopify_store_id', store.id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (linkErr) throw linkErr;
    let row: any = link ?? null;
    if (!row) {
      const { data: activeLink, error: activeErr } = await supabase
        .from('accounts_shopify' as any)
        .select('selected_instance_id, enable_product_button, enable_product_image, button_config, overlay_config' as any)
        .eq('shopify_store_id', store.id)
        .eq('is_active', true)
        .maybeSingle();
      if (activeErr) throw activeErr;
      row = activeLink ?? null;
    }

    // Convert JSON columns to flat structure for backward compatibility
    const state: UiState | null = row ? {
      selected_instance_id: row.selected_instance_id ?? null,
      enable_product_button: row.enable_product_button ?? false,
      enable_product_image: row.enable_product_image ?? false,
      button_config: row.button_config ?? null,
      overlay_config: row.overlay_config ?? null,
      // Legacy fields extracted from JSON for backward compatibility
      btn_text: row.button_config?.text ?? null,
      btn_bg: row.button_config?.bg ?? null,
      btn_color: row.button_config?.color ?? null,
      btn_radius: row.button_config?.radius ?? null,
      overlay_text: row.overlay_config?.text ?? null,
      overlay_bg: row.overlay_config?.bg ?? null,
      overlay_color: row.overlay_config?.color ?? null,
    } : null;

    return NextResponse.json({ state });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load ui-state' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[ui-state POST] Request received', {
      body,
      has_selected_instance_id: 'selected_instance_id' in body,
      selected_instance_id_value: body?.selected_instance_id,
      selected_instance_id_type: typeof body?.selected_instance_id,
    });
    
    const shop: string | undefined = body?.shop;
    const accountId: string | undefined = body?.account_id;
    
    console.log('[ui-state POST] Parsed params', { shop, accountId });
    
    if (!shop || !accountId) {
      console.error('[ui-state POST] Missing shop or account_id', { shop, accountId });
      return NextResponse.json({ error: 'Missing shop or account_id' }, { status: 400 });
    }

    const selectedInstanceId: string | null = body?.selected_instance_id === undefined ? null : body.selected_instance_id;
    const enableButton: boolean | null = typeof body?.enable_button === 'boolean' ? Boolean(body.enable_button) : null;
    const enableOverlay: boolean | null = typeof body?.enable_overlay === 'boolean' ? Boolean(body.enable_overlay) : null;
    
    // Support both JSON format and legacy flat format
    let buttonConfig: ButtonConfig | null = null;
    let overlayConfig: OverlayConfig | null = null;
    
    if (body?.button_config) {
      // New JSON format
      buttonConfig = body.button_config;
    } else if (body?.btn_text !== undefined || body?.btn_bg !== undefined || body?.btn_color !== undefined || body?.btn_radius !== undefined) {
      // Legacy flat format - convert to JSON
      buttonConfig = {
        text: body?.btn_text ?? 'SeeItFirst',
        bg: body?.btn_bg ?? '#111',
        color: body?.btn_color ?? '#fff',
        radius: typeof body?.btn_radius === 'number' ? body.btn_radius : Number(body?.btn_radius) || 6,
      };
    }
    
    if (body?.overlay_config) {
      // New JSON format
      overlayConfig = body.overlay_config;
    } else if (body?.overlay_text !== undefined || body?.overlay_bg !== undefined || body?.overlay_color !== undefined) {
      // Legacy flat format - convert to JSON
      overlayConfig = {
        text: body?.overlay_text ?? 'SeeItFirst',
        bg: body?.overlay_bg ?? 'rgba(0,0,0,0.6)',
        color: body?.overlay_color ?? '#fff',
      };
    }

    console.log('[ui-state POST] Parsed values', {
      selectedInstanceId,
      selectedInstanceIdType: typeof selectedInstanceId,
      isNull: selectedInstanceId === null,
      isUndefined: selectedInstanceId === undefined,
      enableButton,
      enableOverlay,
    });

    const supabase = getSupabaseServiceClient();
    const { data: store, error: storeErr } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('store_domain', shop)
      .maybeSingle();
    
    if (storeErr) {
      console.error('[ui-state POST] Store lookup error', storeErr);
      throw storeErr;
    }
    
    if (!store?.id) {
      console.error('[ui-state POST] Store not found', { shop });
      return NextResponse.json({ error: 'Shop not installed' }, { status: 404 });
    }
    
    console.log('[ui-state POST] Store found', { storeId: store.id, shop });

    const updates: Record<string, any> = {};
    // Always update selected_instance_id if it's provided in the body (even if null to clear it)
    if ('selected_instance_id' in body) {
      updates.selected_instance_id = selectedInstanceId;
      console.log('[ui-state POST] Adding selected_instance_id to updates', {
        value: selectedInstanceId,
        type: typeof selectedInstanceId,
      });
    }
    if (enableButton !== null) updates.enable_product_button = enableButton;
    if (enableOverlay !== null) updates.enable_product_image = enableOverlay;
    
    // Update JSON columns if configs are provided
    if (buttonConfig !== null) {
      updates.button_config = buttonConfig;
      console.log('[ui-state POST] Adding button_config to updates', buttonConfig);
    }
    
    if (overlayConfig !== null) {
      updates.overlay_config = overlayConfig;
      console.log('[ui-state POST] Adding overlay_config to updates', overlayConfig);
    }

    console.log('[ui-state POST] Updates object', {
      updates,
      updateKeys: Object.keys(updates),
      updateCount: Object.keys(updates).length,
    });

    // Note: accounts_shopify has a composite PK (account_id, shopify_store_id),
    // so there's only one row per account+store. Setting selected_instance_id on
    // that row automatically "unchecks" any previous instance selection.

    console.log('[ui-state POST] Attempting update', {
      shopify_store_id: store.id,
      account_id: accountId,
      updates,
    });

    // Try update first
    const { data: updatedRows, error: updErr } = await supabase
      .from('accounts_shopify' as any)
      .update(updates as any)
      .eq('shopify_store_id', store.id)
      .eq('account_id', accountId)
      .select('account_id, selected_instance_id');
    
    console.log('[ui-state POST] Update result', {
      updatedRows,
      updatedRowsCount: updatedRows?.length || 0,
      error: updErr,
    });
    
    if (updErr) {
      console.error('[ui-state POST] Update error', updErr);
      throw updErr;
    }

    // If no row was updated, upsert a new link row for this account+store
    if (!updatedRows || updatedRows.length === 0) {
      console.log('[ui-state POST] No rows updated, attempting upsert', {
        account_id: accountId,
        shopify_store_id: store.id,
        updates,
      });
      
      const upsertData = {
        account_id: accountId,
        shopify_store_id: store.id,
        is_active: true,
        ...updates,
      };
      
      console.log('[ui-state POST] Upsert data', upsertData);
      
      const { data: upsertedData, error: upsertErr } = await supabase
        .from('accounts_shopify' as any)
        .upsert(upsertData as any)
        .select('account_id, selected_instance_id');
      
      console.log('[ui-state POST] Upsert result', {
        upsertedData,
        error: upsertErr,
      });
      
      if (upsertErr) {
        console.error('[ui-state POST] Upsert error', upsertErr);
        throw upsertErr;
      }
      
      console.log('[ui-state POST] Success - created new row');
      return NextResponse.json({ ok: true, created: true });
    }

    console.log('[ui-state POST] Success - updated existing row', {
      updatedRows,
      selected_instance_id: (updatedRows?.[0] as any)?.selected_instance_id,
    });
    return NextResponse.json({ ok: true, updated: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save ui-state' }, { status: 500 });
  }
}


