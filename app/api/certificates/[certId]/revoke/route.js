// ============================================================
// MARKSCERTIFY — Revoke Certificate API
// File: /app/api/certificates/[certId]/revoke/route.js
// ============================================================

import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../../lib/apiAuth'

export async function POST(request, { params }) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth

  const { certId } = await params
  const body = await request.json().catch(() => ({}))
  const reason = body.reason?.trim() || null

  const { data: cert, error: fetchError } = await supabaseAdmin
    .from('certificates')
    .select('id, institution_id, status')
    .eq('cert_id', certId.toUpperCase())
    .single()

  if (fetchError || !cert) {
    return Response.json({ error: 'Certificate not found.' }, { status: 404 })
  }

  if (cert.institution_id !== institutionId) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }

  if (cert.status === 'revoked') {
    return Response.json({ error: 'Certificate is already revoked.' }, { status: 400 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('certificates')
    .update({ status: 'revoked', revocation_reason: reason })
    .eq('id', cert.id)

  if (updateError) {
    return Response.json({ error: 'Failed to revoke certificate.', detail: updateError.message }, { status: 500 })
  }

  return Response.json({ success: true, certId: certId.toUpperCase(), status: 'revoked' })
}
