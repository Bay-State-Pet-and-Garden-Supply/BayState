BEGIN;

-- Add 'in_store' as a valid payment method for in-store register sales.
-- This distinguishes register sales from online pickup orders.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('pickup', 'credit_card', 'paypal', 'in_store'));

COMMIT;