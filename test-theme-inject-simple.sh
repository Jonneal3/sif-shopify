#!/bin/bash

# Simple test - just get a file and show what's in it
# Usage: ./test-theme-inject-simple.sh

# Load config if it exists
if [ -f "./test-config.sh" ]; then
  source ./test-config.sh
fi

SHOP="${SHOP:-your-shop.myshopify.com}"
ACCESS_TOKEN="${SHOPIFY_ACCESS_TOKEN:-your-access-token}"

echo "Testing Shopify Theme API..."
echo ""

# Get theme ID
THEME_ID=$(curl -s -X GET \
  "https://${SHOP}/admin/api/2024-01/themes.json" \
  -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" | jq -r '.themes[] | select(.role == "main") | .id')

echo "Theme ID: $THEME_ID"
echo ""

# Try to get product-details block
echo "Trying to get blocks/_product-details.liquid..."
curl -s -X GET \
  "https://${SHOP}/admin/api/2024-01/themes/${THEME_ID}/assets.json?asset[key]=blocks/_product-details.liquid" \
  -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" | jq -r '.asset.value' | head -50

echo ""
echo "---"
echo ""

# Try product-information section
echo "Trying to get sections/product-information.liquid..."
curl -s -X GET \
  "https://${SHOP}/admin/api/2024-01/themes/${THEME_ID}/assets.json?asset[key]=sections/product-information.liquid" \
  -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" | jq -r '.asset.value' | grep -A 5 -B 5 "buy-buttons\|product-form\|content_for" | head -30

