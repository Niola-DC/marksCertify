// ============================================================
// MARKSCERTIFY — Certificate Verification API
// File: /app/api/verify/[certId]/route.js
//
// Public endpoint — no login required.
// Called by the verify page at /verify/[certId]
// Also called when anyone scans the QR code on a certificate.
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { rateLimit, getClientKey } from '../../../lib/rateLimit'

export async function GET(request, { params }) {
  const clientKey = getClientKey(request)
  const { allowed, resetAt } = rateLimit({ key: `verify:${clientKey}`, limit: 60, windowMs: 60_000 })
  if (!allowed) {
    return Response.json(
      { valid: false, status: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
    )
  }

  const { certId } = await params   // Next.js 15+: params is a Promise, must be awaited

  if (!certId) {
    return Response.json({ error: 'Certificate ID is required.' }, { status: 400 })
  }

  // Look up the certificate — join earner and institution in one query
  let cert, error
  try {
    ;({ data: cert, error } = await supabaseAdmin
      .from('certificates')
      .select(`
        cert_id,
        course_title,
        issue_date,
        expiry_date,
        status,
        revocation_reason,
        created_at,
        earners (
          full_name
        ),
        institutions (
          name,
          logo_url
        )
      `)
      .eq('cert_id', certId.toUpperCase())  // cert IDs are always uppercase
      .single())
  } catch {
    // A thrown exception (network/connectivity failure talking to
    // Supabase) is a different problem from "no such certificate" — this
    // is the page an employer scans a QR code to trust, so telling them
    // "NOT FOUND" during a transient outage is actively misleading.
    return Response.json(
      { valid: false, status: 'ERROR', message: 'Temporarily unable to check this certificate. Please try again shortly.' },
      { status: 503 }
    )
  }

  // Certificate not found
  if (error || !cert) {
    return Response.json(
      {
        valid: false,
        status: 'NOT_FOUND',
        message: 'This certificate ID does not exist in our records.'
      },
      { status: 404 }
    )
  }

  // Check expiry
  if (cert.expiry_date && new Date(cert.expiry_date) < new Date()) {
    return Response.json({
      valid: false,
      status: 'EXPIRED',
      certId: cert.cert_id,
      earnerName: cert.earners.full_name,
      courseTitle: cert.course_title,
      institutionName: cert.institutions.name,
      institutionLogo: cert.institutions.logo_url,
      issueDate: cert.issue_date,
      expiryDate: cert.expiry_date,
      message: 'This certificate has expired.'
    })
  }

  // Check revocation
  if (cert.status === 'revoked') {
    return Response.json({
      valid: false,
      status: 'REVOKED',
      certId: cert.cert_id,
      earnerName: cert.earners.full_name,
      courseTitle: cert.course_title,
      institutionName: cert.institutions.name,
      institutionLogo: cert.institutions.logo_url,
      issueDate: cert.issue_date,
      message: 'This certificate has been revoked by the issuing institution.'
    })
  }

  // All good — certificate is valid
  return Response.json({
    valid: true,
    status: 'ACTIVE',
    certId: cert.cert_id,
    earnerName: cert.earners.full_name,
    courseTitle: cert.course_title,
    institutionName: cert.institutions.name,
    institutionLogo: cert.institutions.logo_url,
    issueDate: cert.issue_date,
    expiryDate: cert.expiry_date || null,
    issuedAt: cert.created_at
  })
}