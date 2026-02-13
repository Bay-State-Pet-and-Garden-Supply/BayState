# Migration Guide: Moving to Scraper Studio

This guide outlines the steps required to migrate existing scraper configurations and workflows from legacy routes to the new Scraper Studio environment.

## Overview of Changes

Scraper Studio introduces several improvements over legacy scraper management:
1. **Versioned Configurations**: Configurations are now stored in `scraper_config_versions` with a `current_version_id` link in `scraper_configs`.
2. **Unified Testing**: Legacy test scripts are replaced by the integrated **Testing** tab and `test_run` infrastructure.
3. **Advanced Metrics**: Daily health aggregation replaces ad-hoc log analysis for monitoring scraper reliability.
4. **Enhanced Traceability**: Step-by-step execution traces are available for all Studio test runs.

## Migration Steps

### 1. Porting Configurations
Legacy configurations (typically YAML files or database records without versioning) must be migrated to the new versioned schema.

1. Create a new entry in `scraper_configs` if it doesn't exist.
2. Insert the current YAML/JSON configuration into `scraper_config_versions`.
3. Update the `current_version_id` in the `scraper_configs` table.

### 2. Updating Selectors
Scraper Studio tracks selector health based on `selector_id`. Ensure all key selectors in your workflow have unique IDs.

**Legacy:**
```yaml
extract:
  - price: ".product-price"
```

**Studio-Ready:**
```yaml
extract:
  - id: "price_selector"
    field: "price"
    selector: ".product-price"
    required: true
```

### 3. Setting Up Test SKUs
Move any hardcoded test SKUs from runner scripts to the `scraper_config_test_skus` table. This allows the Studio UI to provide one-click testing.

```sql
INSERT INTO public.scraper_config_test_skus (config_id, sku, sku_type)
VALUES ('your-config-id', 'TEST-SKU-1', 'test');
```

### 4. Updating Runner Callback URLs
Ensure your runners are pointing to the unified callback endpoint:
`https://your-app-domain.com/api/admin/scraping/callback`

The runners must also be updated to support the **Event Schema v2** to take full advantage of the health monitoring and step-tracing features.

## Deprecated Routes

The following legacy routes are deprecated and will be removed in a future release:
- `/admin/scrapers/test-lab/*` (Replaced by Scraper Studio Testing)
- `/api/admin/scraper-configs/[id]/validate` (Replaced by Studio Config Editor validation)

## Support

If you encounter issues during migration, please refer to the internal `Scraper Engine` documentation or contact the Admin Portal development team.
