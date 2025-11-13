# Shopify Theme API Testing

## Quick Test Commands

### 1. Get Your Theme ID
```bash
curl -X GET "https://YOUR_SHOP.myshopify.com/admin/api/2024-01/themes.json" \
  -H "X-Shopify-Access-Token: YOUR_ACCESS_TOKEN"
```

### 2. List All Theme Files
```bash
curl -X GET "https://YOUR_SHOP.myshopify.com/admin/api/2024-01/themes/THEME_ID/assets.json" \
  -H "X-Shopify-Access-Token: YOUR_ACCESS_TOKEN" | jq '.assets[].key' | grep product
```

### 3. Get Product-Details Block File
```bash
curl -X GET "https://YOUR_SHOP.myshopify.com/admin/api/2024-01/themes/THEME_ID/assets.json?asset[key]=blocks/_product-details.liquid" \
  -H "X-Shopify-Access-Token: YOUR_ACCESS_TOKEN" | jq -r '.asset.value'
```

### 4. Get Product-Information Section
```bash
curl -X GET "https://YOUR_SHOP.myshopify.com/admin/api/2024-01/themes/THEME_ID/assets.json?asset[key]=sections/product-information.liquid" \
  -H "X-Shopify-Access-Token: YOUR_ACCESS_TOKEN" | jq -r '.asset.value'
```

### 5. Create Test Button Snippet
```bash
curl -X PUT "https://YOUR_SHOP.myshopify.com/admin/api/2024-01/themes/THEME_ID/assets.json" \
  -H "X-Shopify-Access-Token: YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {
      "key": "snippets/sif-ai-button.liquid",
      "value": "<div id=\"sif-ai-button-wrapper\"><button id=\"sif-ai-button\" style=\"padding:10px;background:#111;color:#fff;\">Test Button</button></div>"
    }
  }'
```

### 6. Update Product-Details Block (Example)
```bash
# First, get the current content
CONTENT=$(curl -s -X GET "https://YOUR_SHOP.myshopify.com/admin/api/2024-01/themes/THEME_ID/assets.json?asset[key]=blocks/_product-details.liquid" \
  -H "X-Shopify-Access-Token: YOUR_ACCESS_TOKEN" | jq -r '.asset.value')

# Add the render tag after buy-buttons-block (simplified - you'd need proper string manipulation)
NEW_CONTENT="${CONTENT}"$'\n{% render '\''sif-ai-button'\'' %}'

# Update the file
curl -X PUT "https://YOUR_SHOP.myshopify.com/admin/api/2024-01/themes/THEME_ID/assets.json" \
  -H "X-Shopify-Access-Token: YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"asset\": {
      \"key\": \"blocks/_product-details.liquid\",
      \"value\": $(echo "$NEW_CONTENT" | jq -Rs .)
    }
  }"
```

## Why It's Hard

1. **Dynamic Block Rendering**: Modern Shopify themes use `{% content_for 'blocks' %}` which dynamically renders blocks. You can't inject Liquid code between specific blocks easily.

2. **File Structure Varies**: Different themes have different structures:
   - Some use `blocks/_product-details.liquid`
   - Some use `sections/product-information.liquid`
   - Some use snippets

3. **No Direct Block Insertion**: The Theme API doesn't let you insert blocks directly - you have to modify Liquid files.

4. **JavaScript Positioning**: Often you need JavaScript to position elements correctly because the Liquid structure is too dynamic.

## Solution Approach

The best approach is:
1. Find the right file (product-details block or section)
2. Inject `{% render 'sif-ai-button' %}` after the buy-buttons-block or product form
3. Use JavaScript to fine-tune positioning if needed

## Using the Test Scripts

```bash
# Simple test - just see what files exist
export SHOP="your-shop.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="your-token"
./test-theme-inject-simple.sh

# Full test - actually injects button
./test-theme-inject.sh
```

