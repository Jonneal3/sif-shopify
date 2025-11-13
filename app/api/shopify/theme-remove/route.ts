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

async function shopifyPut(shop: string, token: string, path: string, body: any) {
  const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}${path}`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${path} failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function shopifyDelete(shop: string, token: string, path: string) {
  const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}${path}`, {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  });
  if (!resp.ok && resp.status !== 404) throw new Error(`${path} failed: ${resp.status} ${await resp.text()}`);
  return resp.text();
}

async function getAssetValue(shop: string, token: string, themeId: string | number, key: string): Promise<string | null> {
  try {
    const assetJson = await shopifyGet(shop, token, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`);
    return typeof assetJson?.asset?.value === 'string' ? assetJson.asset.value : null;
  } catch {
    return null;
  }
}

function removeBetweenMarkersFiltered(content: string, opts: { removeButton: boolean; removeOverlay: boolean }): string {
  // Remove only requested SIF marker blocks by type
  const re = /<!--\s*sif:start[^>]*type\s*=\s*([a-zA-Z0-9_-]+)[^>]*-->[\s\S]*?<!--\s*sif:end[^>]*-->/gi;
  return content.replace(re, (match: string, type: string) => {
    const t = String(type || '').toLowerCase();
    if ((t === 'button' && opts.removeButton) || (t === 'overlay' && opts.removeOverlay)) {
      return '';
    }
    return match;
  });
}

function removeRenderTags(content: string): { next: string; removedCount: number } {
  const tags = [
    "{% render 'sif-ai-button' %}",
    "{% render 'sif-ai-button-debug-1' %}",
    "{% render 'sif-ai-button-debug-2' %}",
    "{% render 'sif-ai-button-debug-3' %}",
    "{% render 'sif-ai-overlay' %}",
  ];
  let next = content;
  let removedCount = 0;
  for (const t of tags) {
    if (next.includes(t)) {
      const count = (next.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      next = next.split(t).join('');
      removedCount += count;
    }
  }
  return { next, removedCount };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      shop,
      theme_id,
      instance_id,
      remove_button = false,
      remove_overlay = true,
    }: { shop?: string; theme_id?: string | number; instance_id?: string; remove_button?: boolean; remove_overlay?: boolean } = body || {};

    if (!shop) return NextResponse.json({ error: 'Missing shop' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('access_token')
      .eq('store_domain', shop)
      .maybeSingle();
    if (error) throw error;
    const token = store?.access_token as string | undefined;
    if (!token) return NextResponse.json({ error: 'No access token for shop' }, { status: 403 });

    // Resolve theme
    let themeId: string | number | null = null;
    if (theme_id) {
      themeId = theme_id;
    } else {
      const themesResp = await shopifyGet(shop, token, '/themes.json');
      const mainTheme = (themesResp?.themes || []).find((t: any) => t.role === 'main');
      themeId = mainTheme?.id || null;
    }
    if (!themeId) return NextResponse.json({ error: 'No theme found' }, { status: 404 });

    // List assets once
    let assetsList: { assets?: Array<{ key: string }> } | null = null;
    try {
      assetsList = await shopifyGet(shop, token, `/themes/${themeId}/assets.json`);
    } catch {}

    // Curated targets first
    const curatedKeys = new Set<string>([
      'blocks/_product-details.liquid',
      'blocks/product-details.liquid',
      'snippets/_product-details.liquid',
      'snippets/product-details.liquid',
      'sections/product-information.liquid',
      'sections/main-product.liquid',
      'sections/product.liquid',
      'snippets/product-media.liquid',
      'layout/theme.liquid',
    ]);

    // Expand from assets list (only plausible product files to keep requests low)
    if (assetsList?.assets) {
      for (const a of assetsList.assets) {
        const k = a.key;
        if (typeof k !== 'string' || !k.endsWith('.liquid')) continue;
        if (k.startsWith('sections/')) {
          if (/product-information|main-product|product\.liquid/i.test(k)) curatedKeys.add(k);
        } else if (k.startsWith('blocks/')) {
          if (/product|details|buy-buttons|price/i.test(k)) curatedKeys.add(k);
        } else if (k.startsWith('snippets/')) {
          if (/product-media|product|price|buy-buttons/i.test(k)) curatedKeys.add(k);
        }
      }
    }

    const updated: string[] = [];
    const scanned: number = curatedKeys.size;

    for (const key of curatedKeys) {
      try {
        const content = await getAssetValue(shop, token, themeId, key);
        if (!content) continue;

        // Remove only requested marker blocks (by type)
        let next = removeBetweenMarkersFiltered(content, { removeButton: Boolean(remove_button), removeOverlay: Boolean(remove_overlay) });
        const before = next;

        // If removing specific types only, filter tags list accordingly
        if (remove_button || remove_overlay) {
          // Build limited removal list if needed
          let temp = next;
          if (remove_button) {
            const btnTags = [
              "{% render 'sif-ai-button' %}",
              "{% render 'sif-ai-button-debug-1' %}",
              "{% render 'sif-ai-button-debug-2' %}",
              "{% render 'sif-ai-button-debug-3' %}",
            ];
            for (const t of btnTags) if (temp.includes(t)) temp = temp.split(t).join('');
          }
          if (remove_overlay) {
            const ovTag = "{% render 'sif-ai-overlay' %}";
            if (temp.includes(ovTag)) temp = temp.split(ovTag).join('');
          }
          next = temp;
        }

        if (next !== content) {
          await shopifyPut(shop, token, `/themes/${themeId}/assets.json`, { asset: { key, value: next } });
          updated.push(key);
        }
      } catch (e: any) {
        // Ignore missing assets quietly
      }
    }

    // Optionally delete overlay snippet after removing references
    if (remove_overlay) {
      try {
        const overlayKey = 'snippets/sif-ai-overlay.liquid';
        await shopifyDelete(shop, token, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(overlayKey)}`);
        updated.push(overlayKey + ' #deleted');
      } catch {}
    }

    // Optionally delete legacy button snippet after removing references
    if (remove_button) {
      try {
        const btnKeys = [
          'snippets/sif-ai-button.liquid',
          'snippets/sif-ai-button-debug-1.liquid',
          'snippets/sif-ai-button-debug-2.liquid',
          'snippets/sif-ai-button-debug-3.liquid',
        ];
        for (const key of btnKeys) {
          try {
            await shopifyDelete(shop, token, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`);
            updated.push(key + ' #deleted');
          } catch {}
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, theme_id: themeId, scanned, updated_count: updated.length, updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Theme remove failed' }, { status: 500 });
  }
}


