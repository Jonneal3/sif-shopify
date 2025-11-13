'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';

export default function ShopifyAppAlias() {
  useEffect(() => {
    const qp = window.location.search;
    window.location.replace(`/${qp}`);
  }, []);
  return null;
}


