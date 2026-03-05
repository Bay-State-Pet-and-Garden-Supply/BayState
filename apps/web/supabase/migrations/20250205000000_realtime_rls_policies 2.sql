-- Enable Supabase Realtime RLS policies for Broadcast and Presence
-- For Supabase Realtime v2 (uses RLS on realtime.messages table)

-- Note: Postgres Changes (scrape_jobs subscription) is separate from
-- Channel authorization. The private channel option doesn't apply to Postgres Changes.

-- Create RLS policies for authenticated users to use Broadcast and Presence
-- These are broad policies - customize for production if needed

-- Allow authenticated users to receive broadcasts
CREATE POLICY "authenticated_users_can_receive_broadcast" ON realtime.messages
  FOR SELECT TO authenticated
  USING (true);

-- Allow authenticated users to send broadcasts
CREATE POLICY "authenticated_users_can_send_broadcast" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to track presence
CREATE POLICY "authenticated_users_can_presence" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Enable RLS on realtime.messages table (should already be enabled)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Verify the policies were created
SELECT
    policyname,
    permname,
    rolname
FROM pg_policies
WHERE tablename = 'messages'
AND schemaname = 'realtime';
