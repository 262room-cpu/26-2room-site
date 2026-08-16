/* global process */
import { createClient } from '@supabase/supabase-js'

let supabaseAdmin = null

export class SupabaseConfigurationError extends Error {
  constructor() {
    super('Supabase server configuration is unavailable')
    this.name = 'SupabaseConfigurationError'
  }
}

export function getSupabaseAdmin() {
  if (supabaseAdmin) {
    return supabaseAdmin
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim()
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim()

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new SupabaseConfigurationError()
  }

  supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return supabaseAdmin
}
