'use client';
export const dynamic = 'force-dynamic';

import {
  Card,
  IndexTable,
  Page,
  Text,
  useIndexResourceState,
} from '@shopify/polaris';
import { useEffect, useMemo, useState } from 'react';

interface Product {
  id: number;
  title: string;
  vendor?: string;
  status?: string;
}

export default function ProductsPage() {
  const [shop, setShop] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const qp = useMemo(() => {
    const u = new URLSearchParams();
    if (shop) u.set('shop', shop);
    if (host) u.set('host', host);
    return u.toString();
  }, [shop, host]);

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setShop(sp.get('shop'));
    setHost(sp.get('host'));
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const res = await fetch(`/api/products?${qp}`);
      const json = await res.json();
      setProducts(json.products ?? []);
      setLoading(false);
    };
    if (shop) run();
  }, [qp, shop]);

  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(
    products as any[],
    { resourceIDResolver: (p: Product) => String(p.id) }
  );

  return (
    <Page title="Products">
      <Card>
        {loading ? (
          <div style={{ padding: 16 }}>
            <Text as="p" variant="bodyMd">Loading…</Text>
          </div>
        ) : (
          <IndexTable
            resourceName={{ singular: 'product', plural: 'products' }}
            itemCount={products.length}
            selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
            onSelectionChange={handleSelectionChange}
            headings={[
              { title: 'Title' },
              { title: 'Vendor' },
              { title: 'Status' },
            ]}
          >
            {products.map((product, index) => (
              <IndexTable.Row id={String(product.id)} key={product.id} position={index}>
                <IndexTable.Cell>
                  <Text variant="bodyMd" as="span">{product.title}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{product.vendor ?? '-'}</IndexTable.Cell>
                <IndexTable.Cell>{product.status ?? '-'}</IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>
    </Page>
  );
}

