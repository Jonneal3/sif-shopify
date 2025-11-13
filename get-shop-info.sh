#!/bin/bash

# Helper script to get shop info from your database
# This will help you find your shop domain and access token

# Load Supabase credentials from env
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Missing Supabase credentials"
  echo "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment"
  exit 1
fi

echo "Fetching shop info from Supabase..."
echo ""

# Get all shops from database
RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/get_shops" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" 2>/dev/null)

# If that doesn't work, try direct query
if [ -z "$RESPONSE" ] || echo "$RESPONSE" | grep -q "error"; then
  echo "Trying direct query..."
  RESPONSE=$(curl -s -X GET "${SUPABASE_URL}/rest/v1/shopify_stores?select=store_domain,access_token&limit=5" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" 2>/dev/null)
fi

if [ -z "$RESPONSE" ] || echo "$RESPONSE" | grep -q "error"; then
  echo "❌ Could not fetch from database"
  echo "Response: $RESPONSE"
  echo ""
  echo "You can manually set values in test-config.sh"
  exit 1
fi

echo "Found shops:"
echo "$RESPONSE" | jq -r '.[] | "Shop: \(.store_domain)\nToken: \(.access_token[0:20])..."' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "To use a specific shop, edit test-config.sh and set:"
echo "  export SHOP=\"your-shop.myshopify.com\""
echo "  export SHOPIFY_ACCESS_TOKEN=\"your-token\""

