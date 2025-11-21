'use client';
export const dynamic = 'force-dynamic';

import { Card, Layout, Link, Page, Button, Text, Banner, Badge } from '@shopify/polaris';
import { useEffect, useState } from 'react';
import { getSupabaseEmbedded } from '@/lib/supabaseEmbedded';

export default function HomePage() {
  const [qpStr, setQpStr] = useState('');
  const [needsLogin, setNeedsLogin] = useState<boolean>(true);
  const [checking, setChecking] = useState<boolean>(true);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [needsInstall, setNeedsInstall] = useState<boolean>(false);
  const [shopParam, setShopParam] = useState<string | null>(null);
  const [hostParam, setHostParam] = useState<string | null>(null);
  const [installChecked, setInstallChecked] = useState<boolean>(false);
  const [sessionChecked, setSessionChecked] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const host = sp.get('host');
    const shop = sp.get('shop');
    const error = sp.get('error');
    const errorMessage = sp.get('error_message');
    if (error || errorMessage) setCallbackError(errorMessage || error);
    const qp = new URLSearchParams();
    if (host) qp.set('host', host);
    if (shop) qp.set('shop', shop);
    setQpStr(qp.toString());
    setShopParam(shop);
    setHostParam(host);
    try {
      if (shop) localStorage.setItem('sif_last_shop', shop);
      if (host) localStorage.setItem('sif_last_host', host);
    } catch {}
  }, []);

  useEffect(() => {
    let unsub = () => {};
    const supabase = getSupabaseEmbedded();
    const handler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'SIF_SUPABASE_SESSION') {
        const { access_token, refresh_token } = event.data;
        await supabase.auth.setSession({ access_token, refresh_token });
        setNeedsLogin(false);
      }
    };
    window.addEventListener('message', handler);
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('sif-auth');
      const onBc = async (event: MessageEvent) => {
        if ((event as any).data?.type === 'SIF_SUPABASE_SESSION') {
          const { access_token, refresh_token } = (event as any).data;
          await supabase.auth.setSession({ access_token, refresh_token });
          setNeedsLogin(false);
        }
      };
      bc.addEventListener('message', onBc);
      unsub = () => bc.removeEventListener('message', onBc);
    }
    return () => {
      window.removeEventListener('message', handler);
      unsub();
    };
  }, []);

  // Check install status first; if not installed, show connect UI (no auto-redirect)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const shop = sp.get('shop');
    if (!shop) { setInstallChecked(true); setChecking(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/debug/shopify-store?shop=${encodeURIComponent(shop)}`);
        if (res.status === 404) {
          setNeedsInstall(true);
          setInstallChecked(true);
          setChecking(false);
        } else {
          setNeedsInstall(false);
          setInstallChecked(true);
        }
      } catch {
        setInstallChecked(true);
      }
    })();
  }, []);

  // After install is confirmed, check Supabase session
  useEffect(() => {
    if (!installChecked || needsInstall) return;
    try {
      const supabase = getSupabaseEmbedded();
      supabase.auth.getSession().then(({ data }) => {
        setNeedsLogin(!data.session);
        setSessionChecked(true);
        setChecking(false);
      }).catch(() => {
        setNeedsLogin(true);
        setSessionChecked(true);
        setChecking(false);
      });
    } catch {
      setNeedsLogin(true);
      setSessionChecked(true);
      setChecking(false);
    }
  }, [installChecked, needsInstall]);

  // Don't auto-redirect - show landing page instead

  const onInstall = () => {
    const sp = new URLSearchParams(window.location.search);
    const shop = sp.get('shop');
    if (!shop) return;
    const authUrl = `/api/auth?shop=${encodeURIComponent(shop)}`;
    // Open in a new tab for reliability inside Shopify iframe
    window.open(authUrl, '_blank', 'noopener,noreferrer');
  };

  const openLogin = () => {
    const sp = new URLSearchParams(window.location.search);
    const host = sp.get('host');
    const shop = sp.get('shop');
    const url = `/auth?embedded=1&force=1${shop ? `&shop=${encodeURIComponent(shop)}` : ''}${host ? `&host=${encodeURIComponent(host)}` : ''}`;
    window.open(url, 'sif-auth', 'width=520,height=640');
  };

  const onInlineLogin = () => { try { openLogin(); } catch {} };

  const onLogout = async () => {
    const supabase = getSupabaseEmbedded();
    await supabase.auth.signOut();
    setNeedsLogin(true);
  };

  return (
    <Page
      primaryAction={!checking && !needsLogin ? { content: 'Logout', onAction: onLogout } : undefined}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: 16 }}>
              {callbackError ? (
                <Text as="p" tone="critical">{callbackError}</Text>
              ) : null}
              {checking ? (
                <Text as="p" variant="bodyMd">Checking session…</Text>
              ) : needsInstall ? (
                <div style={{ display: 'grid', gap: 16, alignItems: 'center', justifyItems: 'start' }}>
                  <Text as="p" variant="bodyMd">Connect your Shopify store to continue.</Text>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Button onClick={onInstall} variant="primary">Connect to SeeItFirst</Button>
                  </div>
                </div>
              ) : needsLogin ? (
                <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
                  {loginError ? <Text as="p" tone="critical">{loginError}</Text> : null}
                  <Text as="p" variant="bodyMd">Sign in to continue.</Text>
                  <Button onClick={onInlineLogin} variant="primary">Open sign-in</Button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 24 }}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <Text as="h1" variant="headingXl">You are currently setup and using the app!</Text>
                    <Text as="p" variant="bodyLg" tone="subdued">
                      SeeItFirst is active and ready to use. Manage your accounts, instances, and customize your product overlays.
                    </Text>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Card>
                      <div style={{ padding: 20, display: 'grid', gap: 16 }}>
                        <Text as="h3" variant="headingSm" fontWeight="semibold">Where to find SeeItFirst</Text>
                        <div style={{ display: 'grid', gap: 10 }}>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Add the SeeItFirst button to your product pages:
                          </Text>
                          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
                            <li><Text as="span" variant="bodySm">Online Store → Themes → <strong>Customize</strong></Text></li>
                            <li><Text as="span" variant="bodySm">Go to any <strong>Product page</strong></Text></li>
                            <li><Text as="span" variant="bodySm">Click <strong>Add block</strong> → App blocks</Text></li>
                            <li><Text as="span" variant="bodySm">Select <strong>SeeItFirst Button</strong></Text></li>
                            <li><Text as="span" variant="bodySm">Drag to position and save</Text></li>
                          </ol>
                        </div>
                      </div>
                    </Card>

                    <Card>
                      <div style={{ padding: 20, display: 'grid', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text as="h3" variant="headingSm" fontWeight="semibold">Product Overlay Buttons</Text>
                          <Badge tone="info">NEW</Badge>
                        </div>
                        
                        <div style={{ display: 'grid', gap: 12 }}>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Add a button overlay directly on product images. Quick setup, fully customizable.
                          </Text>
                          
                          {/* Preview example */}
                          <div style={{ 
                            position: 'relative', 
                            width: '100%', 
                            height: 140, 
                            background: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)', 
                            border: '1px solid #e5e5e5', 
                            borderRadius: 8,
                            overflow: 'hidden',
                          }}>
                            <div style={{ 
                              width: '100%', 
                              height: '100%', 
                              background: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                              backgroundSize: '20px 20px',
                              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                              position: 'relative'
                            }}>
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: 10,
                                  right: 10,
                                  background: 'rgba(0,0,0,0.7)',
                                  color: '#fff',
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 500,
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                                }}
                              >
                                SeeItFirst
                              </div>
                            </div>
                          </div>

                          <Button 
                            variant="primary" 
                            fullWidth
                            onClick={() => {
                              const qp = new URLSearchParams();
                              if (shopParam) qp.set('shop', shopParam);
                              if (hostParam) qp.set('host', hostParam);
                              location.assign(`/setup-overlay?${qp.toString()}`);
                            }}
                          >
                            Set up Overlay
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </div>

                  <Card>
                    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
                      <Text as="h2" variant="headingMd">Resources</Text>
                      <div style={{ display: 'grid', gap: 8 }}>
                        <Link url={`/accounts?${qpStr}`}>
                          <Text as="span" variant="bodyMd">View your accounts</Text>
                        </Link>
                        <Link url={`/instances?${qpStr}`}>
                          <Text as="span" variant="bodyMd">Manage instances</Text>
                        </Link>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

