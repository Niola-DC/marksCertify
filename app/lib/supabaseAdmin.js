import { createClient } from '@supabase/supabase-js'

// The service-role Supabase client, created on first use rather than at
// module load. `next build` evaluates every API route module while
// collecting page data, so importing this file must not require the
// Supabase env vars to be present in the *build* environment — they're
// only needed at request time. Call sites keep using
// `supabaseAdmin.from(...)`, `supabaseAdmin.auth.*`, etc. unchanged; the
// proxy forwards to the real client once it has been built.
let client = null

function getClient() {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase admin client is not configured — NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    )
  }

  client = createClient(url, serviceRoleKey)
  return client
}

export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      const c = getClient()
      const value = c[prop]
      return typeof value === 'function' ? value.bind(c) : value
    },
  }
)
