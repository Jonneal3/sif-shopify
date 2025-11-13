import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

// Simple in-memory rate limiter (reset after 10 seconds)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds
const MAX_REQUESTS_PER_WINDOW = 3; // Max 3 requests per 10 seconds per shop

function checkRateLimit(shop: string): { allowed: boolean; remaining: number } {
  const key = `shop:${shop}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count };
}

async function shopifyGet(shop: string, token: string, path: string) {
  const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}${path}`, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`${path} failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function shopifyPut(shop: string, token: string, path: string, body: any) {
  const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}${path}`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${path} failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

export async function POST(req: NextRequest) {
  try {
    const { shop, theme_id, button_label, instance_id } = await req.json();
    if (!shop) return NextResponse.json({ error: 'Missing shop' }, { status: 400 });

    const rate = checkRateLimit(shop);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a few seconds before trying again.', rateLimit: true },
        { status: 429, headers: { 'Retry-After': '10' } }
      );
    }

    // Resolve store token
    const supabase = getSupabaseServiceClient();
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('access_token')
      .eq('store_domain', shop)
      .maybeSingle();
    if (error) throw error;
    const token = store?.access_token as string | undefined;
    if (!token) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    // Pick theme (main if not specified)
    const themesResp = await shopifyGet(shop, token, '/themes.json');
    const themesArr = (themesResp?.themes || []);
    const mainTheme = themesArr.find((t: any) => t.role === 'main');
    if (!mainTheme?.id && !theme_id) return NextResponse.json({ error: 'No main theme found' }, { status: 404 });
    const themeId = theme_id && themesArr.some((t: any) => String(t.id) === String(theme_id)) ? theme_id : (mainTheme?.id as any);

    // Find product template JSON
    let productTemplateKey: string | null = null;
    let assetsList: any = null;
    try { assetsList = await shopifyGet(shop, token, `/themes/${themeId}/assets.json`); } catch {}
    if (assetsList?.assets) {
      for (const a of assetsList.assets as Array<{ key: string }>) {
        const k = a.key;
        if (typeof k !== 'string') continue;
        if (/^templates\/product(\.[^\/]+)?\.json$/.test(k)) { productTemplateKey = k; break; }
      }
    }
    if (!productTemplateKey) productTemplateKey = 'templates/product.json';

    // Load template JSON value
    let tplRaw: string | null = null;
    try {
      const asset = await shopifyGet(shop, token, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(productTemplateKey)}`);
      tplRaw = asset?.asset?.value || null;
    } catch {}

    let tpl: any = {};
    try { tpl = tplRaw ? JSON.parse(tplRaw) : {}; } catch { tpl = {}; }
    tpl.sections = tpl.sections && typeof tpl.sections === 'object' ? tpl.sections : {};

    // Choose a product section: prefer product-information, then main-product, else create minimal one
    let sectionKey: string | null = null;
    for (const [k, v] of Object.entries(tpl.sections)) {
      const type = (v as any)?.type ? String((v as any).type) : '';
      if (/^product-information$/i.test(type)) { sectionKey = k; break; }
    }
    if (!sectionKey) {
      for (const [k, v] of Object.entries(tpl.sections)) {
        const type = (v as any)?.type ? String((v as any).type) : '';
        if (/^main-product$/i.test(type)) { sectionKey = k; break; }
      }
    }
    if (!sectionKey) {
      sectionKey = 'main';
      tpl.sections[sectionKey] = { type: 'product-information', blocks: {}, block_order: [] };
    }

    const sec = tpl.sections[sectionKey];
    sec.blocks = sec.blocks && typeof sec.blocks === 'object' ? sec.blocks : {};
    sec.block_order = Array.isArray(sec.block_order) ? sec.block_order : [];

    // Insert the app block
    const stableId = 'sif_ai_button_block_app';
    sec.blocks[stableId] = {
      type: 'app_block',
      id: 'sif-ai-widget::sif-ai-button',
      settings: {
        button_label: typeof button_label === 'string' && button_label ? button_label : 'See it first',
        instance_id: typeof instance_id === 'string' ? instance_id : ''
      }
    };

    // Order: after header group, before first divider if present
    const order: string[] = sec.block_order;
    const removeIdx = order.indexOf(stableId);
    if (removeIdx !== -1) order.splice(removeIdx, 1);

    const headerIdx = order.findIndex(bid => (sec.blocks[bid]?.type || '').toLowerCase() === 'group');
    const dividerIdx = order.findIndex(bid => (sec.blocks[bid]?.type || '').toLowerCase() === '_divider');

    let insertIdx = 0;
    if (headerIdx >= 0) insertIdx = headerIdx + 1;
    if (dividerIdx >= 0 && insertIdx > dividerIdx) insertIdx = dividerIdx;
    order.splice(insertIdx, 0, stableId);

    // Persist back
    await shopifyPut(shop, token, `/themes/${themeId}/assets.json`, {
      asset: { key: productTemplateKey, value: JSON.stringify(tpl) }
    });

    return NextResponse.json({ ok: true, theme_id: themeId, product_template: productTemplateKey, block_id: stableId, updated: [productTemplateKey + ' #app_block_inserted'], failed: [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'auto-add failed' }, { status: 500 });
  }
}


