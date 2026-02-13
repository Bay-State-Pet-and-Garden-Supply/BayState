# Database Seeding Prompt

Please seed the database with generic products and realistic orders. The tables `products`, `orders`, and `order_items` have been wiped clean.

## Requirements

1.  **Seed Products**:
    *   Generate at least 20 generic products.
    *   Examples: "Premium Dog Food", "Catnip Toy", "Bird Seed Mix", "Hamster Cage", "Garden Shovel", "Lawn Mower", "Organic Fertilizer".
    *   Vary the `price` (e.g., $5.99 to $299.99).
    *   Set `stock_status` to a mix of 'in_stock', 'out_of_stock', 'pre_order' (mostly 'in_stock').
    *   Set `is_featured` to true for about 5 items.
    *   Provide a placeholder `images` array (e.g., `ARRAY['https://placehold.co/400']`).
    *   Generate a `slug` based on the name (e.g., 'premium-dog-food').
    *   `brand_id` can be NULL or a generated UUID if you want to create mock brands first (optional).

2.  **Seed Orders**:
    *   Generate at least 10 realistic orders.
    *   Status should vary: 'pending', 'processing', 'completed', 'cancelled'.
    *   `total_amount` should match the sum of items in the order.
    *   `customer_name`, `customer_email` should be realistic.

3.  **Seed Order Items**:
    *   Each order should have 1-5 items.
    *   `item_id` MUST reference a valid `id` from the seeded `products` table.
    *   `item_name` and `item_slug` should match the product.

## Schema Reference

### Table: `products`
- `id` (uuid, PK, default: gen_random_uuid())
- `name` (text, NOT NULL)
- `slug` (text, NOT NULL)
- `price` (numeric, NOT NULL)
- `description` (text)
- `stock_status` (text)
- `images` (text[])
- `is_featured` (boolean)
- `sku` (text)
- `created_at` (timestamptz)

### Table: `orders`
- `id` (uuid, PK, default: gen_random_uuid())
- `order_number` (text, NOT NULL)
- `customer_name` (text, NOT NULL)
- `customer_email` (text, NOT NULL)
- `status` (text, default: 'pending')
- `total_amount` (numeric, NOT NULL)
- `created_at` (timestamptz)

### Table: `order_items`
- `id` (uuid, PK, default: gen_random_uuid())
- `order_id` (uuid, FK references orders.id)
- `item_type` (text, default: 'product')
- `item_id` (uuid, FK references products.id)
- `quantity` (integer, NOT NULL)
- `unit_price` (numeric, NOT NULL)
- `total_price` (numeric, NOT NULL)

## Output Format
Please provide a single SQL script to perform these insertions. Use CTEs or variables if helpful to maintain referential integrity.
