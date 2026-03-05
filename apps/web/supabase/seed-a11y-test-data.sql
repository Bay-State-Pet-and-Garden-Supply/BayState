-- Seed data for accessibility tests
-- Run this against the Bay State database to enable a11y tests

-- 1. Create a brand for test products
INSERT INTO brands (id, name, slug, logo_url)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Brand', 'test-brand', NULL)
ON CONFLICT (slug) DO NOTHING;

-- 2. Create test product (for /products/test-product route)
INSERT INTO products (id, brand_id, name, slug, description, price, stock_status, images, is_featured)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Test Product for Accessibility Testing',
  'test-product',
  'This is a test product used for accessibility testing.',
  29.99,
  'in_stock',
  ARRAY['https://placehold.co/400x400/png?text=Test+Product'],
  true
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Create test service (for /services/propane-refill route)
INSERT INTO services (id, name, slug, description, price, unit, is_active)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Propane Refill',
  'propane-refill',
  'Propane tank refill service.',
  15.99,
  'per tank',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- 4. Create test order (for /order-confirmation/order-guest-1001 route)
INSERT INTO orders (id, order_number, customer_name, customer_email, customer_phone, status, subtotal, tax, total, notes)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'BSP-20260115-0001',
  'Test Customer',
  'test@example.com',
  '(555) 123-4567',
  'completed',
  29.99,
  1.87,
  31.86,
  'Test order for accessibility testing'
)
ON CONFLICT DO NOTHING;

-- 5. Create order item for the test order
INSERT INTO order_items (id, order_id, item_type, item_id, item_name, item_slug, quantity, unit_price, total_price)
VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'product',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Test Product for Accessibility Testing',
  'test-product',
  1,
  29.99,
  29.99
)
ON CONFLICT DO NOTHING;
