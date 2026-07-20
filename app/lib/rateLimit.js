// ============================================================
// MARKSCERTIFY — In-memory rate limiter
// File: /app/lib/rateLimit.js
//
// Fixed-window counter keyed by an arbitrary string (typically
// "<route>:<ip>"). Correct for a single Node process (this dev
// server, or a single self-hosted instance). On multi-instance
// serverless (e.g. Vercel with concurrent lambdas) each instance
// keeps its own counters, so the effective limit becomes
// "limit x number of warm instances" rather than a hard global
// cap — fine as an abuse deterrent, but if a hard guarantee is
// ever needed, swap this for a shared store (Upstash Redis, etc).
// ============================================================

const buckets = new Map()

const SWEEP_INTERVAL_MS = 5 * 60 * 1000
let sweepTimer = null

function startSweeper() {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart > bucket.windowMs) buckets.delete(key)
    }
  }, SWEEP_INTERVAL_MS)
  // Don't hold the process open just for this timer (irrelevant in
  // serverless, harmless in long-running dev/self-hosted processes).
  sweepTimer.unref?.()
}

// Returns { allowed, remaining, resetAt }. `resetAt` is an epoch ms
// timestamp — useful for a Retry-After header on 429s.
export function rateLimit({ key, limit, windowMs }) {
  startSweeper()

  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now, windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.windowStart + windowMs }
  }

  bucket.count++
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.windowStart + windowMs }
}

export function getClientKey(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}
