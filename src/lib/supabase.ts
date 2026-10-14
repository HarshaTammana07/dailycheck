import { createClient, type SupportedStorage } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabasePublishableKey) &&
  !supabaseUrl.includes('your-project') &&
  !supabasePublishableKey.includes('replace-with');

const secureStorage: SupportedStorage = {
  getItem: async (key) => {
    if (!window.dailycheck?.secureStorage) return localStorage.getItem(key);
    return window.dailycheck.secureStorage.getItem(`supabase:${key}`);
  },
  setItem: async (key, value) => {
    if (!window.dailycheck?.secureStorage) {
      localStorage.setItem(key, value);
      return;
    }
    await window.dailycheck.secureStorage.setItem(`supabase:${key}`, value);
  },
  removeItem: async (key) => {
    if (!window.dailycheck?.secureStorage) {
      localStorage.removeItem(key);
      return;
    }
    await window.dailycheck.secureStorage.removeItem(`supabase:${key}`);
  }
};

export const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabasePublishableKey || 'anonymous', {
  auth: {
    storage: secureStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});
