import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

let client: SupabaseClient<Database> | null = null;

export function getSupabaseEmbedded(): SupabaseClient<Database> {
  if (client) return client;
  if (typeof window === 'undefined') {
    throw new Error('Supabase embedded client is only available in the browser');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  client = createClient<Database>(
    url,
    anon,
    {
      auth: {
        persistSession: true,
        storage: window.localStorage,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    }
  );
  return client;
}
