'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@shopify/polaris';
import { getSupabaseEmbedded } from '@/lib/supabaseEmbedded';

export default function HeaderNav() {
  const [shop, setShop] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean>(false);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const qsShop = sp.get('shop');
      const qsHost = sp.get('host');
      if (qsShop) setShop(qsShop);
      else setShop(localStorage.getItem('sif_last_shop'));
      if (qsHost) setHost(qsHost);
      else setHost(localStorage.getItem('sif_last_host'));
    } catch {}
  }, []);

  useEffect(() => {
    const supabase = getSupabaseEmbedded();
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session));
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const changeUrl = useMemo(() => {
    const qp = new URLSearchParams();
    if (shop) qp.set('shop', shop);
    if (host) qp.set('host', host);
    qp.set('change', '1');
    return `/accounts${qp.toString() ? `?${qp.toString()}` : ''}`;
  }, [shop, host]);

  if (!loggedIn) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 8 }}>
      <Link url={changeUrl}>Change Shopify account</Link>
    </div>
  );
}


