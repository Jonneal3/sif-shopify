import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

async function createScriptTag(shop: string, accessToken: string, src: string) {
  const version = process.env.SHOPIFY_API_VERSION || '2024-07';
  const payload = {
    script_tag: {
      event: 'onload',
      src,
      display_scope: 'online_store',
    },
  } as any;
  const resp = await fetch(`https://${shop}/admin/api/${version}/script_tags.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`ScriptTag create failed: ${resp.status} ${t}`);
  }
  return resp.json();
}

function getBaseSrcPrefix(appUrl: string, instanceId: string) {
  const base = new URL(`${appUrl}/api/embed/script`);
  const qp = new URLSearchParams();
  qp.set('instance_id', instanceId);
  return `${base.toString()}?${qp.toString()}`;
}

function parsePlacementsFromSrc(src: string) {
  try {
    const u = new URL(src);
    // Support legacy flags and new compact 'p'
    const pbLegacy = u.searchParams.get('product_button') === '1';
    const piLegacy = u.searchParams.get('product_image_button') === '1';
    const p = u.searchParams.get('p') || '';
    const res: any = { product_button: pbLegacy || p.includes('b'), product_image_button: piLegacy || p.includes('i') };
    const get = (k: string) => u.searchParams.get(k) || undefined;
    res.btn_text = get('btn_text') || get('bt');
    res.btn_bg = get('btn_bg') || get('bb');
    res.btn_color = get('btn_color') || get('bc');
    const r = get('btn_radius') || get('br');
    if (typeof r !== 'undefined') res.btn_radius = Number(r);
    res.overlay_text = get('overlay_text') || get('ot');
    res.overlay_bg = get('overlay_bg') || get('ob');
    res.overlay_color = get('overlay_color') || get('oc');
    return res;
  } catch {
    return { product_button: false, product_image_button: false };
  }
}

function parseQueryFromSrc(src: string): URLSearchParams | null {
  try {
    const u = new URL(src);
    return u.searchParams;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get('shop') as string | null;
    const instanceId = searchParams.get('instance_id') as string | null;
    if (!shop || !instanceId) {
      return NextResponse.json({ error: 'Missing shop or instance_id' }, { status: 400 });
    }
    const supabase = getSupabaseServiceClient();
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('access_token')
      .eq('store_domain', shop)
      .maybeSingle();
    if (error) throw error;
    if (!store?.access_token) return NextResponse.json({ installed: false });
    const appUrl = process.env.SHOPIFY_APP_URL as string;
    const prefix = getBaseSrcPrefix(appUrl, instanceId);
    const listed = await listScriptTags(shop, store.access_token);
    const tags = (listed?.script_tags || []) as Array<{ id: number; src: string }>;
    const matches = tags.filter(t => typeof t.src === 'string' && t.src.startsWith(prefix));
    if (matches.length === 0) return NextResponse.json({ installed: false });
    const placements = parsePlacementsFromSrc(matches[0].src);
    return NextResponse.json({ installed: true, ...placements });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to check script tag' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const shop = body?.shop as string;
    const instanceId = body?.instance_id as string;
    const productButton = Boolean(body?.product_button);
    const productImgButton = Boolean(body?.product_image_button);
    const widgetUrl = typeof body?.widget_url === 'string' ? (body.widget_url as string) : undefined;
    const btnText = typeof body?.btn_text === 'string' ? (body.btn_text as string) : undefined;
    const btnBg = typeof body?.btn_bg === 'string' ? (body.btn_bg as string) : undefined;
    const btnColor = typeof body?.btn_color === 'string' ? (body.btn_color as string) : undefined;
    const btnRadius = typeof body?.btn_radius !== 'undefined' ? String(body.btn_radius) : undefined;
    const overlayText = typeof body?.overlay_text === 'string' ? (body.overlay_text as string) : undefined;
    const overlayBg = typeof body?.overlay_bg === 'string' ? (body.overlay_bg as string) : undefined;
    const overlayColor = typeof body?.overlay_color === 'string' ? (body.overlay_color as string) : undefined;
    if (!shop || !instanceId) {
      return NextResponse.json({ error: 'Missing shop or instance_id' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('access_token')
      .eq('store_domain', shop)
      .maybeSingle();
    if (error) throw error;
    if (!store?.access_token) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const appUrl = process.env.SHOPIFY_APP_URL as string;
    const basePrefix = getBaseSrcPrefix(appUrl, instanceId);
    // Ensure only ONE instance active per shop: remove any existing SIF tags for this shop
    const listed = await listScriptTags(shop, store.access_token);
    const allTags = (listed?.script_tags || []) as Array<{ id: number; src: string }>;
    const toDelete: Array<{ id: number }> = [];
    for (const t of allTags) {
      if (typeof t.src !== 'string') continue;
      // Our script endpoint path
      if (t.src.includes('/api/embed/script')) {
        const q = parseQueryFromSrc(t.src);
        const tagShop = q?.get('shop');
        const tagInstance = q?.get('instance_id');
        // Delete tags for this shop if instance differs OR if this is a stale duplicate of same instance
        if (tagShop === shop && tagInstance !== instanceId) toDelete.push({ id: t.id });
        if (t.src.startsWith(basePrefix)) toDelete.push({ id: t.id });
      }
    }
    // Dedup deletions by id
    const seen = new Set<number>();
    for (const t of toDelete) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      await deleteScriptTag(shop, store.access_token, t.id);
    }
    const params = new URLSearchParams();
    params.set('instance_id', instanceId);
    // Pack placements into a short key
    let p = '';
    if (productButton) p += 'b';
    if (productImgButton) p += 'i';
    if (p) params.set('p', p);
    // Only include customization if different from defaults
    const defBtnText = 'SeeItFirst';
    const defBtnBg = '#111';
    const defBtnColor = '#fff';
    const defBtnRadius = '6';
    const defOverlayText = 'SeeItFirst';
    const defOverlayBg = 'rgba(0,0,0,0.6)';
    const defOverlayColor = '#fff';
    const clip = (s?: string, n = 40) => (s ? String(s).slice(0, n) : undefined);
    if (btnText && btnText !== defBtnText) params.set('bt', clip(btnText)!);
    if (btnBg && btnBg !== defBtnBg) params.set('bb', clip(btnBg, 32)!);
    if (btnColor && btnColor !== defBtnColor) params.set('bc', clip(btnColor, 32)!);
    if (btnRadius && btnRadius !== defBtnRadius) params.set('br', String(Math.max(0, Math.min(64, Number(btnRadius)))));
    if (overlayText && overlayText !== defOverlayText) params.set('ot', clip(overlayText)!);
    if (overlayBg && overlayBg !== defOverlayBg) params.set('ob', clip(overlayBg, 32)!);
    if (overlayColor && overlayColor !== defOverlayColor) params.set('oc', clip(overlayColor, 32)!);
    // Avoid passing shop/widgetUrl to keep URL short; the embed derives them
    const src = `${appUrl}/api/embed/script?${params.toString()}`;

    const result = await createScriptTag(shop, store.access_token, src);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to install script tag' }, { status: 500 });
  }
}

async function listScriptTags(shop: string, accessToken: string, src?: string) {
  const version = process.env.SHOPIFY_API_VERSION || '2024-07';
  const url = new URL(`https://${shop}/admin/api/${version}/script_tags.json`);
  if (src) url.searchParams.set('src', src);
  const resp = await fetch(url.toString(), {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`ScriptTag list failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function deleteScriptTag(shop: string, accessToken: string, id: number) {
  const version = process.env.SHOPIFY_API_VERSION || '2024-07';
  const resp = await fetch(`https://${shop}/admin/api/${version}/script_tags/${id}.json`, {
    method: 'DELETE',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`ScriptTag delete failed: ${resp.status} ${await resp.text()}`);
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const shop = body?.shop as string;
    const instanceId = body?.instance_id as string;
    const deleteAll = Boolean(body?.all);
    if (!shop) {
      return NextResponse.json({ error: 'Missing shop' }, { status: 400 });
    }
    const supabase = getSupabaseServiceClient();
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('access_token')
      .eq('store_domain', shop)
      .maybeSingle();
    if (error) throw error;
    if (!store?.access_token) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    const appUrl = process.env.SHOPIFY_APP_URL as string;
    const listed = await listScriptTags(shop, store.access_token);
    const tags = (listed?.script_tags || []) as Array<{ id: number; src: string }>;
    let toDelete: Array<{ id: number; src: string }> = [];
    if (deleteAll) {
      toDelete = tags.filter(t => typeof t.src === 'string' && t.src.includes('/api/embed/script'));
    } else {
      if (!instanceId) {
        return NextResponse.json({ error: 'Missing instance_id' }, { status: 400 });
      }
      const basePrefix = getBaseSrcPrefix(appUrl, instanceId);
      toDelete = tags.filter(t => typeof t.src === 'string' && t.src.startsWith(basePrefix));
    }
    for (const tag of toDelete) {
      await deleteScriptTag(shop, store.access_token, tag.id);
    }
    return NextResponse.json({ ok: true, deleted: toDelete.map(t => t.id) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to uninstall script tag' }, { status: 500 });
  }
}


