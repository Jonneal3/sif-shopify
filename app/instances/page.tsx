'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseEmbedded } from '@/lib/supabaseEmbedded';
import { Card, IndexTable, Page, Text, Button, Banner, Checkbox, TextField, Select } from '@shopify/polaris';
import { Spinner } from '@shopify/polaris';

type Instance = {
  id: string;
  name: string;
  created_at: string | null;
  account_id: string | null;
};

export default function InstancesPage() {
  const authedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shop, setShop] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorInstall, setErrorInstall] = useState<string | null>(null);
  const [installLoading, setInstallLoading] = useState<boolean>(false);
  const [toggleOverlayLoading, setToggleOverlayLoading] = useState<boolean>(false);
  const [placeProductImageButton, setPlaceProductImageButton] = useState<boolean>(false);
  const [selectionSaving, setSelectionSaving] = useState<boolean>(false);
  const [themeInjectLoading, setThemeInjectLoading] = useState<boolean>(false);
  const [saveConfigLoading, setSaveConfigLoading] = useState<boolean>(false);
  const [manualApplyLoading, setManualApplyLoading] = useState<boolean>(false);
  const [checkThemesLoading, setCheckThemesLoading] = useState<boolean>(false);
  const [configUpdateLoading, setConfigUpdateLoading] = useState<boolean>(false);
  // Customization state (overlay only)
  const [overlayText, setOverlayText] = useState<string>('SeeItFirst');
  const [overlayBg, setOverlayBg] = useState<string>('rgba(0,0,0,0.6)');
  const [overlayColor, setOverlayColor] = useState<string>('#fff');
  const [showImgConfig, setShowImgConfig] = useState<boolean>(false);
  const [themes, setThemes] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string>('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [serverHydrated, setServerHydrated] = useState<boolean>(false);
  const lastAppliedConfig = useRef<string>('');

  // Initialize shop/host/account from URL or localStorage
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qsShop = sp.get('shop');
    if (qsShop) setShop(qsShop);
    else {
      try {
        const ls = localStorage.getItem('sif_last_shop');
        if (ls) setShop(ls);
      } catch {}
    }
    setAccountId(sp.get('account_id'));
    const qsHost = sp.get('host');
    if (qsHost) setHost(qsHost);
    else {
      try {
        const lh = localStorage.getItem('sif_last_host');
        if (lh) setHost(lh);
      } catch {}
    }
    const qsInstance = sp.get('instance_id');
    if (qsInstance) setSelectedId(qsInstance);

    // Ensure URL carries shop/host for embedded routes
    try {
      let mutated = false;
      const shopLs = localStorage.getItem('sif_last_shop');
      const hostLs = localStorage.getItem('sif_last_host');
      if (!sp.get('shop') && shopLs) { sp.set('shop', shopLs); mutated = true; }
      if (!sp.get('host') && hostLs) { sp.set('host', hostLs); mutated = true; }
      if (mutated) {
        const newUrl = `${window.location.pathname}?${sp.toString()}`;
        window.history.replaceState({}, '', newUrl);
      }
    } catch {}
  }, []);

  // Resolve account_id from active link if missing (embedded iframe)
  useEffect(() => {
    const run = async () => {
      if (accountId || !shop) return;
      try {
        const res = await authedFetch(`/api/accounts/active?shop=${encodeURIComponent(shop)}`);
        const json = await res.json();
        if (res.ok && json?.connected && json?.account_id) {
          setAccountId(json.account_id);
          const sp = new URLSearchParams(window.location.search);
          sp.set('account_id', json.account_id);
          const newUrl = `${window.location.pathname}?${sp.toString()}`;
          window.history.replaceState({}, '', newUrl);
        }
      } catch {}
    };
    run();
  }, [accountId, shop, authedFetch]);

  // Resolve shopify_store_id once per shop
  useEffect(() => {
    const loadStoreId = async () => {
      if (!shop) return;
      try {
        const res = await authedFetch(`/api/debug/shopify-store?shop=${encodeURIComponent(shop)}`);
        const json = await res.json();
        if (res.ok && json?.store?.id) setStoreId(json.store.id);
      } catch {}
    };
    loadStoreId();
  }, [shop, authedFetch]);

  // Supabase Realtime: mirror accounts_shopify changes (guarded to prevent overwriting user actions)
  useEffect(() => {
    if (!accountId || !storeId || !serverHydrated) return;
    const supabase = getSupabaseEmbedded();
    const channelName = `acs_${accountId}_${storeId}`;
    const channel = (supabase as any).channel(channelName);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'accounts_shopify', filter: `account_id=eq.${accountId}` },
      (payload: any) => {
        const row = payload?.new || payload?.old;
        if (!row) return;
        if (String(row.shopify_store_id) !== String(storeId)) return;
        // Only update selection if it differs from current
        if (row.selected_instance_id && row.selected_instance_id !== selectedId) {
          setSelectedId(row.selected_instance_id);
        } else if (row.selected_instance_id === null && selectedId !== null) {
          setSelectedId(null);
        }
        if (typeof row.enable_product_image === 'boolean') setPlaceProductImageButton(Boolean(row.enable_product_image));
      }
    ).subscribe();
    return () => {
      try {
        if ((supabase as any).removeChannel) {
          (supabase as any).removeChannel(channel);
        } else if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
      } catch {}
    };
  }, [accountId, storeId, serverHydrated, selectedId]);

  // Embedded auth fallback
  useEffect(() => {
    const supabase = getSupabaseEmbedded();
    const handler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if ((event as any).data?.type === 'SIF_SUPABASE_SESSION') {
        const { access_token, refresh_token } = (event as any).data;
        await supabase.auth.setSession({ access_token, refresh_token });
        location.reload();
      }
    };
    window.addEventListener('message', handler);
    let unsub = () => {};
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('sif-auth');
      const onBc = async (event: MessageEvent) => {
        if ((event as any).data?.type === 'SIF_SUPABASE_SESSION') {
          const { access_token, refresh_token } = (event as any).data;
          await supabase.auth.setSession({ access_token, refresh_token });
          location.reload();
        }
      };
      bc.addEventListener('message', onBc);
      unsub = () => bc.removeEventListener('message', onBc);
    }
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          const tried = sessionStorage.getItem('sif_auth_tried');
          if (!tried) {
            sessionStorage.setItem('sif_auth_tried', '1');
            const sp = new URLSearchParams(window.location.search);
            const hostQ = sp.get('host');
            const shopQ = sp.get('shop');
            const url = `/auth?embedded=1&force=1${shopQ ? `&shop=${encodeURIComponent(shopQ)}` : ''}${hostQ ? `&host=${encodeURIComponent(hostQ)}` : ''}`;
            window.open(url, 'sif-auth', 'width=520,height=640');
          }
        }
      } catch {}
    })();
    return () => {
      window.removeEventListener('message', handler);
      unsub();
    };
  }, []);

  const openLogin = () => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const hostQ = sp.get('host');
      const shopQ = sp.get('shop');
      const url = `/auth?embedded=1&force=1${shopQ ? `&shop=${encodeURIComponent(shopQ)}` : ''}${hostQ ? `&host=${encodeURIComponent(hostQ)}` : ''}`;
      window.open(url, 'sif-auth', 'width=520,height=640');
    } catch {}
  };

  // ✅ HYDRATION: Load account info and instances (NO THEME INJECTION)
  useEffect(() => {
    const loadAccountAndInstances = async () => {
      if (!accountId || !shop) return;

      setLoading(true);
      setError(null);

      try {
        // 1. Fetch instances
        const resInstances = await authedFetch(`/api/instances?account_id=${encodeURIComponent(accountId)}`);
        const instancesJson = await resInstances.json();
        if (!resInstances.ok) throw new Error(instancesJson?.error || 'Failed to load instances');
        setInstances(((instancesJson?.instances as unknown) as Instance[]) || []);

        // 2. Fetch account_shopify row (selected instance + placement flags)
        const resAccount = await authedFetch(`/api/accounts/ui-state?shop=${encodeURIComponent(shop)}&account_id=${encodeURIComponent(accountId)}`);
        const accountJson = await resAccount.json();
        const accountState = accountJson?.state;

        // 3. Pre-select instance if exists (NO THEME INJECTION)
        if (accountState?.selected_instance_id) {
          setSelectedId(accountState.selected_instance_id);
        }

        // 4. Load placement flags from DB (overlay only)
        if (typeof accountState?.enable_product_image === 'boolean') {
          setPlaceProductImageButton(accountState.enable_product_image);
        }

        // 5. Load overlay customization values from JSON configs (preferred) or legacy fields
        if (accountState?.overlay_config) {
          const ov = accountState.overlay_config;
          if (typeof ov.text === 'string') setOverlayText(ov.text);
          if (typeof ov.bg === 'string') setOverlayBg(ov.bg);
          if (typeof ov.color === 'string') setOverlayColor(ov.color);
        } else {
          // Fallback to legacy fields
          if (typeof accountState?.overlay_text === 'string') setOverlayText(accountState.overlay_text);
          if (typeof accountState?.overlay_bg === 'string') setOverlayBg(accountState.overlay_bg);
          if (typeof accountState?.overlay_color === 'string') setOverlayColor(accountState.overlay_color);
        }

        setServerHydrated(true);
      } catch (e: any) {
        setError(e?.message || 'Failed to load account data');
      } finally {
        setLoading(false);
      }
    };

    loadAccountAndInstances();
  }, [accountId, shop, authedFetch]);

  // ✅ INSTANCE SELECTION HANDLER: Only update DB, clean up previous if switching
  const handleSelectInstance = async (id: string | null) => {
    console.log('[handleSelectInstance] START', { id, shop, accountId, prevId: selectedId });
    
    if (!shop || !accountId) {
      console.error('[handleSelectInstance] Missing shop or accountId', { shop, accountId });
      return;
    }

    // Ensure id is explicitly null (not undefined) when clearing
    const instanceId = id === undefined ? null : id;
    
    const prevId = selectedId;
    setSelectedId(instanceId);
    setPrevSelectedId(prevId);

    // Update URL
    try {
      const sp = new URLSearchParams(window.location.search);
      if (instanceId) sp.set('instance_id', instanceId);
      else sp.delete('instance_id');
      const newUrl = `${window.location.pathname}?${sp.toString()}`;
      window.history.replaceState({}, '', newUrl);
    } catch (e) {
      console.error('[handleSelectInstance] URL update failed', e);
    }

    // Prepare request body
    const requestBody = {
      shop,
      account_id: accountId,
      selected_instance_id: instanceId,
    };
    
    console.log('[handleSelectInstance] Sending request', {
      url: '/api/accounts/ui-state',
      method: 'POST',
      body: requestBody,
      selected_instance_id_type: typeof instanceId,
      selected_instance_id_value: instanceId,
      is_null: instanceId === null,
      is_undefined: instanceId === undefined,
    });

    // Persist selection to Supabase (NO THEME INJECTION)
    setSelectionSaving(true);
    try {
      const response = await authedFetch('/api/accounts/ui-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      const responseJson = await response.json();
      console.log('[handleSelectInstance] Response received', {
        ok: response.ok,
        status: response.status,
        body: responseJson,
      });
      
      if (!response.ok) {
        throw new Error(responseJson?.error || 'Failed to save selection');
      }
    } catch (e: any) {
      console.error('[handleSelectInstance] Error saving selection', {
        error: e,
        message: e?.message,
        stack: e?.stack,
      });
      setError(e?.message || 'Failed to save selection');
    } finally {
      setSelectionSaving(false);
      console.log('[handleSelectInstance] END');
    }

    // Clean up previous instance placements if switching (overlay only)
    if (prevId && prevId !== id) {
      try {
        // Remove product image overlay for previous instance
        await authedFetch('/api/shopify/theme-inject/product-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop, instance_id: prevId, enable_overlay: false }),
        });
      } catch {}
    }
  };

  // ✅ OVERLAY TOGGLE HANDLER: Only inject when user manually toggles checkbox
  const handleToggleOverlay = async (value: boolean) => {
    if (!selectedId || !shop || !accountId) return;

    setToggleOverlayLoading(true);
    setPlaceProductImageButton(value);
    setErrorInstall(null);
    setNotice(null);

    (async () => {
      try {
        setThemeInjectLoading(true);
        let themeId: string | undefined;
        let updated: string[] = [];
        let failed: Array<{ key: string; reason: string }> = [];

        const resp = await authedFetch('/api/shopify/theme-inject/product-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop,
            theme_id: selectedThemeId || undefined,
            instance_id: selectedId,
            enable_overlay: value,
            overlay_text: overlayText,
            overlay_bg: overlayBg,
            overlay_color: overlayColor,
          }),
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json?.error || 'Theme injection failed');
        themeId = json?.theme_id;
        updated = json?.updated || [];
        failed = json?.failed || [];

        if (failed.length > 0) {
          setNotice(`Theme injection partial. Theme ${themeId ?? 'unknown'}. Updated: ${updated.join(', ') || 'none'}. Failed: ${failed.map((f: any) => f.key).join(', ')}`);
        } else {
          setNotice(`Embedded via Theme. Theme ${themeId ?? 'unknown'}. Updated: ${updated.join(', ') || 'none'}`);
        }

        setSaveConfigLoading(true);
        await authedFetch('/api/accounts/ui-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop,
            account_id: accountId,
            selected_instance_id: selectedId,
            enable_overlay: value,
            overlay_config: {
              text: overlayText,
              bg: overlayBg,
              color: overlayColor,
            },
          }),
        });
        setSaveConfigLoading(false);
      } catch (e: any) {
        setErrorInstall(e?.message || 'Failed to apply placement');
        setPlaceProductImageButton(!value);
      } finally {
        setThemeInjectLoading(false);
        setToggleOverlayLoading(false);
      }
    })();
  };

  // Debounced reinstall when customization changes (only if placements are enabled)
  const currentConfigSignature = () => {
    return JSON.stringify({
      overlayText, overlayBg, overlayColor,
      inst: selectedId, shop,
    });
  };

  // Prevent concurrent theme-inject requests
  const injectRequestInFlight = useRef(false);
  const injectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!selectedId || !shop || !serverHydrated) return;
    const enable = placeProductImageButton;
    if (!enable) return;

    // Prevent concurrent requests
    if (injectRequestInFlight.current) {
      console.log('[instances] theme-inject request already in flight, skipping');
      return;
    }

    const sig = currentConfigSignature();
    if (sig === lastAppliedConfig.current) return;

    // Clear any existing timeout
    if (injectTimeoutRef.current) {
      clearTimeout(injectTimeoutRef.current);
    }

    const handle = setTimeout(async () => {
      // Double-check we're not already processing
      if (injectRequestInFlight.current) {
        console.log('[instances] theme-inject request already in flight (in timeout), skipping');
        return;
      }

      injectRequestInFlight.current = true;
      try {
        setConfigUpdateLoading(true);
        // Apply customization changes to overlay only
        const results: Array<{ updated: string[]; failed: any[]; theme_id?: string }> = [];
        if (placeProductImageButton) {
          const respOv = await authedFetch('/api/shopify/theme-inject/product-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shop,
              theme_id: selectedThemeId || undefined,
              instance_id: selectedId,
              enable_overlay: true,
              overlay_text: overlayText,
              overlay_bg: overlayBg,
              overlay_color: overlayColor,
            }),
          });
          const j = await respOv.json();
          if (!respOv.ok) throw new Error(j?.error || 'Theme injection (overlay) failed');
          results.push({ updated: j?.updated || [], failed: j?.failed || [], theme_id: j?.theme_id });
        }

        if (results.length > 0) {
          const themeId = results[0]?.theme_id;
          const allUpdated = results.flatMap(r => r.updated);
          const allFailed = results.flatMap(r => r.failed);
          // Update notice similar to before
          // (we keep UI message but merge results from both calls)
          // Save UI state handled below
          lastAppliedConfig.current = currentConfigSignature();
          // Save UI state with JSON configs
          try {
            await authedFetch('/api/accounts/ui-state', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                shop,
                account_id: accountId,
                selected_instance_id: selectedId,
                enable_overlay: placeProductImageButton,
                overlay_config: {
                  text: overlayText,
                  bg: overlayBg,
                  color: overlayColor,
                },
              }),
            });
          } catch {}
        }
      } catch (e: any) {
        console.error('[instances] theme-inject error:', e);
      } finally {
        setConfigUpdateLoading(false);
        injectRequestInFlight.current = false;
      }
    }, 1200);

    injectTimeoutRef.current = handle;

    return () => {
      if (injectTimeoutRef.current) {
        clearTimeout(injectTimeoutRef.current);
        injectTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayText, overlayBg, overlayColor, selectedId, shop, placeProductImageButton, serverHydrated]);

  const onGrantPermission = () => {
    if (!shop) return;
    const url = `/api/auth?shop=${encodeURIComponent(shop)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const onBack = () => {
    try {
      const qp = new URLSearchParams();
      if (shop) qp.set('shop', shop);
      if (host) qp.set('host', host);
      location.assign(`/accounts?${qp.toString()}`);
    } catch {
      history.back();
    }
  };

  const onLogout = async () => {
    const supabase = getSupabaseEmbedded();
    await supabase.auth.signOut();
    location.assign('/');
  };

  const rows = useMemo(() => instances.map((inst, index) => (
    <IndexTable.Row id={inst.id} key={inst.id} position={index}>
      <IndexTable.Cell>
        <input
          type="checkbox"
          checked={selectedId === inst.id}
          onClick={(e) => { e.stopPropagation(); }}
          onChange={() => handleSelectInstance(selectedId === inst.id ? null : inst.id)}
        />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span">{inst.name || inst.id}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{inst.created_at ? new Date(inst.created_at).toLocaleString() : '-'}</IndexTable.Cell>
    </IndexTable.Row>
  )), [instances, selectedId]);

  return (
    <Page title="Choose an instance" primaryAction={{ content: 'Logout', onAction: onLogout }}>
      <Card>
        {loading ? (
          <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Spinner accessibilityLabel="Loading instances" size="large" />
            <Text as="p" variant="bodyMd">Loading instances from database…</Text>
          </div>
        ) : error ? (
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <Text as="p" tone="critical">{error}</Text>
            {error === 'Not signed in' ? (
              <div>
                <Button onClick={openLogin} variant="primary">Sign in</Button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              {notice ? <Banner tone="success">{notice}</Banner> : null}
              {selectionSaving ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Spinner accessibilityLabel="Saving selection" size="small" />
                  <Text as="p" variant="bodySm">Saving selection…</Text>
                </div>
              ) : null}
              {errorInstall ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <Banner tone="critical">{errorInstall}</Banner>
                  {(/requires merchant approval/i.test(errorInstall) || /write_script_tags/i.test(errorInstall)) ? (
                    <div>
                      <Button onClick={onGrantPermission} variant="primary" disabled={!shop}>Grant ScriptTag permission</Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <Text as="p" variant="bodyMd">Choose one instance and where to place the SeeItFirst UI.</Text>
                {configUpdateLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#f6f6f7', borderRadius: 6 }}>
                    <Spinner accessibilityLabel="Updating configuration" size="small" />
                    <Text as="span" variant="bodySm" tone="subdued">Applying customization changes...</Text>
                  </div>
                )}
                {/* Product button controls removed (now handled by Theme App Extension) */}

                {/* Product image overlay toggle + customization */}
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Checkbox label="Product image" checked={placeProductImageButton} onChange={(checked) => handleToggleOverlay(Boolean(checked))} disabled={!selectedId || toggleOverlayLoading} />
                    {toggleOverlayLoading && <Spinner accessibilityLabel="Toggling overlay" size="small" />}
                    {themeInjectLoading && !toggleOverlayLoading && <Text as="span" variant="bodySm" tone="subdued">Updating theme...</Text>}
                    {saveConfigLoading && !toggleOverlayLoading && !themeInjectLoading && <Text as="span" variant="bodySm" tone="subdued">Saving...</Text>}
                  </div>
                  <div style={{ marginLeft: 24, display: 'grid', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setShowImgConfig(!showImgConfig)}
                      disabled={!selectedId}
                      style={{ textAlign: 'left', padding: 8, borderRadius: 6, border: '1px solid #e5e5e5', background: '#fafafa', cursor: 'pointer' }}
                    >
                      {showImgConfig ? '▼' : '▶'} Customize product image overlay
                    </button>
                    {showImgConfig ? (
                      <div style={{ display: 'grid', gap: 8, paddingTop: 6 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <TextField label="Overlay text" value={overlayText} onChange={(v) => setOverlayText(v)} disabled={!selectedId || !placeProductImageButton} autoComplete="off" />
                          <div />
                          <TextField label="Overlay background" value={overlayBg} onChange={(v) => setOverlayBg(v)} disabled={!selectedId || !placeProductImageButton} autoComplete="off" />
                          <TextField label="Overlay text color" value={overlayColor} onChange={(v) => setOverlayColor(v)} disabled={!selectedId || !placeProductImageButton} autoComplete="off" />
                        </div>
                        {/* Live preview */}
                        <div style={{ position: 'relative', width: 280, height: 160, background: '#f4f4f5', border: '1px solid #e5e5e5', borderRadius: 8 }}>
                          <div
                            style={{
                              position: 'absolute',
                              right: 8,
                              bottom: 8,
                              background: overlayBg,
                              color: overlayColor,
                              padding: '6px 10px',
                              borderRadius: 6,
                              fontSize: 13,
                            }}
                          >
                            {overlayText || 'SeeItFirst'}
                          </div>
                        </div>
                        <div>
                          <Button
                            onClick={async () => {
                              if (!shop) return;
                              setManualApplyLoading(true);
                              setErrorInstall(null);
                              setNotice(null);
                              try {
                                const resp = await authedFetch('/api/shopify/theme-inject/product-image', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    shop,
                                    theme_id: selectedThemeId || undefined,
                                    instance_id: selectedId,
                                    enable_overlay: placeProductImageButton,
                                    overlay_text: overlayText,
                                    overlay_bg: overlayBg,
                                    overlay_color: overlayColor,
                                  }),
                                });
                                const json = await resp.json();
                                if (!resp.ok) throw new Error(json?.error || 'Theme injection failed');
                                setNotice(`Overlay snippet inserted. Theme ${json.theme_id}. Updated: ${(json.updated || []).join(', ') || 'none'}`);
                              } catch (e: any) {
                                setErrorInstall(e?.message || 'Theme injection failed');
                              } finally {
                                setManualApplyLoading(false);
                              }
                            }}
                            disabled={!shop}
                            loading={manualApplyLoading}
                          >
                            Apply overlay to theme
                          </Button>
                          <Button
                            onClick={async () => {
                              if (!shop) return;
                              setCheckThemesLoading(true);
                              setErrorInstall(null);
                              setNotice(null);
                              try {
                                const resp = await authedFetch(`/api/shopify/themes?shop=${encodeURIComponent(shop)}`);
                                const json = await resp.json();
                                if (!resp.ok) throw new Error(json?.error || 'Failed to list themes');
                                const opts = (json.themes || []).map((t: any) => ({ value: String(t.id), label: `${t.id} • ${t.name} • ${t.role}` }));
                                setThemes(opts);
                                const main = (json.themes || []).find((t: any) => t.role === 'main');
                                if (main?.id) setSelectedThemeId(String(main.id));
                                setNotice(`Loaded ${opts.length} themes`);
                              } catch (e: any) {
                                setErrorInstall(e?.message || 'Failed to list themes');
                              } finally {
                                setCheckThemesLoading(false);
                              }
                            }}
                            disabled={!shop}
                            loading={checkThemesLoading}
                          >
                            Check themes
                          </Button>
                          {themes.length > 0 ? (
                            <div style={{ marginTop: 8, maxWidth: 520 }}>
                              <Select
                                label="Target theme"
                                options={themes}
                                onChange={(v) => setSelectedThemeId(v)}
                                value={selectedThemeId}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <IndexTable
              resourceName={{ singular: 'instance', plural: 'instances' }}
              itemCount={instances.length}
              selectable={false}
              headings={[
                { title: 'Select' },
                { title: 'Name' },
                { title: 'Created' },
              ]}
            >
              {rows}
            </IndexTable>
          </>
        )}
      </Card>
    </Page>
  );
}
