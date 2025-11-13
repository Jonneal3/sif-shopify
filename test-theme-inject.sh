#!/bin/bash

# Test script to verify Shopify Theme API injection
# Usage: ./test-theme-inject.sh

# Load config if it exists
if [ -f "./test-config.sh" ]; then
  source ./test-config.sh
fi

# Set these from your environment or replace directly
SHOP="${SHOP:-your-shop.myshopify.com}"
ACCESS_TOKEN="${SHOPIFY_ACCESS_TOKEN:-your-access-token}"

echo "Testing Shopify Theme API injection..."
echo "Shop: $SHOP"
echo ""

# Step 1: Get main theme ID
echo "1. Fetching themes..."
THEME_ID=$(curl -s -X GET \
  "https://${SHOP}/admin/api/2024-01/themes.json" \
  -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" | jq -r '.themes[] | select(.role == "main") | .id')

if [ -z "$THEME_ID" ] || [ "$THEME_ID" = "null" ]; then
  echo "❌ Failed to get theme ID"
  exit 1
fi

echo "✅ Main theme ID: $THEME_ID"
echo ""

# Step 2: List available product-related files
echo "2. Listing product-related files..."
curl -s -X GET \
  "https://${SHOP}/admin/api/2024-01/themes/${THEME_ID}/assets.json" \
  -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" | jq -r '.assets[].key' | grep -E "(product|block)" | head -20

echo ""
echo ""

# Step 3: Get product-details block file (if exists)
echo "3. Checking for product-details block file..."
BLOCK_FILES=$(curl -s -X GET \
  "https://${SHOP}/admin/api/2024-01/themes/${THEME_ID}/assets.json" \
  -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" | jq -r '.assets[].key' | grep -E "blocks/.*product.*details|blocks/_product")

if [ -z "$BLOCK_FILES" ]; then
  echo "⚠️  No product-details block file found. Checking sections..."
  SECTION_FILES=$(curl -s -X GET \
    "https://${SHOP}/admin/api/2024-01/themes/${THEME_ID}/assets.json" \
    -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" | jq -r '.assets[].key' | grep -E "sections/product-information|sections/main-product")
  echo "Found sections: $SECTION_FILES"
  TARGET_FILE=$(echo "$SECTION_FILES" | head -1)
else
  TARGET_FILE=$(echo "$BLOCK_FILES" | head -1)
fi

if [ -z "$TARGET_FILE" ]; then
  echo "❌ No suitable target file found"
  exit 1
fi

echo "✅ Target file: $TARGET_FILE"
echo ""

# Step 4: Get current content of target file
echo "4. Fetching current content of ${TARGET_FILE}..."
CURRENT_CONTENT=$(curl -s -X GET \
  "https://${SHOP}/admin/api/2024-01/themes/${THEME_ID}/assets.json?asset[key]=${TARGET_FILE}" \
  -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" | jq -r '.asset.value // empty')

if [ -z "$CURRENT_CONTENT" ]; then
  echo "❌ Failed to get file content"
  exit 1
fi

echo "✅ File content length: ${#CURRENT_CONTENT} characters"
echo ""

# Step 5: Check if file contains buy-buttons-block or product form
echo "5. Analyzing file content..."
if echo "$CURRENT_CONTENT" | grep -q "buy-buttons-block"; then
  echo "✅ Found 'buy-buttons-block' in file"
fi
if echo "$CURRENT_CONTENT" | grep -q "shopify-product-form"; then
  echo "✅ Found 'shopify-product-form' in file"
fi
if echo "$CURRENT_CONTENT" | grep -q "content_for 'blocks'"; then
  echo "✅ Found 'content_for \"blocks\"' in file"
fi
if echo "$CURRENT_CONTENT" | grep -q "{% render 'sif-ai-button' %}"; then
  echo "⚠️  Button already exists in file!"
fi
echo ""

# Step 6: Create test snippet first
echo "6. Creating test button snippet..."
TEST_SNIPPET='<div id="sif-ai-button-wrapper" style="display:block;"><button id="sif-ai-button" type="button" style="display:inline-block;margin:8px 0;padding:10px 14px;border:1px solid #1a1a1a;border-radius:6px;background:#111;color:#fff;cursor:pointer;">Test Button</button></div>'

curl -s -X PUT \
  "https://${SHOP}/admin/api/2024-01/themes/${THEME_ID}/assets.json" \
  -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"asset\": {
      \"key\": \"snippets/sif-ai-button.liquid\",
      \"value\": \"${TEST_SNIPPET}\"
    }
  }" | jq -r '.asset.key // "failed"'

echo ""
echo "✅ Snippet created"
echo ""

# Step 7: Try to inject render tag after buy-buttons-block
echo "7. Attempting to inject button after buy-buttons-block..."

# Find buy-buttons-block closing tag
if echo "$CURRENT_CONTENT" | grep -q "buy-buttons-block"; then
  # Use sed to insert after closing </span> or </div> of buy-buttons-block
  # This is a simple approach - might need adjustment based on actual structure
  NEW_CONTENT=$(echo "$CURRENT_CONTENT" | sed '/buy-buttons-block/,/<\/span>/{
    /<\/span>/a\
{% render '\''sif-ai-button'\'' %}
  }')
  
  # If that didn't work, try a different approach
  if [ "$NEW_CONTENT" = "$CURRENT_CONTENT" ]; then
    # Try inserting after the last occurrence of buy-buttons-block
    NEW_CONTENT=$(echo "$CURRENT_CONTENT" | perl -pe 's/(.*buy-buttons-block.*<\/span>)/$1\n{% render '\''sif-ai-button'\'' %}/gs' | head -1)
  fi
  
  # If still no change, just append before schema
  if [ "$NEW_CONTENT" = "$CURRENT_CONTENT" ]; then
    NEW_CONTENT=$(echo "$CURRENT_CONTENT" | sed '/{% schema %}/i{% render '\''sif-ai-button'\'' %}')
  fi
else
  # No buy-buttons-block found, try inserting after product form
  if echo "$CURRENT_CONTENT" | grep -q "shopify-product-form"; then
    NEW_CONTENT=$(echo "$CURRENT_CONTENT" | sed '/shopify-product-form/,/<\/form>/{
      /<\/form>/a\
{% render '\''sif-ai-button'\'' %}
    }')
  else
    # Last resort: append before schema
    NEW_CONTENT=$(echo "$CURRENT_CONTENT" | sed '/{% schema %}/i{% render '\''sif-ai-button'\'' %}')
  fi
fi

# Update the file
echo "Updating ${TARGET_FILE}..."
RESPONSE=$(curl -s -X PUT \
  "https://${SHOP}/admin/api/2024-01/themes/${THEME_ID}/assets.json" \
  -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "asset": {
    "key": "${TARGET_FILE}",
    "value": $(echo "$NEW_CONTENT" | jq -Rs .)
  }
}
EOF
)

if echo "$RESPONSE" | jq -e '.asset.key' > /dev/null 2>&1; then
  echo "✅ Successfully updated ${TARGET_FILE}!"
  echo ""
  echo "Check your product page to see if the button appears."
else
  echo "❌ Failed to update file:"
  echo "$RESPONSE" | jq .
fi

echo ""
echo "Done! Check your product page now."

