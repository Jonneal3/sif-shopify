import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const instanceId = searchParams.get('instance_id');
  const shop = searchParams.get('shop');
  const wantBtn = searchParams.get('product_button') === '1';
  const wantImg = searchParams.get('product_image_button') === '1';
  const widgetUrl = searchParams.get('widget_url');
  const pQ = searchParams.get('p');
  // Merge legacy long keys and new compact keys
  const btnTextMerged = searchParams.get('btn_text') ?? searchParams.get('bt');
  const btnBgMerged = searchParams.get('btn_bg') ?? searchParams.get('bb');
  const btnColorMerged = searchParams.get('btn_color') ?? searchParams.get('bc');
  const btnRadiusMerged = searchParams.get('btn_radius') ?? searchParams.get('br');
  const overlayTextMerged = searchParams.get('overlay_text') ?? searchParams.get('ot');
  const overlayBgMerged = searchParams.get('overlay_bg') ?? searchParams.get('ob');
  const overlayColorMerged = searchParams.get('overlay_color') ?? searchParams.get('oc');

  const js = `(() => {
    try {
      const instanceId = ${JSON.stringify(instanceId)};
      const shop = ${JSON.stringify(shop)};
      let wantBtn = ${JSON.stringify(wantBtn)};
      let wantImg = ${JSON.stringify(wantImg)};
      const p = ${JSON.stringify(pQ)};
      if (p) { try { wantBtn = p.includes('b'); wantImg = p.includes('i'); } catch(e){} }
      // Theme-managed UI now; disable script-based placements to avoid duplicates
      wantBtn = false;
      wantImg = false;
      const widgetUrl = ${JSON.stringify(widgetUrl)};
      const btnText = ${JSON.stringify(btnTextMerged)};
      const btnBg = ${JSON.stringify(btnBgMerged)};
      const btnColor = ${JSON.stringify(btnColorMerged)};
      const btnRadius = ${JSON.stringify(btnRadiusMerged)};
      const overlayText = ${JSON.stringify(overlayTextMerged)};
      const overlayBg = ${JSON.stringify(overlayBgMerged)};
      const overlayColor = ${JSON.stringify(overlayColorMerged)};

      // Expose globals for downstream widget
      try { window.SIF_INSTANCE_ID = instanceId; window.SIF_SHOP_DOMAIN = (shop || window.location.hostname); } catch {}

      const onReady = (fn) => {
        if (document.readyState === 'complete' || document.readyState === 'interactive') fn();
        else document.addEventListener('DOMContentLoaded', fn);
      };

      const ensureFallbackModal = () => {
        if (document.getElementById('ai-widget-modal')) return;
        // Overlay
        var modal = document.createElement('div');
        modal.id = 'ai-widget-modal';
        modal.style.display = 'none';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.zIndex = '2147483647';
        modal.style.backgroundColor = '#00000080';
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 300ms ease';
        // Container
        var modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container';
        modalContainer.style.position = 'absolute';
        modalContainer.style.top = '50%';
        modalContainer.style.left = '50%';
        modalContainer.style.transform = 'translate(-50%, -50%)';
        modalContainer.style.width = '80%';
        modalContainer.style.height = '80%';
        modalContainer.style.maxWidth = '600px';
        modalContainer.style.maxHeight = '800px';
        modalContainer.style.background = '#ffffff';
        modalContainer.style.borderRadius = '12px';
        modalContainer.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
        modalContainer.style.overflow = 'hidden';
        modalContainer.style.transition = 'all 300ms ease';
        modalContainer.style.opacity = '0';
        // Inner scroll
        var inner = document.createElement('div');
        inner.style.height = '100%';
        inner.style.overflow = 'auto';
        // Iframe
        var iframe = document.createElement('iframe');
        iframe.src = 'https://widget.seeitfirst.app/widget/' + encodeURIComponent(instanceId || '');
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('scrolling', 'auto');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
        iframe.setAttribute('allowtransparency', 'true');
        inner.appendChild(iframe);
        modalContainer.appendChild(inner);
        modal.appendChild(modalContainer);
        document.body.appendChild(modal);

        var animationDuration = 300;
        var showModal = function() {
          modal.style.display = 'block';
          try { document.body.style.overflow = 'hidden'; } catch(e){}
          setTimeout(function(){
            modal.style.opacity = '1';
            modalContainer.style.opacity = '1';
            modalContainer.style.transform = 'translate(-50%, -50%) scale(1)';
          }, 10);
        };
        var hideModal = function() {
          modal.style.opacity = '0';
          modalContainer.style.opacity = '0';
          modalContainer.style.transform = 'translate(-50%, -50%) scale(0.95)';
          setTimeout(function(){
            modal.style.display = 'none';
            try { document.body.style.overflow = ''; } catch(e){}
          }, animationDuration);
        };
        // Init base hidden state
        modal.style.opacity = '0';
        modalContainer.style.opacity = '0';
        modalContainer.style.transform = 'translate(-50%, -50%) scale(0.95)';
        // Close on overlay click
        modal.addEventListener('click', function(e){ if (e.target === modal) hideModal(); });
        // Close on ESC
        document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && modal.style.display === 'block') hideModal(); });
        // Expose global open
        try { window.SIF_OPEN_MODAL = showModal; } catch(e){}
        // Also respond to message
        window.addEventListener('message', function(e){
          if (e && e.data && e.data.type === 'SIF_WIDGET_OPEN') showModal();
        });
      };

      onReady(() => {
        // Optional: exit-intent detector to signal widget if needed
        (function(){
          var IFRAME_MESSAGE_TYPE = 'MAGE_WIDGET_EXIT_INTENT';
          var registered = new Set();
          try {
            window.addEventListener('message', function(event){
              var d = event && event.data;
              if (d && d.type === IFRAME_MESSAGE_TYPE && d.action === 'register' && d.instanceId) {
                try { registered.add(String(d.instanceId)); } catch(e){}
              }
            });
            var notify = function(){
              registered.forEach(function(id){
                document.querySelectorAll('iframe').forEach(function(iframe){
                  try {
                    iframe.contentWindow.postMessage({ type: IFRAME_MESSAGE_TYPE, action: 'exit-intent', instanceId: id }, '*');
                  } catch(e){}
                });
              });
            };
            var leaveTimer;
            document.addEventListener('mousemove', function(e){
              if (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                if (leaveTimer) clearTimeout(leaveTimer);
                leaveTimer = setTimeout(notify, 1000);
              } else {
                if (leaveTimer) clearTimeout(leaveTimer);
              }
            });
            document.addEventListener('visibilitychange', function(){ if (document.hidden) notify(); });
            window.addEventListener('beforeunload', notify);
            window.addEventListener('unload', notify);
          } catch(e){}
        })();
        var isProductPage = function() {
          if (document.querySelector('form[action*="/cart/add"], form[action*="/cart/add.js"], product-form form')) return true;
          if (typeof window !== 'undefined' && window.location && window.location.pathname && window.location.pathname.indexOf('/products/') !== -1) return true;
          var meta = document.querySelector('meta[property="og:type"][content="product"]');
          if (meta) return true;
          return false;
        };

        // Try to resolve widget URL dynamically if not explicitly provided
        var resolvedWidgetUrl = widgetUrl;
        if (!resolvedWidgetUrl || resolvedWidgetUrl === 'auto') {
          var meta = document.querySelector('meta[name="sif:widget_url"]');
          if (meta && meta.getAttribute('content')) resolvedWidgetUrl = meta.getAttribute('content');
          if (!resolvedWidgetUrl) {
            var link = document.querySelector('link[rel="sif-widget"]');
            if (link && link.getAttribute('href')) resolvedWidgetUrl = link.getAttribute('href');
          }
        }
        // Load external widget script (merchant's modal implementation) with fallback
        var widgetLoaded = false;
        if (resolvedWidgetUrl) {
          try {
            var s = document.createElement('script');
            s.src = resolvedWidgetUrl;
            s.async = true;
            s.onload = function(){ widgetLoaded = true; };
            s.onerror = function(){ try { console.warn('[SIF] widget script failed to load', resolvedWidgetUrl); } catch(e){} };
            document.head.appendChild(s);
          } catch (e) { try { console.warn('[SIF] failed to inject widgetUrl', e); } catch(_){} }
        }
        // Always ensure fallback modal exists so clicks do something
        ensureFallbackModal();
        if (wantBtn) {
          // Robust insertion: try repeatedly and watch DOM changes
          var BTN_ID = 'sif-see-it-first-btn';
          var ensureButton = function() {
            if (document.getElementById(BTN_ID)) return true;
            var container = (function() {
              var selectors = [
                '[data-product-description]',
                '.product__description',
                '.product-single__description',
                '[id^="ProductInfo" ] .rte',
                '[id*="ProductInfo" ] .rte',
                '.product__info-container .rte',
                '.product__content .rte',
                '.product__accordion .product__description',
                '.rte.product__description',
                'div[itemprop="description"]',
                '#ProductDescription',
                '#Product-description',
                'article.product',
                '.product__info-wrapper',
                '.product__info',
                '.rte'
              ];
              for (var i = 0; i < selectors.length; i++) {
                var el = document.querySelector(selectors[i]);
                if (el) { try { console.log('[SIF] found description container via', selectors[i]); } catch(e){}; return el; }
              }
              return null;
            })();
            if (!container) {
              // Fallback near add-to-cart form
              var form = document.querySelector('form[action*="/cart/add"], form[action*="/cart/add.js"], product-form form');
              if (!form) { try { console.log('[SIF] no product form found for fallback'); } catch(e){}; return false; }
              var btn2 = document.createElement('button');
              btn2.id = BTN_ID;
              btn2.type = 'button';
              btn2.textContent = (btnText || 'SeeItFirst');
              btn2.style.marginLeft = '8px';
              btn2.style.padding = '10px 14px';
              btn2.style.borderRadius = (btnRadius ? (String(parseInt(btnRadius, 10)) + 'px') : '6px');
              btn2.style.border = '1px solid #1a1a1a';
              btn2.style.background = (btnBg || '#111');
              btn2.style.color = (btnColor || '#fff');
              btn2.addEventListener('click', function() {
                try { if (window.SIF_OPEN_MODAL) { window.SIF_OPEN_MODAL(); return; } } catch(e){}
                window.postMessage({ type: 'SIF_WIDGET_OPEN', instanceId: instanceId, shop: shop }, '*');
              });
              var submit = form.querySelector('button[type="submit"], button[name="add"], [name="add"]');
              if (submit && submit.parentElement) submit.parentElement.appendChild(btn2);
              else form.appendChild(btn2);
              try { console.log('[SIF] inserted button near product form'); } catch(e){}
              return true;
            }
            var btnWrap = document.createElement('div');
            btnWrap.style.marginTop = '12px';
            var btn = document.createElement('button');
            btn.id = BTN_ID;
            btn.type = 'button';
            btn.textContent = (btnText || 'SeeItFirst');
            btn.style.display = 'inline-block';
            btn.style.padding = '10px 14px';
            btn.style.borderRadius = (btnRadius ? (String(parseInt(btnRadius, 10)) + 'px') : '6px');
            btn.style.border = '1px solid #1a1a1a';
            btn.style.background = (btnBg || '#111');
            btn.style.color = (btnColor || '#fff');
            btn.style.cursor = 'pointer';
            btn.addEventListener('click', function() {
              try { if (window.SIF_OPEN_MODAL) { window.SIF_OPEN_MODAL(); return; } } catch(e){}
              window.postMessage({ type: 'SIF_WIDGET_OPEN', instanceId: instanceId, shop: shop }, '*');
            });
            btnWrap.appendChild(btn);
            container.appendChild(btnWrap);
            try { console.log('[SIF] inserted button in description container'); } catch(e){}
            return true;
          };
          // Try immediately, then observe DOM for late-loaded sections
          var inserted = ensureButton();
          // If no container found, force a floating button after a short retry window
          if (!inserted) {
            var forceTimer = setTimeout(function(){
              if (document.getElementById(BTN_ID)) return;
              var float = document.createElement('button');
              float.id = BTN_ID;
              float.type = 'button';
              float.textContent = (btnText || 'SeeItFirst');
              float.style.position = 'fixed';
              float.style.right = '16px';
              float.style.bottom = '16px';
              float.style.zIndex = '2147483647';
              float.style.padding = '10px 14px';
              float.style.borderRadius = (btnRadius ? (String(parseInt(btnRadius, 10)) + 'px') : '22px');
              float.style.border = '1px solid #1a1a1a';
              float.style.background = (btnBg || '#111');
              float.style.color = (btnColor || '#fff');
              float.style.cursor = 'pointer';
              float.addEventListener('click', function(){
                try { if (window.SIF_OPEN_MODAL) { window.SIF_OPEN_MODAL(); return; } } catch(e){}
                window.postMessage({ type: 'SIF_WIDGET_OPEN', instanceId: instanceId, shop: shop }, '*');
              });
              document.body.appendChild(float);
              try { console.log('[SIF] inserted floating button as last-resort'); } catch(e){}
            }, 3500);
          }
          if (!inserted) {
            var attempts = 0;
            var timer = setInterval(function(){
              if (inserted || attempts > 10) { clearInterval(timer); return; }
              attempts++;
              inserted = ensureButton();
            }, 300);
          }
          var observer = new MutationObserver(function() {
            if (inserted) { observer.disconnect(); return; }
            inserted = ensureButton();
            if (inserted) observer.disconnect();
          });
          try { observer.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
          document.addEventListener('shopify:section:load', function() { inserted = ensureButton(); });
          document.addEventListener('shopify:section:select', function() { inserted = ensureButton(); });
        }
        if (wantImg) {
          var OVERLAY_ID = 'sif-see-it-first-img';
          var ensureOverlay = function() {
            if (document.getElementById(OVERLAY_ID)) return true;
            // Try to find a prominent product media element
            var img = document.querySelector([
              'img[src*="/products/"]',
              '.product__media img',
              '.product-media img',
              '[data-product-media] img',
              '.product-media-container img',
              'media-gallery img',
              '.media-gallery img',
              '.product-gallery img',
              '[data-media-id] img',
              'deferred-media img',
              'figure.product__media img',
              '.product__media-list img',
              '.gallery__media img',
              '.main-product__media img',
              '#product-media-gallery img',
              '.product-media-gallery img',
              '[id*="product-media-gallery"] img',
            ].join(','));
            if (!img) return false;
            // Prefer a higher-level media container if available
            var parent = (function() {
              var candidates = [
                '.product__media-wrapper',
                '.product__media',
                '.product-media',
                '.product-media-container',
                '.media-gallery',
                'media-gallery',
                '.product-gallery',
                '[data-media-id]',
                'deferred-media',
                '.product__media-list',
                '.gallery__media',
                '.main-product__media',
                '#product-media-gallery',
                '.product-media-gallery',
                '[id*="product-media-gallery"]',
              ];
              for (var i = 0; i < candidates.length; i++) {
                var el = img.closest ? img.closest(candidates[i]) : null;
                if (el) return el;
              }
              return img.parentElement || null;
            })();
            if (!parent) return false;
            var cs = window.getComputedStyle(parent);
            if (cs && cs.position === 'static') parent.style.position = 'relative';
            var overlay = document.createElement('div');
            overlay.id = OVERLAY_ID;
            overlay.textContent = (overlayText || 'SeeItFirst');
            overlay.style.position = 'absolute';
            overlay.style.right = '8px';
            overlay.style.bottom = '8px';
            overlay.style.background = (overlayBg || 'rgba(0,0,0,0.6)');
            overlay.style.color = (overlayColor || '#fff');
            overlay.style.padding = '6px 10px';
            overlay.style.borderRadius = '6px';
            overlay.style.cursor = 'pointer';
            overlay.style.zIndex = '2147483647';
            overlay.addEventListener('click', function() {
              try { if (window.SIF_OPEN_MODAL) { window.SIF_OPEN_MODAL(); return; } } catch(e){}
              window.postMessage({ type: 'SIF_WIDGET_OPEN', instanceId: instanceId, shop: shop }, '*');
            });
            parent.appendChild(overlay);
            try { console.log('[SIF] inserted overlay on product media'); } catch(e){}
            return true;
          };
          var overlayInserted = ensureOverlay();
          if (!overlayInserted) {
            var tries = 0;
            var t2 = setInterval(function(){
              if (overlayInserted || tries > 20) { clearInterval(t2); return; }
              tries++;
              overlayInserted = ensureOverlay();
            }, 300);
          }
          var ob2 = new MutationObserver(function() {
            if (overlayInserted) { ob2.disconnect(); return; }
            overlayInserted = ensureOverlay();
            if (overlayInserted) ob2.disconnect();
          });
          try { ob2.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
          document.addEventListener('shopify:section:load', function() { overlayInserted = ensureOverlay(); });
          document.addEventListener('shopify:section:select', function() { overlayInserted = ensureOverlay(); });
          // Last-resort: if no media found after a while, show a fixed overlay button
          setTimeout(function(){
            if (document.getElementById(OVERLAY_ID)) return;
            var fixed = document.createElement('div');
            fixed.id = OVERLAY_ID;
            fixed.textContent = (overlayText || 'SeeItFirst');
            fixed.style.position = 'fixed';
            fixed.style.right = '12px';
            fixed.style.bottom = '12px';
            fixed.style.background = (overlayBg || 'rgba(0,0,0,0.6)');
            fixed.style.color = (overlayColor || '#fff');
            fixed.style.padding = '8px 12px';
            fixed.style.borderRadius = '8px';
            fixed.style.cursor = 'pointer';
            fixed.style.zIndex = '2147483647';
            fixed.addEventListener('click', function() {
              try { if (window.SIF_OPEN_MODAL) { window.SIF_OPEN_MODAL(); return; } } catch(e){}
              window.postMessage({ type: 'SIF_WIDGET_OPEN', instanceId: instanceId, shop: shop }, '*');
            });
            document.body.appendChild(fixed);
            try { console.log('[SIF] inserted fixed overlay as fallback'); } catch(e){}
          }, 1500);
        }
        console.log('[SIF] embed initialized', { instanceId, shop, wantBtn, wantImg, widgetUrl });
      });
    } catch (e) { console.warn('[SIF] embed error', e); }
  })();`;

  return new NextResponse(js, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}


