(function(){
  try {
    var CONFIG = window.SIF_CONFIG || {};

    function ensureModal(instanceId, context) {
      var modal = document.getElementById('sif-ai-widget-modal');
      // NEVER use CONFIG.instanceId as fallback - only use the instanceId parameter from the button
      var inst = instanceId || '';
      if (!inst) {
        try { console.warn('[SIF] No instance ID provided to modal'); } catch(_) {}
        return null;
      }
      function buildIframeSrc(inst, ctx){
        var base = 'https://widget.seeitfirst.app/widget/' + encodeURIComponent(inst);
        var parts = [];
        try {
          parts.push('sif_shopify=true');
          if (ctx && ctx.shop) parts.push('shop=' + encodeURIComponent(ctx.shop));
          if (ctx && ctx.productId) parts.push('product_id=' + encodeURIComponent(ctx.productId));
        } catch(_) {}
        var url = base + (parts.length ? ('?' + parts.join('&')) : '');
        try { console.log('[SIF] DEBUG buildIframeSrc', url, { inst: inst, ctx: ctx }); } catch(_){}
        return url;
      }
      function resolveApiOrigin(){
        var apiOrigin = '';
        try { apiOrigin = (window.SIF_CONFIG && window.SIF_CONFIG.apiOrigin) || ''; } catch(_){}
        if (!apiOrigin) {
          try {
            var meta = document.querySelector('meta[name="sif:api_origin"]');
            if (meta && meta.getAttribute('content')) apiOrigin = meta.getAttribute('content');
          } catch(_){}
        }
        if (!apiOrigin) {
          try { apiOrigin = (window.SIF_WIDGET_API_ORIGIN || ''); } catch(_){}
        }
        return apiOrigin;
      }
      function shouldDebugServer(){
        try {
          if (window.SIF_CONFIG && window.SIF_CONFIG.debugServer) return true;
        } catch(_){}
        try {
          var sp = new URLSearchParams(window.location.search);
          var v = sp.get('sif_debug_server');
          if (v === '1' || v === 'true') return true;
          var vAlt = sp.get('debug_server');
          if (vAlt === '1' || vAlt === 'true') return true;
        } catch(_){}
        return false;
      }
      function postServerDebug(event, ctx, images){
        if (!shouldDebugServer()) return;
        try {
          var apiOrigin = resolveApiOrigin();
          if (!apiOrigin) return;
          var url = apiOrigin.replace(/\/+$/,'') + '/api/debug/shopify-context';
          var payload = {
            event: event,
            shop: (ctx && ctx.shop) || '',
            productId: (ctx && ctx.productId) || '',
            productGid: (ctx && ctx.productGid) || '',
            productHandle: (ctx && ctx.productHandle) || '',
            productTitle: (ctx && ctx.productTitle) || '',
            images: Array.isArray(images) ? images : [],
            originHint: (window.location && window.location.origin) || '',
            referer: (document && document.referrer) || '',
            ua: (navigator && navigator.userAgent) || ''
          };
          try { console.log('[SIF] DEBUG server POST', url, { event: event, imagesCount: payload.images.length }); } catch(_){}
          fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
          }).catch(function(){});
        } catch(_){}
      }
      function collectImagesFallback(){
        try {
          var imgs = Array.prototype.slice.call(document.querySelectorAll([
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
            '[id*="product-media-gallery"] img'
          ].join(',')));
          var seen = new Set();
          var out = [];
          for (var i=0;i<imgs.length;i++){
            var s = imgs[i] && (imgs[i].currentSrc || imgs[i].src);
            if (s && s.indexOf('//') === 0) s = 'https:' + s;
            if (!s || seen.has(s)) continue;
            seen.add(s);
            out.push(s);
          }
          try { console.log('[SIF] DEBUG collectImagesFallback count', out.length, out.slice(0,3)); } catch(_){}
          return out;
        } catch(_) { return []; }
      }
      function sendContextToIframe(iframe, ctx){
        try {
          var target = 'https://widget.seeitfirst.app';
          var images = [];
          if (ctx && Array.isArray(ctx.images) && ctx.images.length){
            // Normalize to URL strings
            images = ctx.images.map(function(x){
              var u = (typeof x === 'string') ? x : (x && x.src) || (x && x.url) || (x && x.originalSrc) || '';
              if (u && u.indexOf('//') === 0) u = 'https:' + u;
              return u;
            }).filter(function(u){ return !!u; });
          } else {
            images = collectImagesFallback();
          }
          postServerDebug('POSTMESSAGE', ctx, images);
          try { console.log('[PARENT] sending SIF_PRODUCT_CONTEXT', { count: images.length, ctx: {
            shop: (ctx && ctx.shop) || '',
            productId: (ctx && ctx.productId) || '',
            productGid: (ctx && ctx.productGid) || '',
            productHandle: (ctx && ctx.productHandle) || '',
            productTitle: (ctx && ctx.productTitle) || ''
          }}); } catch(_){}
          var payload = {
            type: 'SIF_PRODUCT_CONTEXT',
            shop: (ctx && ctx.shop) || '',
            productId: (ctx && ctx.productId) || '',
            productGid: (ctx && ctx.productGid) || '',
            productHandle: (ctx && ctx.productHandle) || '',
            productTitle: (ctx && ctx.productTitle) || '',
            images: images
          };
          try {
            console.log('[SIF] DEBUG postMessage payload', {
              shop: payload.shop,
              productId: payload.productId,
              productGid: payload.productGid,
              productHandle: payload.productHandle,
              productTitle: payload.productTitle,
              imagesCount: payload.images ? payload.images.length : 0,
              imagesPreview: (payload.images || []).slice(0,3)
            }, 'target:', target);
          } catch(_){}
          iframe.contentWindow && iframe.contentWindow.postMessage(payload, target);
        } catch(_){}
      }
      
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'sif-ai-widget-modal';
        modal.style.cssText = 'display:none;position:fixed;inset:0;background:#0008;z-index:2147483647;';

        var inner = document.createElement('div');
        inner.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:90%;max-width:900px;height:80%;max-height:800px;background:#fff;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);overflow:hidden;';

        var iframe = document.createElement('iframe');
        iframe.id = 'sif-widget-iframe';
        iframe.src = buildIframeSrc(inst, context);
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('loading', 'lazy');
        // minimal: no postMessage or debug server; widget will fetch by product_id

        inner.appendChild(iframe);
        modal.appendChild(inner);
        document.body.appendChild(modal);

        modal.addEventListener('click', function(e){ if (e.target === modal) hide(); });
        document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && modal.style.display === 'block') hide(); });
      } else {
        // ALWAYS update iframe src with the fresh instance ID from the button
        var iframe = document.getElementById('sif-widget-iframe');
        if (iframe) { iframe.src = buildIframeSrc(inst, context); }
      }
      return modal;
    }

    function show(instanceId, context){ 
      var modal = ensureModal(instanceId, context);
      if (modal) {
        modal.style.display = 'block'; 
        document.body.style.overflow = 'hidden';
      }
    }
    function hide(){ var m = document.getElementById('sif-ai-widget-modal'); if (m) { m.style.display = 'none'; document.body.style.overflow = ''; } }

    // Expose public API
    try { window.SIF_OPEN_MODAL = show; } catch(_) {}
    try { window.SIF_HIDE_MODAL = hide; } catch(_) {}

    // Attach click handlers for block button(s)
    function attachButtonHandlers(){
      var buttons = document.querySelectorAll('.sif-ai-button, #sif-ai-button');
      for (var i=0; i<buttons.length; i++) {
        var btn = buttons[i];
        if (btn.__sif_bound) continue;
        // Require instanceId presence for this button
        var resolveInst = function(b){
          return (
            (b && b.getAttribute && b.getAttribute('data-sif-instance-id')) ||
            (b && b.closest && b.closest('[data-sif-instance-id]') && b.closest('[data-sif-instance-id]').getAttribute('data-sif-instance-id')) ||
            ''
          );
        };
        var inst = resolveInst(btn);
        if (!inst) {
          try { btn.setAttribute('disabled', 'true'); } catch(_) {}
          try { btn.style.opacity = '0.7'; btn.style.cursor = 'not-allowed'; } catch(_) {}
          try { btn.title = 'Select an instance in the SeeItFirst app or set Instance ID in block settings'; } catch(_) {}
          continue;
        }
        btn.__sif_bound = true;
        btn.addEventListener('click', function(e){
          try {
            var targetBtn = e.currentTarget || e.target;
            var clickInst = resolveInst(targetBtn);
            var wrapper = targetBtn && targetBtn.closest && targetBtn.closest('.sif-ai-button-wrapper');
            var ctx = {};
            try {
              ctx.shop = getShopDomain();
              if (wrapper && wrapper.getAttribute) {
                ctx.productId = wrapper.getAttribute('data-sif-product-id') || '';
                ctx.productGid = wrapper.getAttribute('data-sif-product-gid') || '';
                ctx.productHandle = wrapper.getAttribute('data-sif-product-handle') || '';
                ctx.productTitle = wrapper.getAttribute('data-sif-product-title') || '';
                // Build clean URL list from explicit JSON attrs; fall back to legacy attrs
                var urls1 = getUrlsFlexible(wrapper, 'data-sif-images-json');
                var urls2 = getUrlsFlexible(wrapper, 'data-sif-media-json');
                var merged = urls1.concat(urls2).map(normalizeUrl).filter(function(u){ return !!u; });
                if (!merged.length) {
                  // Legacy: data-sif-images (array of src or objects)
                  var legacy = getUrlsFlexible(wrapper, 'data-sif-images');
                  if (legacy && legacy.length) merged = legacy;
                }
                if (merged.length) {
                  try { ctx.imagesB64 = btoa(JSON.stringify(merged.slice(0, 8))); } catch(_){}
                } else {
                  try { console.warn('[SIF] No product image URLs found in data-sif-images-json/media-json or legacy data-sif-images'); } catch(_){}
                }
              }
            } catch(_) {}
            try {
              console.log('[SIF] DEBUG click context', {
                instanceId: clickInst,
                shop: ctx.shop,
                productId: ctx.productId,
                productGid: '',
                productHandle: '',
                productTitle: ''
              });
            } catch(_){}
            if (!clickInst) {
              try { console.warn('[SIF] Button clicked but no instance ID found on button'); } catch(_) {}
              return; // Don't open modal without instance ID
            }
            // ALWAYS use the instance ID from the button itself, never CONFIG fallback
            show(clickInst, ctx);
          } catch(err){
            try { console.error('[SIF] Button click error:', err); } catch(_) {}
          }
        });
      }
    }

    // Optional: small overlay badge (app embed setting based)
    function ensureOverlay(){
      if (!CONFIG.overlayText) return; // not enabled
      if (document.getElementById('sif-ai-overlay')) return;

      var overlay = document.createElement('div');
      overlay.id = 'sif-ai-overlay';
      overlay.textContent = CONFIG.overlayText || 'SeeItFirst';
      overlay.style.position = 'fixed';
      overlay.style.right = '8px';
      overlay.style.bottom = '8px';
      overlay.style.padding = '6px 10px';
      overlay.style.borderRadius = '6px';
      overlay.style.cursor = 'pointer';
      overlay.style.zIndex = '2147483647';
      overlay.style.background = CONFIG.overlayBg || 'rgba(0,0,0,0.6)';
      overlay.style.color = CONFIG.overlayColor || '#fff';
      overlay.addEventListener('click', function(){ 
        // Try to find instance ID from any button on the page
        var inst = readInstanceId();
        if (inst) {
          show(inst);
        } else {
          try { console.warn('[SIF] Overlay clicked but no instance ID found'); } catch(_) {}
        }
      });
      document.body.appendChild(overlay);
    }

    function getShopDomain(){
      try { return (window.Shopify && window.Shopify.shop) || new URL(window.location.href).host; } catch(_) { return ''; }
    }

    function readInstanceId(){
      // Prefer explicit data attribute on button or wrapper - NO CONFIG fallback
      var el = document.querySelector('.sif-ai-button, #sif-ai-button');
      if (!el) return '';
      return (
        el.getAttribute('data-sif-instance-id') ||
        el.getAttribute('data-instance') ||
        (el.closest('[data-sif-instance-id]') && el.closest('[data-sif-instance-id]').getAttribute('data-sif-instance-id')) ||
        ''
      );
    }

    function applyButtonConfig(btn, cfg){
      if (!btn || !cfg) return;
      if (cfg.text) btn.textContent = cfg.text;
      if (cfg.bg) btn.style.backgroundColor = cfg.bg;
      if (cfg.color) btn.style.color = cfg.color;
      if (typeof cfg.radius === 'number') btn.style.borderRadius = String(cfg.radius) + 'px';
    }

    async function fetchInstanceConfig(shop, instanceId){
      if (!shop || !instanceId) return null;
      // Resolve API origin from config or meta tag to avoid storefront 404s
      var apiOrigin = '';
      try { apiOrigin = (window.SIF_CONFIG && window.SIF_CONFIG.apiOrigin) || ''; } catch(_){}
      if (!apiOrigin) {
        try {
          var meta = document.querySelector('meta[name="sif:api_origin"]');
          if (meta && meta.getAttribute('content')) apiOrigin = meta.getAttribute('content');
        } catch(_){}
      }
      if (!apiOrigin) {
        try { apiOrigin = (window.SIF_WIDGET_API_ORIGIN || ''); } catch(_){}
      }
      if (!apiOrigin) {
        try { console.log('[SIF] DEBUG fetchInstanceConfig skipped: missing apiOrigin'); } catch(_){}
        return null;
      }
      var url = apiOrigin.replace(/\/+$/,'') + '/api/instances/config?shop=' + encodeURIComponent(shop) + '&instance_id=' + encodeURIComponent(instanceId);
      try {
        var res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) return null;
        var json = await res.json();
        return json && json.config ? json.config : null;
      } catch(_) { return null; }
    }

    async function init(){
      // Suppress any legacy modal that could darken the page
      try {
        var legacy = document.getElementById('ai-widget-modal');
        if (legacy) {
          legacy.style.display = 'none';
          if (legacy.parentElement) legacy.parentElement.removeChild(legacy);
        }
      } catch(_){}

      attachButtonHandlers();
      ensureOverlay();

      // Dynamic config by (shop, instance_id) - but DON'T set CONFIG.instanceId globally
      // Each button should use its own instance ID from its data attribute
      var shop = getShopDomain();
      // Only read instance ID for config fetch, don't set it globally
      var instanceId = readInstanceId();
      var config = await fetchInstanceConfig(shop, instanceId);
      if (config) {
        try {
          var buttons = document.querySelectorAll('.sif-ai-button, #sif-ai-button');
          for (var i=0; i<buttons.length; i++) applyButtonConfig(buttons[i], config.button || {});
          // Optionally render overlay if enabled and no embed-provided overlay
          if (config.enableOverlay && !document.getElementById('sif-ai-overlay')) {
            CONFIG.overlayText = (config.overlay && config.overlay.text) || CONFIG.overlayText;
            CONFIG.overlayBg = (config.overlay && config.overlay.bg) || CONFIG.overlayBg;
            CONFIG.overlayColor = (config.overlay && config.overlay.color) || CONFIG.overlayColor;
            ensureOverlay();
          }
        } catch(_) {}
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    var mo = new MutationObserver(function(){ attachButtonHandlers(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function(){ mo.disconnect(); }, 10000);
  } catch (e) {
    try { console.error('[SIF] widget init failed:', e); } catch(_) {}
  }
})();


