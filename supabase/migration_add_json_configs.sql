-- Migration: Add JSON columns for button and overlay customization
-- Run this in Supabase SQL Editor

-- Add JSON columns for button and overlay configs
ALTER TABLE public.accounts_shopify
ADD COLUMN IF NOT EXISTS button_config JSONB NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS overlay_config JSONB NULL DEFAULT NULL;

-- Check if legacy columns exist and migrate data if they do
DO $$
BEGIN
  -- Check if btn_text column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'accounts_shopify' 
    AND column_name = 'btn_text'
  ) THEN
    -- Migrate existing button data from individual columns to JSON
    UPDATE public.accounts_shopify
    SET 
      button_config = jsonb_build_object(
        'text', COALESCE(btn_text, 'SeeItFirst'),
        'bg', COALESCE(btn_bg, '#111'),
        'color', COALESCE(btn_color, '#fff'),
        'radius', COALESCE(btn_radius, 6)
      )
    WHERE button_config IS NULL 
      AND (btn_text IS NOT NULL OR btn_bg IS NOT NULL OR btn_color IS NOT NULL OR btn_radius IS NOT NULL);
    
    RAISE NOTICE 'Migrated button data from legacy columns to JSON';
  ELSE
    RAISE NOTICE 'Legacy button columns do not exist, skipping migration';
  END IF;

  -- Check if overlay_text column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'accounts_shopify' 
    AND column_name = 'overlay_text'
  ) THEN
    -- Migrate existing overlay data from individual columns to JSON
    UPDATE public.accounts_shopify
    SET 
      overlay_config = jsonb_build_object(
        'text', COALESCE(overlay_text, 'SeeItFirst'),
        'bg', COALESCE(overlay_bg, 'rgba(0,0,0,0.6)'),
        'color', COALESCE(overlay_color, '#fff')
      )
    WHERE overlay_config IS NULL 
      AND (overlay_text IS NOT NULL OR overlay_bg IS NOT NULL OR overlay_color IS NOT NULL);
    
    RAISE NOTICE 'Migrated overlay data from legacy columns to JSON';
  ELSE
    RAISE NOTICE 'Legacy overlay columns do not exist, skipping migration';
  END IF;
END $$;

-- Set default JSON configs for rows that don't have any customization yet
UPDATE public.accounts_shopify
SET 
  button_config = jsonb_build_object(
    'text', 'SeeItFirst',
    'bg', '#111',
    'color', '#fff',
    'radius', 6
  )
WHERE button_config IS NULL;

UPDATE public.accounts_shopify
SET 
  overlay_config = jsonb_build_object(
    'text', 'SeeItFirst',
    'bg', 'rgba(0,0,0,0.6)',
    'color', '#fff'
  )
WHERE overlay_config IS NULL;

-- Create indexes for JSON columns (optional, for querying)
CREATE INDEX IF NOT EXISTS idx_accounts_shopify_button_config ON public.accounts_shopify USING GIN (button_config) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_accounts_shopify_overlay_config ON public.accounts_shopify USING GIN (overlay_config) TABLESPACE pg_default;

-- Note: Keep old columns for now (btn_text, btn_bg, etc.) for backward compatibility
-- You can drop them later after updating the API to use JSON columns

