// ============================================================
// MARKSCERTIFY — Retrieval Portal Search API
// File: /app/api/portal/search/route.js
//
// Public endpoint — no login required.
// Earners find their own certificates by name, email, or Cert ID.
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { rateLimit, getClientKey } from '../../../lib/rateLimit'
import { escapePostgrestValue } from '../../../lib/postgrestEscape'

const SELECT = `
  cert_id, course_title, issue_date, expiry_date, status, pdf_url, verify_url,
  earners!inner ( full_name, email ),
  institutions ( name, logo_url )
`

export async function GET(request) {
  const clientKey = getClientKey(request)
  const { allowed, resetAt } = rateLimit({ key: `portal-search:${clientKey}`, limit: 20, windowMs: 60_000 })
  if (!allowed) {
    return Response.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
    )
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return Response.json({ error: 'Search term must be at least 2 characters.' }, { status: 400 })
  }

  const term = `%${q}%`
  const safeTerm = escapePostgrestValue(term)
  const results = new Map()

  let byEarner, earnerError, byCertId, certIdError
  try {
    // Match by earner name or email
    ;({ data: byEarner, error: earnerError } = await supabaseAdmin
      .from('certificates')
      .select(SELECT)
      .or(`full_name.ilike.${safeTerm},email.ilike.${safeTerm}`, { foreignTable: 'earners' })
      .order('issue_date', { ascending: false })
      .limit(20))

    if (earnerError) {
      return Response.json({ error: 'Search failed.', detail: earnerError.message }, { status: 500 })
    }

    // Match by Cert ID
    ;({ data: byCertId, error: certIdError } = await supabaseAdmin
      .from('certificates')
      .select(SELECT)
      .ilike('cert_id', term)
      .order('issue_date', { ascending: false })
      .limit(20))

    if (certIdError) {
      return Response.json({ error: 'Search failed.', detail: certIdError.message }, { status: 500 })
    }
  } catch {
    // A thrown exception (network/connectivity blip talking to Supabase)
    // would otherwise crash into Next.js's generic error page instead of
    // clean JSON, breaking the earner-facing search UI's error handling.
    return Response.json({ error: 'Temporarily unable to search right now. Please try again shortly.' }, { status: 503 })
  }

  for (const cert of [...(byEarner || []), ...(byCertId || [])]) {
    results.set(cert.cert_id, cert)
  }

  const certificates = Array.from(results.values())
    .sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date))
    .slice(0, 25)
    .map((cert) => ({
      certId: cert.cert_id,
      courseTitle: cert.course_title,
      issueDate: cert.issue_date,
      expiryDate: cert.expiry_date,
      status: cert.status,
      pdfUrl: cert.pdf_url,
      verifyUrl: cert.verify_url,
      earnerName: cert.earners.full_name,
      institutionName: cert.institutions?.name,
      institutionLogo: cert.institutions?.logo_url,
    }))

  return Response.json({ query: q, count: certificates.length, certificates })
}
