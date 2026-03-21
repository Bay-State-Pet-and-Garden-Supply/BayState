import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://fapnuczapctelxxmrail.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcG51Y3phcGN0ZWx4eG1yYWlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc0MzcxOCwiZXhwIjoyMDgxMzE5NzE4fQ.-X_NU9wDFA5RwfQQ7oWrrorW_b9h_TSfGldtnrmqG2g";
const ENCRYPTION_KEY = "QOI7qnUMB50Dk+kszAeUwZJ0dubBmMXmmC3wXZmL4Mw=";

function decrypt(encryptedValue: string, iv: string, authTag: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('ai_provider_credentials')
    .select('encrypted_value, iv, auth_tag')
    .eq('provider', 'openai')
    .single();

  if (error || !data) {
    console.error('Failed to fetch credentials:', error);
    return;
  }

  try {
    const apiKey = decrypt(data.encrypted_value, data.iv, data.auth_tag);
    console.log('DECRYPTED_API_KEY=' + apiKey);
  } catch (err) {
    console.error('Decryption failed:', err);
  }
}

run();
