import { createClient } from '@supabase/supabase-js'

const isProd = import.meta.env.PROD
const supabaseUrl = isProd ? window.location.origin : (import.meta.env.VITE_SUPABASE_URL || 'http://localhost:8080')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'adamasig-local-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})
