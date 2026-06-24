-- Drop long_description column from products table
ALTER TABLE products DROP COLUMN IF EXISTS long_description;
