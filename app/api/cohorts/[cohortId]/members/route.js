// ============================================================
// MARKSCERTIFY — Cohort Members API (add participants)
// File: /app/api/cohorts/[cohortId]/members/route.js
//
// Accepts rows from either a CSV upload or manual entry (client
// normalizes both to the same shape). Each row finds-or-creates an
// earner (same match-by-email logic as certificateGenerator.js)
// then enrolls them in the cohort — re-adding an existing member is
// a no-op rather than resetting their progress back to 'enrolled'.
// ============================================================

import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../../lib/apiAuth'

const MAX_ROWS_PER_REQUEST = 500

// ── POST /api/cohorts/[cohortId]/members ──────────────────────
export async function POST(request, { params }) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth
  const { cohortId } = await params

  const { data: cohort, error: cohortError } = await supabaseAdmin
    .from('cohorts')
    .select('id')
    .eq('id', cohortId)
    .eq('institution_id', institutionId)
    .single()

  if (cohortError || !cohort) {
    return Response.json({ error: 'Cohort not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const rows = Array.isArray(body.members) ? body.members : []

  if (rows.length === 0) {
    return Response.json({ error: 'No members provided.' }, { status: 400 })
  }
  if (rows.length > MAX_ROWS_PER_REQUEST) {
    return Response.json({ error: `Max ${MAX_ROWS_PER_REQUEST} members per request.` }, { status: 400 })
  }

  const results = []
  let addedCount = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {}
    const earnerName = row.earnerName?.trim()
    const earnerEmail = row.earnerEmail?.trim()
    const earnerPhone = row.earnerPhone?.trim()

    if (!earnerName) {
      results.push({ index: i, success: false, error: 'Missing earnerName' })
      continue
    }

    try {
      // ── Find or create the earner (mirrors certificateGenerator.js) ──
      let earnerId
      if (earnerEmail) {
        const { data: existingEarner } = await supabaseAdmin
          .from('earners')
          .select('id')
          .eq('institution_id', institutionId)
          .eq('email', earnerEmail.toLowerCase())
          .single()
        if (existingEarner) earnerId = existingEarner.id
      }

      if (!earnerId) {
        const { data: newEarner, error: earnerError } = await supabaseAdmin
          .from('earners')
          .insert({
            institution_id: institutionId,
            full_name: earnerName,
            email: earnerEmail?.toLowerCase() || null,
            phone_number: earnerPhone || null,
          })
          .select('id')
          .single()
        if (earnerError) throw new Error(earnerError.message)
        earnerId = newEarner.id
      }

      // ignoreDuplicates: re-adding an earner already in this cohort
      // leaves their existing status/cert untouched instead of resetting it.
      const { error: memberError, data: inserted } = await supabaseAdmin
        .from('cohort_members')
        .upsert(
          { cohort_id: cohortId, institution_id: institutionId, earner_id: earnerId, status: 'enrolled' },
          { onConflict: 'cohort_id,earner_id', ignoreDuplicates: true }
        )
        .select('id')

      if (memberError) throw new Error(memberError.message)

      results.push({ index: i, success: true, alreadyMember: !inserted || inserted.length === 0 })
      addedCount++
    } catch (err) {
      results.push({ index: i, success: false, error: err.message })
    }
  }

  return Response.json({
    results,
    addedCount,
    failureCount: results.length - addedCount,
  })
}
