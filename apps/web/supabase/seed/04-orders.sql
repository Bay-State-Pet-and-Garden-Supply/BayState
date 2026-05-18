-- ---------------------------------------------------------------------
-- Promo Codes, Orders, Sync Runs, and Legacy Order Source Records
-- ---------------------------------------------------------------------

INSERT INTO integration_sync_runs (
  id,
  external_source_id,
  source_type,
  source_system,
  sync_kind,
  status,
  row_count,
  inserted_count,
  updated_count,
  skipped_count,
  error_count,
  started_at,
  completed_at,
  error_summary,
  metadata
)
SELECT
  '91000000-0000-0000-0000-000000000001',
  external_sources.id,
  'shopsite',
  'shopsite_15',
  'orders',
  'completed',
  2,
  2,
  0,
  0,
  0,
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days' + INTERVAL '2 minutes',
  NULL,
  '{"seeded": true, "notes": "Sample ShopSite order import"}'::jsonb
FROM external_sources
WHERE external_sources.key = 'shopsite'
ON CONFLICT (id) DO UPDATE SET
  external_source_id = EXCLUDED.external_source_id,
  status = EXCLUDED.status,
  row_count = EXCLUDED.row_count,
  inserted_count = EXCLUDED.inserted_count,
  updated_count = EXCLUDED.updated_count,
  error_count = EXCLUDED.error_count,
  metadata = EXCLUDED.metadata;

INSERT INTO integration_sync_runs (
  id,
  external_source_id,
  source_type,
  source_system,
  sync_kind,
  status,
  row_count,
  inserted_count,
  updated_count,
  skipped_count,
  error_count,
  started_at,
  completed_at,
  error_summary,
  metadata
)
SELECT
  '92000000-0000-0000-0000-000000000001',
  external_sources.id,
  'integra',
  'integra_register',
  'inventory',
  'partial',
  3,
  0,
  2,
  0,
  1,
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day' + INTERVAL '90 seconds',
  'One inventory row required manual review',
  '{
    "seeded": true,
    "preview": [
      {
        "sku": "019962890727",
        "name": "Wondercide Flea & Tick Spray Lemongrass 4oz",
        "changes": [
          { "field": "price", "before": "12.99", "after": "14.99" },
          { "field": "quantity", "before": "12", "after": "18" }
        ]
      },
      {
        "sku": "072705137008",
        "name": "Fromm Cat Four-Star Chicken 4lb",
        "changes": [
          { "field": "quantity", "before": "8", "after": "12" }
        ]
      }
    ],
    "errors": [
      {
        "record": "SKU-MISSING-001",
        "error": "No matching storefront product found",
        "timestamp": "2026-05-18T00:00:00.000Z"
      }
    ]
  }'::jsonb
FROM external_sources
WHERE external_sources.key = 'integra'
ON CONFLICT (id) DO UPDATE SET
  external_source_id = EXCLUDED.external_source_id,
  status = EXCLUDED.status,
  row_count = EXCLUDED.row_count,
  updated_count = EXCLUDED.updated_count,
  error_count = EXCLUDED.error_count,
  error_summary = EXCLUDED.error_summary,
  metadata = EXCLUDED.metadata;

INSERT INTO orders (
  id,
  order_number,
  customer_name,
  customer_email,
  customer_phone,
  status,
  subtotal,
  tax,
  total,
  notes,
  created_at,
  updated_at,
  user_id,
  payment_method,
  payment_status,
  fulfillment_method,
  delivery_fee,
  source,
  source_type,
  source_system,
  external_order_id,
  external_created_at,
  imported_at,
  fulfillment_status
)
VALUES
  (
    '93000000-0000-0000-0000-000000000001',
    'SS-1001',
    'Olivia ShopSite',
    'olivia@example.com',
    '(555) 111-1001',
    'completed',
    44.98,
    2.81,
    47.79,
    'Imported from ShopSite for local admin testing.',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days',
    'a0000000-0000-0000-0000-000000000000',
    'credit_card',
    'paid',
    'pickup',
    0,
    'shopsite',
    'shopsite',
    'shopsite_15',
    '1001',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days',
    'fulfilled'
  ),
  (
    '93000000-0000-0000-0000-000000000002',
    'WEB-1002',
    'Drew Pickup',
    'drew@example.com',
    '(555) 222-1002',
    'processing',
    64.98,
    4.06,
    69.04,
    'Local web checkout sample order.',
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '3 hours',
    'a0000000-0000-0000-0000-000000000000',
    'credit_card',
    'paid',
    'pickup',
    0,
    'web',
    'web',
    'web_storefront',
    'WEB-1002',
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '6 hours',
    'ready_for_pickup'
  )
ON CONFLICT (order_number) DO UPDATE SET
  customer_name = EXCLUDED.customer_name,
  customer_email = EXCLUDED.customer_email,
  status = EXCLUDED.status,
  subtotal = EXCLUDED.subtotal,
  tax = EXCLUDED.tax,
  total = EXCLUDED.total,
  updated_at = EXCLUDED.updated_at,
  payment_status = EXCLUDED.payment_status,
  fulfillment_status = EXCLUDED.fulfillment_status;

INSERT INTO order_items (
  id,
  order_id,
  item_type,
  item_id,
  item_name,
  item_slug,
  quantity,
  unit_price,
  total_price,
  created_at
)
VALUES
  (
    '94000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    'product',
    'bd731767-abed-58a8-8409-3b6cb003dae4',
    'Wondercide Flea & Tick Spray Lemongrass 4oz',
    'wondercide-flea-tick-spray-lemongrass-4oz-019962890727',
    2,
    14.99,
    29.98,
    NOW() - INTERVAL '2 days'
  ),
  (
    '94000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000001',
    'product',
    '32711615-c441-5063-a1ed-464d3ba6d253',
    'Wondercide Flying Insect Trap',
    'wondercide-flying-insect-trap-810075890174',
    1,
    14.99,
    14.99,
    NOW() - INTERVAL '2 days'
  ),
  (
    '94000000-0000-0000-0000-000000000003',
    '93000000-0000-0000-0000-000000000002',
    'product',
    'a42e1184-4183-5ece-a0b8-2e60ad3b4a09',
    'Fromm Cat Four-Star Chicken 4lb',
    'fromm-cat-four-star-chicken-4lb-072705137008',
    1,
    21.99,
    21.99,
    NOW() - INTERVAL '6 hours'
  ),
  (
    '94000000-0000-0000-0000-000000000004',
    '93000000-0000-0000-0000-000000000002',
    'service',
    '44444444-4444-4444-4444-444444444444',
    'Delivery',
    'delivery',
    1,
    35.00,
    35.00,
    NOW() - INTERVAL '6 hours'
  )
ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  unit_price = EXCLUDED.unit_price,
  total_price = EXCLUDED.total_price;

INSERT INTO order_events (
  id,
  order_id,
  event_type,
  note,
  created_by,
  created_at
)
VALUES
  (
    '95000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    'imported_from_shopsite',
    'Imported during local ShopSite seed.',
    'a0000000-0000-0000-0000-000000000000',
    NOW() - INTERVAL '2 days'
  ),
  (
    '95000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000001',
    'fulfilled',
    'Order fulfilled and picked up.',
    'a0000000-0000-0000-0000-000000000000',
    NOW() - INTERVAL '2 days' + INTERVAL '3 hours'
  ),
  (
    '95000000-0000-0000-0000-000000000003',
    '93000000-0000-0000-0000-000000000002',
    'placed',
    'Order placed through the web storefront.',
    'a0000000-0000-0000-0000-000000000000',
    NOW() - INTERVAL '6 hours'
  ),
  (
    '95000000-0000-0000-0000-000000000004',
    '93000000-0000-0000-0000-000000000002',
    'ready_for_pickup',
    'Order is staged for pickup.',
    'a0000000-0000-0000-0000-000000000000',
    NOW() - INTERVAL '2 hours'
  )
ON CONFLICT (id) DO UPDATE SET
  note = EXCLUDED.note,
  created_at = EXCLUDED.created_at;

INSERT INTO order_source_records (
  id,
  order_id,
  source_type,
  source_system,
  external_id,
  external_order_number,
  raw_payload,
  normalized_payload,
  sync_run_id,
  imported_at,
  external_created_at
)
VALUES
  (
    '96000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    'shopsite',
    'shopsite_15',
    '1001',
    '1001',
    '{"seeded": true, "source": "shopsite"}'::jsonb,
    '{"customer_email": "olivia@example.com", "payment_method": "credit_card"}'::jsonb,
    '91000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  )
ON CONFLICT (source_type, source_system, external_id) DO UPDATE SET
  normalized_payload = EXCLUDED.normalized_payload,
  sync_run_id = EXCLUDED.sync_run_id,
  imported_at = EXCLUDED.imported_at;
