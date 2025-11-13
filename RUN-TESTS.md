# How to Run Theme Injection Tests

## Quick Start

### Option 1: Edit config file first (recommended)

1. Edit `test-config.sh` and add your shop info:
```bash
nano test-config.sh
# or
code test-config.sh
```

2. Add your shop domain and access token:
```bash
export SHOP="your-shop.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="your-token-here"
```

3. Run the simple test:
```bash
./test-theme-inject-simple.sh
```

### Option 2: Run with inline variables

```bash
SHOP="your-shop.myshopify.com" SHOPIFY_ACCESS_TOKEN="your-token" ./test-theme-inject-simple.sh
```

### Option 3: Export variables in your shell

```bash
export SHOP="your-shop.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="your-token"
./test-theme-inject-simple.sh
```

## Available Test Scripts

1. **`test-theme-inject-simple.sh`** - Quick test to see what files exist
   ```bash
   ./test-theme-inject-simple.sh
   ```

2. **`test-theme-inject.sh`** - Full test that actually injects a button
   ```bash
   ./test-theme-inject.sh
   ```

3. **`get-shop-info.sh`** - Get shop info from your database (if you have Supabase env vars)
   ```bash
   ./get-shop-info.sh
   ```

## Troubleshooting

If you get "permission denied":
```bash
chmod +x test-theme-inject-simple.sh
chmod +x test-theme-inject.sh
```

If you don't have `jq` installed:
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

## What You Need

1. **Shop domain**: Your shop URL (e.g., `mystore.myshopify.com`)
2. **Access token**: Your Shopify access token (from Supabase database or Partner dashboard)

