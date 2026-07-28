// ============================================================
// MARKSCERTIFY — Cohorts API (list + create)
// File: /app/api/cohorts/route.js
// ============================================================

import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { requireAdmin } from '../../lib/apiAuth'

// ── GET /api/cohorts ──────────────────────────────────────────
// List cohorts for the admin's institution with computed stats.
// Row counts here stay small (cohorts, not certificates), so
// computing completion rate in JS after one extra query is simpler
// and correct rather than reaching for a SQL aggregate.
export async function GET(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth

  const { data: cohorts, error: cohortsError } = await supabaseAdmin
    .from('cohorts')
    .select('id, name, program, start_date, end_date, completion_criteria, signatory_name, signatory_title, created_at')
    .eq('institution_id', institutionId)
    .order('created_at', { ascending: false })

  if (cohortsError) {
    return Response.json({ error: 'Failed to load cohorts.', detail: cohortsError.message }, { status: 500 })
  }

  const { data: members, error: membersError } = await supabaseAdmin
    .from('cohort_members')
    .select('cohort_id, status, cert_id')
    .eq('institution_id', institutionId)

  if (membersError) {
    return Response.json({ error: 'Failed to load cohort members.', detail: membersError.message }, { status: 500 })
  }

  const statsByCohort = new Map()
  for (const m of members || []) {
    const stats = statsByCohort.get(m.cohort_id) || { memberCount: 0, completedCount: 0, certsIssued: 0 }
    stats.memberCount++
    if (m.status === 'completed') stats.completedCount++
    if (m.cert_id) stats.certsIssued++
    statsByCohort.set(m.cohort_id, stats)
  }

  return Response.json({
    cohorts: (cohorts || []).map((c) => {
      const stats = statsByCohort.get(c.id) || { memberCount: 0, completedCount: 0, certsIssued: 0 }
      return {
        cohortId: c.id,
        name: c.name,
        program: c.program,
        startDate: c.start_date,
        endDate: c.end_date,
        completionCriteria: c.completion_criteria,
        signatoryName: c.signatory_name,
        signatoryTitle: c.signatory_title,
        createdAt: c.created_at,
        memberCount: stats.memberCount,
        completedCount: stats.completedCount,
        certsIssued: stats.certsIssued,
        completionRate: stats.memberCount ? Math.round((stats.completedCount / stats.memberCount) * 100) : 0,
      }
    }),
  })
}

// ── POST /api/cohorts ─────────────────────────────────────────
export async function POST(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth

  const body = await request.json().catch(() => ({}))
  const { name, program, startDate, endDate, completionCriteria, signatoryName, signatoryTitle } = body

  const missing = []
  if (!name?.trim()) missing.push('name')
  if (!program?.trim()) missing.push('program')
  if (!signatoryName?.trim()) missing.push('signatoryName')
  if (!signatoryTitle?.trim()) missing.push('signatoryTitle')
  if (missing.length > 0) {
    return Response.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })
  }

  const { data: cohort, error } = await supabaseAdmin
    .from('cohorts')
    .insert({
      institution_id: institutionId,
      name: name.trim(),
      program: program.trim(),
      start_date: startDate || null,
      end_date: endDate || null,
      completion_criteria: completionCriteria?.trim() || null,
      signatory_name: signatoryName.trim(),
      signatory_title: signatoryTitle.trim(),
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: 'Failed to create cohort.', detail: error.message }, { status: 500 })
  }

  return Response.json({
    cohort: {
      cohortId: cohort.id,
      name: cohort.name,
      program: cohort.program,
      startDate: cohort.start_date,
      endDate: cohort.end_date,
      completionCriteria: cohort.completion_criteria,
      signatoryName: cohort.signatory_name,
      signatoryTitle: cohort.signatory_title,
      createdAt: cohort.created_at,
      memberCount: 0,
      completedCount: 0,
      certsIssued: 0,
      completionRate: 0,
    },
  }, { status: 201 })
}
