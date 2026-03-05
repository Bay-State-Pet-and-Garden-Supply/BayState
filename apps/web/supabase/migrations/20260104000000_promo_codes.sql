-- Promo Codes System Migration
-- Implements discount codes, usage tracking, and order discount fields

BEGIN;

-- ============================================================================
-- 1. Promo Codes Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS promo_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    description text,
    
    -- Discount configuration
    discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_shipping')),
    discount_value numeric(10, 2) NOT NULL,
    minimum_order numeric(10, 2) DEFAULT 0,
    maximum_discount numeric(10, 2), -- Cap for percentage discounts
    
    -- Usage limits
    max_uses integer, -- NULL = unlimited
    current_uses integer DEFAULT 0,
    max_uses_per_user integer DEFAULT 1,
    
    -- Validity period
    starts_at timestamptz DEFAULT now(),
    expires_at timestamptz, -- NULL = never expires
    
    -- Conditions
    is_active boolean DEFAULT true,
    first_order_only boolean DEFAULT false,
    requires_account boolean DEFAULT false,
    
    -- Metadata
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for code lookups (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code_upper ON promo_codes(UPPER(code));

-- Index for active promos
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active, starts_at, expires_at);

-- ============================================================================
-- 2. Promo Redemptions Table (tracks usage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS promo_redemptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id uuid NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
    guest_email text, -- For guest checkouts
    discount_applied numeric(10, 2) NOT NULL,
    created_at timestamptz DEFAULT now(),
    
    -- Ensure we can track by user or email
    CONSTRAINT redemption_identifier CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL)
);

-- Index for checking user redemptions
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(promo_code_id, user_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_email ON promo_redemptions(promo_code_id, guest_email);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_order ON promo_redemptions(order_id);

-- ============================================================================
-- 3. Add Discount Fields to Orders Table
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES promo_codes(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount numeric(10, 2) DEFAULT 0;

-- ============================================================================
-- 4. Add First Order Tracking to Profiles
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_order_completed boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_order_at timestamptz;

-- ============================================================================
-- 5. Row Level Security
-- ============================================================================

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;

-- Public can validate active promo codes (read-only, limited fields)
CREATE POLICY "Anyone can validate active promo codes"
    ON promo_codes FOR SELECT
    USING (is_active = true AND starts_at <= now() AND (expires_at IS NULL OR expires_at > now()));

-- Admin/staff can manage all promo codes
CREATE POLICY "Admin can manage promo codes"
    ON promo_codes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- Users can see their own redemptions
CREATE POLICY "Users can view own redemptions"
    ON promo_redemptions FOR SELECT
    USING (user_id = auth.uid());

-- Admin can view all redemptions
CREATE POLICY "Admin can view all redemptions"
    ON promo_redemptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- System can insert redemptions (via service role)
CREATE POLICY "System can insert redemptions"
    ON promo_redemptions FOR INSERT
    WITH CHECK (true);

-- ============================================================================
-- 6. Trigger to Update current_uses on Redemption
-- ============================================================================

CREATE OR REPLACE FUNCTION update_promo_code_usage()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE promo_codes 
    SET current_uses = current_uses + 1,
        updated_at = now()
    WHERE id = NEW.promo_code_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_promo_usage ON promo_redemptions;
CREATE TRIGGER trigger_update_promo_usage
    AFTER INSERT ON promo_redemptions
    FOR EACH ROW
    EXECUTE FUNCTION update_promo_code_usage();

-- ============================================================================
-- 7. Trigger to Mark First Order Complete
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_first_order_complete()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NOT NULL THEN
        UPDATE profiles 
        SET first_order_completed = true,
            first_order_at = COALESCE(first_order_at, now())
        WHERE id = NEW.user_id 
        AND first_order_completed = false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_mark_first_order ON orders;
CREATE TRIGGER trigger_mark_first_order
    AFTER INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION mark_first_order_complete();

-- ============================================================================
-- 8. Seed WELCOME Promo Code (First Order Discount)
-- ============================================================================

INSERT INTO promo_codes (code, description, discount_type, discount_value, minimum_order, first_order_only, requires_account, is_active)
VALUES ('WELCOME', 'Welcome discount for first-time customers - $10 off your first order!', 'fixed_amount', 10.00, 25.00, true, false, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO promo_codes (code, description, discount_type, discount_value, minimum_order, first_order_only, requires_account, is_active)
VALUES ('WELCOME20', '20% off your first order!', 'percentage', 20.00, 0, true, false, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO promo_codes (code, description, discount_type, discount_value, minimum_order, first_order_only, requires_account, is_active, maximum_discount)
VALUES ('FREESHIP', 'Free shipping on orders $35+', 'free_shipping', 0, 35.00, false, false, true, NULL)
ON CONFLICT (code) DO NOTHING;

COMMIT;
