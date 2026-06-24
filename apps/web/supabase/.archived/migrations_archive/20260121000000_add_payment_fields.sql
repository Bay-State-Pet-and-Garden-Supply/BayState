-- Add payment fields to orders table
-- Issue #77: Implement Online Payment Processing (Stripe/PayPal)

-- Add payment-related columns to orders table
DO $$
BEGIN
    -- payment_method: How the customer paid
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'payment_method') THEN
        ALTER TABLE orders ADD COLUMN payment_method text DEFAULT 'pickup';
    END IF;
    
    -- payment_status: Current status of payment
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'payment_status') THEN
        ALTER TABLE orders ADD COLUMN payment_status text DEFAULT 'pending';
    END IF;
    
    -- stripe_payment_intent_id: For tracking Stripe payments
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'stripe_payment_intent_id') THEN
        ALTER TABLE orders ADD COLUMN stripe_payment_intent_id text;
    END IF;
    
    -- stripe_customer_id: For returning customers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'stripe_customer_id') THEN
        ALTER TABLE orders ADD COLUMN stripe_customer_id text;
    END IF;
    
    -- paid_at: Timestamp when payment was completed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'paid_at') THEN
        ALTER TABLE orders ADD COLUMN paid_at timestamp with time zone;
    END IF;
    
    -- refunded_amount: Track partial/full refunds
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'refunded_amount') THEN
        ALTER TABLE orders ADD COLUMN refunded_amount numeric(10,2) DEFAULT 0;
    END IF;
END $$;

-- Add check constraints for payment_method and payment_status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                   WHERE table_name = 'orders' AND constraint_name = 'orders_payment_method_check') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check 
            CHECK (payment_method IN ('pickup', 'credit_card', 'paypal'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                   WHERE table_name = 'orders' AND constraint_name = 'orders_payment_status_check') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check 
            CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded'));
    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- Constraints already exist
    NULL;
END $$;

-- Create payments table for detailed transaction history
CREATE TABLE IF NOT EXISTS order_payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD' NOT NULL,
    payment_method text NOT NULL,
    stripe_payment_intent_id text,
    stripe_charge_id text,
    status text NOT NULL DEFAULT 'pending',
    error_message text,
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT NOW() NOT NULL,
    updated_at timestamp with time zone DEFAULT NOW() NOT NULL
);

-- Add constraints for order_payments
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                   WHERE table_name = 'order_payments' AND constraint_name = 'order_payments_status_check') THEN
        ALTER TABLE order_payments ADD CONSTRAINT order_payments_status_check 
            CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                   WHERE table_name = 'order_payments' AND constraint_name = 'order_payments_method_check') THEN
        ALTER TABLE order_payments ADD CONSTRAINT order_payments_method_check 
            CHECK (payment_method IN ('credit_card', 'paypal'));
    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- Constraints already exist
    NULL;
END $$;

-- Add RLS policies for order_payments
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;

-- Staff can view all payments
DROP POLICY IF EXISTS "Staff can view payments" ON order_payments;
CREATE POLICY "Staff can view payments" ON order_payments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- System can insert payments (from webhooks)
DROP POLICY IF EXISTS "System can insert payments" ON order_payments;
CREATE POLICY "System can insert payments" ON order_payments
    FOR INSERT WITH CHECK (true);

-- Update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to order_payments
DROP TRIGGER IF EXISTS update_order_payments_updated_at ON order_payments;
CREATE TRIGGER update_order_payments_updated_at
    BEFORE UPDATE ON order_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
