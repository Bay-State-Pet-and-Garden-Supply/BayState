import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config'

let cachedClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (typeof window === 'undefined') {
    return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  }

  if (!cachedClient) {
    cachedClient = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  }

  return cachedClient;
}

