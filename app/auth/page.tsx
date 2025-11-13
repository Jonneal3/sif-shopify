'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { getSupabaseEmbedded } from '@/lib/supabaseEmbedded';
import { Card, Layout, Page, TextField, Button, Text } from '@shopify/polaris';

export default function AuthPopupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseEmbedded();
    (async () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const err = sp.get('error_message') || sp.get('error');
        if (err) setError(err);
        if (sp.get('force') === '1') {
          await supabase.auth.signOut();
        }
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          sendSessionAndClose(data.session.access_token, data.session.refresh_token ?? null);
        }
      } catch {}
    })();
  }, []);

  const sendSessionAndClose = (accessToken: string, refreshToken: string | null) => {
    const payload = {
      type: 'SIF_SUPABASE_SESSION',
      access_token: accessToken,
      refresh_token: refreshToken,
    } as const;
    try {
      if (window.opener) {
        window.opener.postMessage(payload, window.location.origin);
      } else if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('sif-auth');
        bc.postMessage(payload);
        bc.close();
      }
    } catch {}
    window.close();
  };

  const onSubmit = async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseEmbedded();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      sendSessionAndClose(data.session.access_token, data.session.refresh_token ?? null);
    } else {
      setError('No session returned.');
    }
  };

  return (
    <Page title="Sign in">
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              {error ? <Text as="p" tone="critical">{error}</Text> : null}
              <TextField label="Email" value={email} onChange={setEmail} autoComplete="email" />
              <TextField label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
              <Button onClick={onSubmit} loading={loading} variant="primary">Sign in</Button>
              <Text as="p" variant="bodySm">This window will close after successful sign in.</Text>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
