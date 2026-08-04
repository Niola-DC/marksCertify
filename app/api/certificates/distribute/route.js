// ============================================================
// MARKSCERTIFY — Certificate Distribution API
// File: /app/api/certificates/distribute/route.js
//
// Takes a cert ID and sends it to the earner via:
//   - Email (Resend)
//   - WhatsApp (Twilio)
//   - Portal (already there — nothing to do)
//
// Send logic lives in lib/distributeCertificate.js so cohort
// completion can trigger the same send without an HTTP round-trip.
// ============================================================

import { requireAdmin } from '../../../lib/apiAuth'
import { distributeCertificate } from '../../../lib/distributeCertificate'

const ERROR_STATUS = {
  'Certificate not found.': 404,
  'Forbidden.': 403,
  'Cannot distribute a revoked certificate.': 400,
}

// ── POST /api/certificates/distribute ────────────────────────
export async function POST(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth

  try {
    const { certId } = await request.json()
    if (!certId) {
      return Response.json({ error: 'certId is required.' }, { status: 400 })
    }

    const results = await distributeCertificate({ certId, institutionId })
    return Response.json({ success: true, results })
  } catch (error) {
    console.error('[distribute] Error:', error)
    const status = ERROR_STATUS[error.message] || 500
    return Response.json(
      { error: status === 500 ? 'Distribution failed.' : error.message, detail: error.message },
      { status }
    )
  }
}
