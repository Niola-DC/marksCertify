import { supabaseAdmin } from './supabaseAdmin'

// requireAdmin() runs on every admin API call, and each check is normally
// two sequential network round-trips (verify token with Supabase Auth,
// then look up the admin_users row). That overhead gets paid again on
// every keystroke-driven list/filter fetch. Since a bearer token is a
// stateless credential already valid until its own expiry regardless of
// client-side logout, caching the resolved {user, institutionId, role}
// for a short window doesn't weaken the existing trust model — it just
// avoids re-verifying the same still-valid token seconds later.
const CACHE_TTL_MS = 30 * 1000
const cache = new Map()

const SWEEP_INTERVAL_MS = 5 * 60 * 1000
let sweepTimer = null
function startSweeper() {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    const now = Date.now()
    for (const [token, entry] of cache) {
      if (now > entry.expiresAt) cache.delete(token)
    }
  }, SWEEP_INTERVAL_MS)
  sweepTimer.unref?.()
}

// Resolves the Bearer token on a request to { user, institutionId }.
// Returns a Response on any auth failure — callers should check
// `if (result instanceof Response) return result` before using it.
export async function requireAdmin(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')

  const cached = cache.get(token)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result
  }

  // auth.getUser() and the admin_users lookup both make a real network call
  // to Supabase — a connectivity blip on the server throws here rather than
  // returning an { error } field, and previously that propagated as an
  // unhandled exception (an HTML 500 page instead of JSON, breaking the
  // client's res.json() parsing). Treat that case as "temporarily
  // unavailable," not "your session is invalid" — those are different
  // problems with different fixes.
  let user, adminRecord
  try {
    const authResult = await supabaseAdmin.auth.getUser(token)
    if (authResult.error || !authResult.data.user) {
      return Response.json({ error: 'Invalid session. Please log in again.' }, { status: 401 })
    }
    user = authResult.data.user

    const adminResult = await supabaseAdmin
      .from('admin_users')
      .select('institution_id, role')
      .eq('id', user.id)
      .single()

    if (adminResult.error || !adminResult.data) {
      return Response.json({ error: 'Admin profile not found.' }, { status: 403 })
    }
    adminRecord = adminResult.data
  } catch {
    return Response.json({ error: 'Temporarily unable to reach the server. Please try again.' }, { status: 503 })
  }

  const result = { user, institutionId: adminRecord.institution_id, role: adminRecord.role }
  startSweeper()
  cache.set(token, { result, expiresAt: Date.now() + CACHE_TTL_MS })
  return result
}
