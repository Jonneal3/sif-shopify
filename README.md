# SIF Shopify App (Next 14 + Supabase)

## Environment variables (.env.local)

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
NEXT_PUBLIC_SHOPIFY_API_KEY=
SHOPIFY_APP_URL=http://localhost:3000
SHOPIFY_SCOPES=read_products,write_products
SHOPIFY_API_VERSION=2024-07

# Supabase (server)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Supabase (client, for embedded iframe auth)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Dev

- Start OAuth: `/api/auth?shop={your-store}.myshopify.com`
- After install, Shopify redirects to `/?shop=...&host=...`

Note: Ensure your app’s redirect URL in the Partner dashboard includes `/api/auth/callback`.

## Supabase (remote)

1. Generate types from your existing remote project (pick one):
   - With project ref (requires `SUPABASE_ACCESS_TOKEN`):
     - `SUPABASE_PROJECT_REF=xxxxxxxxxxxx`
     - `npx supabase gen types typescript --project-id $SUPABASE_PROJECT_REF --schema public > types/supabase.ts`
   - With DB URL (read-only connection string):
     - `SUPABASE_DB_URL=postgresql://user:pass@host:6543/dbname`
     - `npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public > types/supabase.ts`
   - Or use npm scripts:
     - `npm run supabase:gen:types:project`
     - `npm run supabase:gen:types:url`
2. Set env vars in Vercel (Project Settings → Environment Variables):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Deploy to Vercel

1. Push this repo to GitHub/GitLab, import in Vercel.
2. Set env vars:
   - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `NEXT_PUBLIC_SHOPIFY_API_KEY`
   - `SHOPIFY_APP_URL` (your Vercel URL, e.g., https://your-app.vercel.app)
   - `SHOPIFY_SCOPES=read_products,write_products`
   - `SHOPIFY_API_VERSION=2024-07`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. In Shopify Partners → App setup:
   - App URL: `https://your-app.vercel.app`
   - Allowed redirection URL(s): `https://your-app.vercel.app/api/auth/callback`
   - Webhook URL (app/uninstalled configured programmatically): `https://your-app.vercel.app/api/webhooks`

# sif-shopify
