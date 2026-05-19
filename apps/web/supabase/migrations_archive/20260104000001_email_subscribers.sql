-- Email Subscribers Table for Newsletter Signups
-- Enables customer acquisition through email marketing

BEGIN;

CREATE TABLE IF NOT EXISTS email_subscribers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    first_name text,
    source text DEFAULT 'footer',
    is_verified boolean DEFAULT false,
    subscribed_at timestamptz DEFAULT now(),
    unsubscribed_at timestamptz,
    
    CONSTRAINT email_subscribers_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_source ON email_subscribers(source);

ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage subscribers"
    ON email_subscribers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'staff')
        )
    );

CREATE POLICY "Anyone can subscribe"
    ON email_subscribers FOR INSERT
    WITH CHECK (true);

COMMIT;
