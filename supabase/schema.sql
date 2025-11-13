-- Supabase schema for Shopify app data
-- Apply this in Supabase SQL Editor or via psql

-- required extension for gen_random_uuid
create extension if not exists pgcrypto;

-- helper trigger function to update updated_at
create or replace function public.update_shopify_stores_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.shopify_stores (
  id uuid not null default gen_random_uuid(),
  store_domain text not null,
  shop_id text not null,
  shop_name text null,
  shop_owner_email text null,
  access_token text not null,
  installed_at timestamptz null default now(),
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  constraint shopify_stores_pkey primary key (id),
  constraint shopify_stores_store_domain_key unique (store_domain)
) tablespace pg_default;

create index if not exists idx_shopify_stores_store_domain on public.shopify_stores using btree (store_domain) tablespace pg_default;
create index if not exists idx_shopify_stores_shop_id on public.shopify_stores using btree (shop_id) tablespace pg_default;
create index if not exists idx_shopify_stores_shop_owner_email on public.shopify_stores using btree (shop_owner_email) tablespace pg_default;
create unique index if not exists shopify_stores_shop_id_key on public.shopify_stores using btree (shop_id) tablespace pg_default;

drop trigger if exists update_shopify_stores_updated_at on public.shopify_stores;
create trigger update_shopify_stores_updated_at
before update on public.shopify_stores
for each row execute function public.update_shopify_stores_updated_at();


-- accounts_shopify: link accounts to shops and store UI state
create table if not exists public.accounts_shopify (
  account_id uuid not null,
  shopify_store_id uuid not null,
  is_active boolean null default true,
  created_at timestamptz null default now(),
  selected_instance_id uuid null,
  enable_product_button boolean not null default false,
  enable_product_image boolean not null default false,
  -- UI customization fields (JSON format for easier management)
  button_config JSONB null default '{"text":"SeeItFirst","bg":"#111","color":"#fff","radius":6}'::jsonb,
  overlay_config JSONB null default '{"text":"SeeItFirst","bg":"rgba(0,0,0,0.6)","color":"#fff"}'::jsonb,
  -- Legacy columns (kept for backward compatibility, can be removed after migration)
  btn_text text null,
  btn_bg text null,
  btn_color text null,
  btn_radius integer null,
  overlay_text text null,
  overlay_bg text null,
  overlay_color text null,
  constraint accounts_shopify_pkey primary key (account_id, shopify_store_id),
  constraint accounts_shopify_account_id_fkey foreign key (account_id) references public.accounts (id) on delete cascade,
  constraint accounts_shopify_selected_instance_fkey foreign key (selected_instance_id) references public.instances (id) on delete set null,
  constraint accounts_shopify_shopify_store_id_fkey foreign key (shopify_store_id) references public.shopify_stores (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_accounts_shopify_account_id on public.accounts_shopify using btree (account_id) tablespace pg_default;
create index if not exists idx_accounts_shopify_shopify_store_id on public.accounts_shopify using btree (shopify_store_id) tablespace pg_default;
create index if not exists idx_accounts_shopify_active on public.accounts_shopify using btree (is_active) tablespace pg_default where (is_active = true);
create index if not exists idx_accounts_shopify_enable_flags on public.accounts_shopify using btree (enable_product_button, enable_product_image) tablespace pg_default;
create index if not exists idx_accounts_shopify_selected_instance on public.accounts_shopify using btree (selected_instance_id) tablespace pg_default;
create index if not exists idx_accounts_shopify_button_config on public.accounts_shopify using GIN (button_config) tablespace pg_default;
create index if not exists idx_accounts_shopify_overlay_config on public.accounts_shopify using GIN (overlay_config) tablespace pg_default;

