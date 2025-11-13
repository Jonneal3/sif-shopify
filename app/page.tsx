'use client';
export const dynamic = 'force-dynamic';

import { Card, Layout, Link, Page, Button, Text } from '@shopify/polaris';
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

  // After session is ready, route to the correct next step based on whether an account is already connected
  useEffect(() => {
    const routeNext = async () => {
      if (!sessionChecked || needsLogin || needsInstall) return;
      const shop = shopParam || (typeof window !== 'undefined' ? localStorage.getItem('sif_last_shop') : null);
      const host = hostParam || (typeof window !== 'undefined' ? localStorage.getItem('sif_last_host') : null);
      if (!shop) return; // no shop context; remain on page
      setChecking(true); // show loader while deciding where to go
      try {
        const res = await fetch(`/api/accounts/active?shop=${encodeURIComponent(shop)}`);
        const json = await res.json();
        const qp = new URLSearchParams();
        qp.set('shop', shop);
        if (host) qp.set('host', host);
        if (json?.connected && json?.account_id) {
          qp.set('account_id', json.account_id);
          location.assign(`/instances?${qp.toString()}`);
        } else {
          location.assign(`/accounts?${qp.toString()}`);
        }
      } catch {}
    };
    routeNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, needsLogin, needsInstall]);

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
      title="seeitFirst"
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
                <div>
                  <p>Welcome to your embedded app.</p>
                  <div style={{ marginTop: 12 }}>
                    <Link url={`/accounts?${qpStr}`}>View your accounts</Link>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

