import Providers from './providers';
import HeaderNav from './HeaderNav';

export const metadata = {
  title: 'SIF Shopify App',
  description: 'Embedded Shopify app with Supabase',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Polaris + App Bridge providers (use search params) */}
        <Providers>
          <HeaderNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}

