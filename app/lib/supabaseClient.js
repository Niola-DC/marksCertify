import { createClient } from '@supabase/supabase-js'

// Browser (anon) Supabase client — a lazily created singleton. Deferring
// creation keeps `next build` from needing the public env vars just to
// evaluate this module, and guarantees only one GoTrueClient instance
// ever exists. Call sites keep using `supabase.auth.*` unchanged.
let client = null

function getClient() {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'Supabase client is not configured — NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.'
    )
  }

  client = createClient(url, anonKey)
  return client
}

export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const c = getClient()
      const value = c[prop]
      return typeof value === 'function' ? value.bind(c) : value
    },
  }
)
