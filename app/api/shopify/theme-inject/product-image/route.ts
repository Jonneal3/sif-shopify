import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

// Helper function to convert position string to CSS styles
function getPositionStyles(position: string = 'bottom-right'): string {
  const positions: Record<string, string> = {
    'top-left': 'top:8px;left:8px;',
    'top-right': 'top:8px;right:8px;',
    'top-center': 'top:8px;left:50%;transform:translateX(-50%);',
    'bottom-left': 'bottom:8px;left:8px;',
    'bottom-right': 'bottom:8px;right:8px;',
    'bottom-center': 'bottom:8px;left:50%;transform:translateX(-50%);',
    'center': 'top:50%;left:50%;transform:translate(-50%,-50%);',
  };
  return positions[position] || positions['bottom-right'];
}

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

// Shopify API helpers
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
    console.warn('[theme_inject:product-image] get_asset_fail', { key });
    return null;
  }
}

function injectRenderTag(liquid: string, renderTag: string): string {
  if (liquid.includes(renderTag)) return liquid;
  const anchor = '</body>';
  const idx = liquid.lastIndexOf(anchor);
  return idx !== -1 ? liquid.slice(0, idx) + `\n${renderTag}\n` + liquid.slice(idx) : liquid + `\n${renderTag}\n`;
}

function injectAfterMarkers(liquid: string, renderTag: string, markers: string[]): string | null {
  if (liquid.includes(renderTag)) return null;
  for (const marker of markers) {
    const idx = liquid.indexOf(marker);
    if (idx !== -1) {
      const before = liquid.slice(0, idx + marker.length);
      const after = liquid.slice(idx + marker.length);
      return `${before}\n${renderTag}\n${after}`;
    }
  }
  return null;
}

function injectIntoProductMedia(liquid: string, renderTag: string): string | null {
  if (liquid.includes(renderTag)) return null;
  try {
    const re = /<div[^>]*class=["'][^"'>]*product-media[^"'>]*["'][^>]*>/i;
    const m = liquid.match(re);
    if (!m || m.index === undefined) return null;
    const insertAt = m.index + m[0].length;
    return liquid.slice(0, insertAt) + "\n" + renderTag + "\n" + liquid.slice(insertAt);
  } catch {
    return null;
  }
}

function buildDecoratedRenderTag(tag: string, type: 'overlay', instanceId: string | undefined): string {
  const inst = instanceId || '';
  return `<!-- sif:start type=${type} instance=${inst} -->\n${tag}\n<!-- sif:end type=${type} -->`;
}

function removeBetweenOverlayMarkers(content: string): string {
  // Remove only SIF overlay marker blocks
  const markerRe = /<!--\s*sif:start[^>]*type\s*=\s*overlay[^>]*-->[\s\S]*?<!--\s*sif:end[^>]*-->/gi;
  return content.replace(markerRe, '');
}

function removeOverlayRenderTags(content: string): { next: string; removedCount: number } {
  const tag = "{% render 'sif-ai-overlay' %}";
  const re = new RegExp(tag.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'g');
  const count = (content.match(re) || []).length;
  return { next: content.split(tag).join(''), removedCount: count };
}

export async function POST(req: NextRequest) {
  try {
    const {
      shop,
      theme_id,
      overlay_text,
      overlay_bg,
      overlay_color,
      overlay_position,
      instance_id,
      enable_overlay,
    } = await req.json();

    if (!shop) return NextResponse.json({ error: 'Missing shop' }, { status: 400 });

    // Rate limiting per shop
    const rate = checkRateLimit(shop);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a few seconds before trying again.', rateLimit: true },
        { status: 429, headers: { 'Retry-After': '10' } }
      );
    }

    // Get store token
    const supabase = getSupabaseServiceClient();
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('access_token')
      .eq('store_domain', shop)
      .maybeSingle();
    if (error) throw error;
    const token = store?.access_token as string | undefined;
    if (!token) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    // Active theme
    const themesResp = await shopifyGet(shop, token, '/themes.json');
    const themesArr = (themesResp?.themes || []);
    const mainTheme = themesArr.find((t: any) => t.role === 'main');
    if (!mainTheme?.id) return NextResponse.json({ error: 'No main theme found' }, { status: 404 });
    const themeId = theme_id && themesArr.some((t: any) => String(t.id) === String(theme_id)) ? theme_id : mainTheme.id;

    // If disabling overlay: remove references and delete snippet
    if (enable_overlay === false) {
      const overlayKey = 'snippets/sif-ai-overlay.liquid';
      const overlayRenderTag = "{% render 'sif-ai-overlay' %}";
      const updated: string[] = [];
      const failed: Array<{ key: string; reason: string }> = [];

      // List assets once
      let assetsList: { assets?: Array<{ key: string }> } | null = null;
      try { assetsList = await shopifyGet(shop, token, `/themes/${themeId}/assets.json`); } catch {}

      const curated = new Set<string>([
        'snippets/product-media.liquid',
        'sections/product-information.liquid',
        'sections/main-product.liquid',
        'sections/product.liquid',
        'sections/product-media-gallery.liquid',
        'layout/theme.liquid',
      ]);
      const isProductSection = (k: string) => k.startsWith('sections/') && /product/i.test(k) && !/card|grid|collection|recommend|list|featured-product/i.test(k);
      if (assetsList?.assets) {
        for (const a of assetsList.assets) {
          const k = a.key;
          if (typeof k !== 'string' || !k.endsWith('.liquid')) continue;
          if (k === 'snippets/product-media.liquid' || isProductSection(k)) curated.add(k);
        }
      }

      for (const key of Array.from(curated)) {
        try {
          const content = await getAssetValue(shop, token, themeId, key);
          if (!content) continue;
          let next = removeBetweenOverlayMarkers(content);
          const { next: next2 } = removeOverlayRenderTags(next);
          next = next2;
          if (next !== content) {
            await shopifyPut(shop, token, `/themes/${themeId}/assets.json`, { asset: { key, value: next } });
            updated.push(key);
          }
        } catch (e: any) {
          failed.push({ key, reason: e?.message || 'cleanup_fail' });
        }
      }

      // Attempt to delete the overlay snippet
      try {
        await shopifyDelete(shop, token, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(overlayKey)}`);
        updated.push(overlayKey + ' #deleted');
      } catch (e: any) {
        // Non-fatal
      }

      return NextResponse.json({ ok: failed.length === 0, status: failed.length ? 'partial' : 'ok', theme_id: themeId, updated, failed });
    }

    // Put overlay snippet (idempotent)
    const ovText = (overlay_text ?? 'SeeItFirst') as string;
    const ovBg = (overlay_bg ?? 'rgba(0,0,0,0.6)') as string;
    const ovColor = (overlay_color ?? '#fff') as string;
    const ovPosition = (overlay_position ?? 'bottom-right') as string;
    const positionStyles = getPositionStyles(ovPosition);
    const overlayKey = 'snippets/sif-ai-overlay.liquid';
    const overlayRenderTag = "{% render 'sif-ai-overlay' %}";
    const overlayRenderTagDecorated = buildDecoratedRenderTag(overlayRenderTag, 'overlay', instance_id);
    
    // Create overlay snippet - resilient to all rendering contexts
    // Use global initialization that works even when script tags are stripped
    const overlaySnippet = `<link rel="stylesheet" href="{{ 'sif-widget.css' | asset_url }}">
<script src="{{ 'sif-widget.js' | asset_url }}"></script>
<div id="sif-ai-overlay" data-sif-instance-id="${(instance_id || '')}" data-sif-shop="{{ shop.permanent_domain | default: shop.domain }}" data-sif-product-id="{{ product.id }}" data-sif-overlay-text="${ovText}" data-sif-overlay-bg="${ovBg}" data-sif-overlay-color="${ovColor}" style="position:absolute;${positionStyles}background:${ovBg};color:${ovColor};padding:6px 10px;border-radius:6px;cursor:pointer;z-index:2147483647">${ovText}</div>
<script>
(function(){
  if (!window.SIF_OVERLAY_INIT) {
    window.SIF_OVERLAY_INIT = true;
    
    function initOverlayHandler(overlay) {
      if (!overlay || overlay.__sif_bound) return;
      overlay.__sif_bound = true;
      
      var instanceId = overlay.getAttribute('data-sif-instance-id');
      if (!instanceId) return;
      
      function openModal(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        
        // Get shop and product_id directly from data attributes (set by Liquid)
        var shop = overlay.getAttribute('data-sif-shop') || (window.Shopify && window.Shopify.shop) || window.location.hostname;
        var productId = overlay.getAttribute('data-sif-product-id') || '';
        
        console.log('[SIF] Overlay click:', {
          instanceId: instanceId,
          shop: shop,
          productId: productId,
          dataAttributes: {
            shop: overlay.getAttribute('data-sif-shop'),
            productId: overlay.getAttribute('data-sif-product-id')
          }
        });
        
        // Build context object
        var ctx = { shop: shop };
        if (productId) {
          ctx.productId = productId;
        }
        
        console.log('[SIF] Sending context to widget:', ctx);
        
        if (window.SIF_OPEN_MODAL && typeof window.SIF_OPEN_MODAL === 'function') {
          try {
            window.SIF_OPEN_MODAL(instanceId, ctx);
            return;
          } catch(err) {
            console.error('[SIF] Error opening modal:', err);
          }
        }
        
        var attempts = 0;
        var maxAttempts = 50;
        var checkInterval = setInterval(function() {
          attempts++;
          if (window.SIF_OPEN_MODAL && typeof window.SIF_OPEN_MODAL === 'function') {
            clearInterval(checkInterval);
            try {
              window.SIF_OPEN_MODAL(instanceId, ctx);
            } catch(err) {
              console.error('[SIF] Error opening modal:', err);
            }
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.warn('[SIF] Widget not loaded');
          }
        }, 100);
      }
      
      overlay.addEventListener('click', openModal);
    }
    
    function findAndInitOverlays() {
      var overlays = document.querySelectorAll('#sif-ai-overlay');
      for (var i = 0; i < overlays.length; i++) {
        initOverlayHandler(overlays[i]);
      }
    }
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', findAndInitOverlays);
    } else {
      findAndInitOverlays();
    }
    
    var observer = new MutationObserver(function() {
      findAndInitOverlays();
    });
    try {
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch(_) {}
    
    document.addEventListener('shopify:section:load', findAndInitOverlays);
    document.addEventListener('shopify:section:select', findAndInitOverlays);
    
    findAndInitOverlays();
  }
})();
</script>`;
    
    const overlayTag = overlaySnippet;

    const updated: string[] = [];
    const failed: Array<{ key: string; reason: string }> = [];

    try {
      const existing = await getAssetValue(shop, token, themeId, overlayKey);
      if (existing !== overlayTag) {
        await shopifyPut(shop, token, `/themes/${themeId}/assets.json`, { asset: { key: overlayKey, value: overlayTag } });
        updated.push(overlayKey);
      }
    } catch (e: any) {
      failed.push({ key: overlayKey, reason: e?.message || 'overlay_upsert_fail' });
    }

    // Optionally inject into product-media and sections
    if (enable_overlay !== false) {
      // product-media snippet first
      try {
        const pmKey = 'snippets/product-media.liquid';
        const content = await getAssetValue(shop, token, themeId, pmKey);
        if (content) {
          let base = content.split(overlayRenderTag).join('');
          base = base.split(overlayRenderTagDecorated).join('');
          let next = injectIntoProductMedia(base, overlayRenderTag);
          if (!next) next = injectAfterMarkers(base, overlayRenderTag, ['product-media']);
          if (!next) next = injectRenderTag(base, overlayRenderTag);
          if (next && next !== content) {
            const nextDecorated = next.split(overlayRenderTag).join(overlayRenderTagDecorated);
            await shopifyPut(shop, token, `/themes/${themeId}/assets.json`, { asset: { key: pmKey, value: nextDecorated } });
            updated.push(pmKey + ' #overlay');
          }
        }
      } catch (e: any) {
        // ignore
      }

      // sections fallback scan
      let assetsList: any = null;
      try { assetsList = await shopifyGet(shop, token, `/themes/${themeId}/assets.json`); } catch {}
      const isProductPageSection = (k: string) => k.startsWith('sections/') && /product/i.test(k) && !/card|grid|collection|recommend|list|featured-product/i.test(k);
      const candidates = new Set<string>(['sections/product-information.liquid', 'sections/main-product.liquid', 'sections/product.liquid', 'sections/product-media-gallery.liquid']);
      if (assetsList?.assets) {
        for (const a of assetsList.assets as Array<{ key: string }>) {
          const k = a.key;
          if (typeof k !== 'string' || !k.endsWith('.liquid')) continue;
          if (isProductPageSection(k)) candidates.add(k);
        }
      }
      for (const key of Array.from(candidates)) {
        try {
          const content = await getAssetValue(shop, token, themeId, key);
          if (!content) continue;
          let base = content.split(overlayRenderTag).join('');
          base = base.split(overlayRenderTagDecorated).join('');
          let next = injectAfterMarkers(base, overlayRenderTag, ["{%- render 'product-media' %}", "{% render 'product-media' %}", 'product-media-gallery', 'product__media']);
          if (!next) next = injectRenderTag(base, overlayRenderTag);
          if (next && next !== content) {
            const nextDecorated = next.split(overlayRenderTag).join(overlayRenderTagDecorated);
            await shopifyPut(shop, token, `/themes/${themeId}/assets.json`, { asset: { key, value: nextDecorated } });
            updated.push(key + ' #overlay');
            break; // first viable injection only
          }
        } catch {}
      }
    }

    const result = { ok: failed.length === 0, status: failed.length ? 'partial' : 'ok', theme_id: themeId, updated, failed };
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'product-image injection failed' }, { status: 500 });
  }
}



