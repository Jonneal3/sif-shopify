'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseEmbedded } from '@/lib/supabaseEmbedded';
import { Card, IndexTable, Page, Text, Button, Banner } from '@shopify/polaris';

type UserAccount = {
  id: string;
  user_id: string;
  account_id: string; // FK to accounts.id
  name?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export default function AccountsPage() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState<boolean>(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [shopParam, setShopParam] = useState<string | null>(null);
  const [hostParam, setHostParam] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  // Holds selected accounts.id (not user_accounts.id)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isChangeFlow, setIsChangeFlow] = useState<boolean>(false);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const qsShop = sp.get('shop');
      const qsHost = sp.get('host');
      const change = sp.get('change');
      if (qsShop) setShopParam(qsShop);
      else {
        const ls = localStorage.getItem('sif_last_shop');
        if (ls) setShopParam(ls);
      }
      if (qsHost) setHostParam(qsHost);
      else {
        const lh = localStorage.getItem('sif_last_host');
        if (lh) setHostParam(lh);
      }
      setIsChangeFlow(change === '1');
    } catch {}
    // If already connected and not explicitly changing, redirect away
    try {
      const sp = new URLSearchParams(window.location.search);
      const change = sp.get('change');
      const shop = sp.get('shop') || localStorage.getItem('sif_last_shop');
      const host = sp.get('host') || localStorage.getItem('sif_last_host') || undefined;
      if (change !== '1' && shop) {
        (async () => {
          try {
            const res = await fetch(`/api/accounts/active?shop=${encodeURIComponent(shop)}`);
            const json = await res.json();
            if (json?.connected && json?.account_id) {
              const qp = new URLSearchParams();
              qp.set('shop', shop);
              if (host) qp.set('host', host);
              qp.set('account_id', json.account_id);
              location.assign(`/instances?${qp.toString()}`);
            }
          } catch {}
        })();
      }
    } catch {}
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseEmbedded();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          setError('Not signed in');
          setNeedsLogin(true);
          setLoading(false);
          return;
        }
        let { data, error } = await supabase
          .from('user_accounts' as any)
          .select('*')
          .order('created_at', { ascending: false } as any);
        if (error) throw error;
        if (!data || (Array.isArray(data) && data.length === 0)) {
          const { data: filtered, error: fErr } = await supabase
            .from('user_accounts' as any)
            .select('*')
            .eq('user_id', sessionData.session.user.id)
            .order('created_at', { ascending: false } as any);
          if (fErr) throw fErr;
          setAccounts(((filtered as unknown) as UserAccount[]) || []);
        } else {
          setAccounts(((data as unknown) as UserAccount[]) || []);
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load accounts');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  // Allow re-login from this page and acquire session via postMessage/BroadcastChannel
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
    return () => {
      window.removeEventListener('message', handler);
      unsub();
    };
  }, []);

  const openLogin = () => {
    const sp = new URLSearchParams(window.location.search);
    const host = sp.get('host');
    const shop = sp.get('shop');
    const url = `/auth?embedded=1&force=1${shop ? `&shop=${encodeURIComponent(shop)}` : ''}${host ? `&host=${encodeURIComponent(host)}` : ''}`;
    window.open(url, 'sif-auth', 'width=520,height=640');
  };

  const onInlineLogin = () => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const host = sp.get('host');
      const shop = sp.get('shop');
      const url = `/auth?embedded=1&force=1${shop ? `&shop=${encodeURIComponent(shop)}` : ''}${host ? `&host=${encodeURIComponent(host)}` : ''}`;
      window.open(url, 'sif-auth', 'width=520,height=640');
    } catch {}
  };

  const rows = useMemo(() => accounts.map((acc, index) => (
    <IndexTable.Row id={acc.id} key={acc.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span">{acc.name || acc.id}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{acc.status || '-'}</IndexTable.Cell>
      <IndexTable.Cell>{acc.created_at ? new Date(acc.created_at).toLocaleString() : '-'}</IndexTable.Cell>
    </IndexTable.Row>
  )), [accounts]);

  const onConnect = async () => {
    if (!shopParam || !selectedId) return;
    setConnectLoading(true);
    setConnectError(null);
    setConnectSuccess(null);
    try {
      const res = await fetch('/api/accounts/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedId, shop: shopParam }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to connect');
      setConnectSuccess('Connected this account to your Shopify store.');
      // Redirect to instance selection page
      try {
        const sp = new URLSearchParams(window.location.search);
        const host = sp.get('host');
        const qp = new URLSearchParams();
        qp.set('account_id', selectedId);
        if (shopParam) qp.set('shop', shopParam);
        if (host) qp.set('host', host);
        location.assign(`/instances?${qp.toString()}`);
      } catch {}
    } catch (e: any) {
      setConnectError(e?.message || 'Failed to connect');
    } finally {
      setConnectLoading(false);
    }
  };

  const onLogout = async () => {
    const supabase = getSupabaseEmbedded();
    await supabase.auth.signOut();
    location.assign('/');
  };

  const onBack = () => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const host = sp.get('host');
      const shop = sp.get('shop');
      const qp = new URLSearchParams();
      if (shop) qp.set('shop', shop);
      if (host) qp.set('host', host);
      location.assign(`/${qp.toString() ? `?${qp.toString()}` : ''}`);
    } catch {
      history.back();
    }
  };

  return (
    <Page
      title="Your Accounts"
      primaryAction={{ content: 'Logout', onAction: onLogout }}
      secondaryActions={[
        ...(isChangeFlow ? [] : [{ content: 'Back', onAction: onBack }]),
        { content: 'Refresh', onAction: () => location.reload() },
      ]}
    >
      <Card>
        {loading ? (
          <div style={{ padding: 16 }}>
            <Text as="p" variant="bodyMd">Loading…</Text>
          </div>
        ) : error ? (
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <Text as="p" tone="critical">{error}</Text>
              {needsLogin ? (
              <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
                {loginError ? <Text as="p" tone="critical">{loginError}</Text> : null}
                <Button onClick={onInlineLogin} loading={loginLoading} variant="primary">Open sign-in</Button>
              </div>
            ) : (
              <Button onClick={() => location.reload()}>Retry</Button>
            )}
          </div>
        ) : (
          <>
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            {connectError ? <Banner tone="critical">{connectError}</Banner> : null}
            {connectSuccess ? <Banner tone="success">{connectSuccess}</Banner> : null}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button
                variant="primary"
                loading={connectLoading}
                disabled={!shopParam || !selectedId}
                onClick={onConnect}
              >
                Connect selected account
              </Button>
              {!shopParam ? <Text as="span" tone="critical">Missing shop param</Text> : null}
            </div>
          </div>
          <IndexTable
            resourceName={{ singular: 'account', plural: 'accounts' }}
            itemCount={accounts.length}
            selectable={false}
            headings={[
              { title: 'Select' },
              { title: 'Name' },
              { title: 'Status' },
              { title: 'Created' },
            ]}
          >
            {accounts.map((acc, index) => (
              <IndexTable.Row id={acc.id} key={acc.id} position={index}>
                <IndexTable.Cell>
                  <input
                    type="checkbox"
                    checked={selectedId === acc.account_id}
                    onClick={(e) => { e.stopPropagation(); }}
                    onChange={() => setSelectedId(selectedId === acc.account_id ? null : acc.account_id)}
                  />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text variant="bodyMd" as="span">{acc.name || acc.id}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{acc.status || '-'}</IndexTable.Cell>
                <IndexTable.Cell>{acc.created_at ? new Date(acc.created_at).toLocaleString() : '-'}</IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
          </>
        )}
      </Card>
    </Page>
  );
}
