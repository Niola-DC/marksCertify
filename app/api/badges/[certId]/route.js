// ============================================================
// MARKSCERTIFY — Open Badge Assertion API
// File: /app/api/badges/[certId]/route.js
//
// Public, unauthenticated JSON-LD endpoint — the machine-readable
// twin of /verify/[certId]. Anything that wants to consume the
// credential programmatically (a wallet, a validator, LinkedIn's
// crawler) fetches this; humans get the verify page.
//
// Revoked/expired certs return 410 Gone rather than a credential —
// a badge that can't currently be verified as valid shouldn't be
// presented as shareable.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientKey } from '../../../lib/rateLimit'
import { buildBadgeAssertion } from '../../../lib/buildBadgeAssertion'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function GET(request, { params }) {
  const clientKey = getClientKey(request)
  const { allowed, resetAt } = rateLimit({ key: `badge:${clientKey}`, limit: 60, windowMs: 60_000 })
  if (!allowed) {
    return Response.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
    )
  }

  const { certId } = await params
  if (!certId) {
    return Response.json({ error: 'Certificate ID is required.' }, { status: 400 })
  }

  let cert, error
  try {
    ;({ data: cert, error } = await supabaseAdmin
      .from('certificates')
      .select(`
        cert_id, course_title, issue_date, expiry_date, status,
        earners ( full_name ),
        institutions ( id, name, logo_url )
      `)
      .eq('cert_id', certId.toUpperCase())
      .single())
  } catch {
    // A thrown exception here means the query itself failed (a network/
    // connectivity blip talking to Supabase) — a genuinely different
    // problem from "no matching row," and telling a caller "not found"
    // for a transient outage would be actively misleading.
    return Response.json({ error: 'Temporarily unable to check this certificate. Please try again shortly.' }, { status: 503 })
  }

  if (error || !cert) {
    return Response.json({ error: 'Certificate not found.' }, { status: 404 })
  }

  if (cert.status === 'revoked') {
    return Response.json({ error: 'This certificate has been revoked and no longer has a valid badge.' }, { status: 410 })
  }
  if (cert.expiry_date && new Date(cert.expiry_date) < new Date()) {
    return Response.json({ error: 'This certificate has expired and no longer has a valid badge.' }, { status: 410 })
  }

  const assertion = buildBadgeAssertion({
    cert,
    earner: cert.earners,
    institution: cert.institutions,
    institutionId: cert.institutions.id,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  })

  return Response.json(assertion, {
    headers: { 'Content-Type': 'application/ld+json' },
  })
}
