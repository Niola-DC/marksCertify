// ============================================================
// MARKSCERTIFY — Cohort Detail API
// File: /app/api/cohorts/[cohortId]/route.js
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../lib/apiAuth'

// ── GET /api/cohorts/[cohortId] ───────────────────────────────
export async function GET(request, { params }) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth
  const { cohortId } = await params

  const { data: cohort, error: cohortError } = await supabaseAdmin
    .from('cohorts')
    .select('id, name, program, start_date, end_date, completion_criteria, signatory_name, signatory_title, created_at')
    .eq('id', cohortId)
    .eq('institution_id', institutionId)
    .single()

  if (cohortError || !cohort) {
    return Response.json({ error: 'Cohort not found.' }, { status: 404 })
  }

  const { data: members, error: membersError } = await supabaseAdmin
    .from('cohort_members')
    .select(`
      id, status, completed_at, created_at,
      earners ( full_name, email, phone_number ),
      certificates ( cert_id, pdf_url, verify_url, email_sent, whatsapp_sent, email_error, whatsapp_error )
    `)
    .eq('cohort_id', cohortId)
    .order('created_at', { ascending: false })

  if (membersError) {
    return Response.json({ error: 'Failed to load members.', detail: membersError.message }, { status: 500 })
  }

  const memberList = (members || []).map((m) => ({
    memberId: m.id,
    status: m.status,
    completedAt: m.completed_at,
    createdAt: m.created_at,
    earnerName: m.earners?.full_name,
    earnerEmail: m.earners?.email,
    earnerPhone: m.earners?.phone_number,
    certId: m.certificates?.cert_id || null,
    pdfUrl: m.certificates?.pdf_url || null,
    verifyUrl: m.certificates?.verify_url || null,
    emailSent: m.certificates?.email_sent || false,
    whatsappSent: m.certificates?.whatsapp_sent || false,
    emailError: m.certificates?.email_error || null,
    whatsappError: m.certificates?.whatsapp_error || null,
  }))

  const completedCount = memberList.filter((m) => m.status === 'completed').length
  const certsIssued = memberList.filter((m) => m.certId).length
  const failedCount = memberList.filter((m) => m.certId && (m.emailError || m.whatsappError)).length

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
    },
    members: memberList,
    stats: {
      memberCount: memberList.length,
      completedCount,
      certsIssued,
      completionRate: memberList.length ? Math.round((completedCount / memberList.length) * 100) : 0,
      emailsSent: memberList.filter((m) => m.emailSent).length,
      whatsappsSent: memberList.filter((m) => m.whatsappSent).length,
      failedCount,
    },
  })
}

// Maps the API's camelCase body keys to their cohorts table columns.
// `name`/`program`/`signatory*` are NOT NULL — if the caller includes one
// it must be non-empty; the optional fields accept '' to clear them.
const EDITABLE_COLUMNS = {
  name: 'name',
  program: 'program',
  startDate: 'start_date',
  endDate: 'end_date',
  completionCriteria: 'completion_criteria',
  signatoryName: 'signatory_name',
  signatoryTitle: 'signatory_title',
}
const REQUIRED_TEXT_KEYS = new Set(['name', 'program', 'signatoryName', 'signatoryTitle'])

// ── PATCH /api/cohorts/[cohortId] ─────────────────────────────
// Edit a cohort's own details. Only the keys present in the body are
// touched, so the client can send a partial patch or the whole form.
//
// `program` is copied onto each certificate as its course_title at
// generation time (see certificateGenerator.js), so editing it here only
// affects certs issued AFTER the edit — already-issued certificates keep
// the title they were generated with.
export async function PATCH(request, { params }) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth
  const { cohortId } = await params

  const { data: existing, error: findError } = await supabaseAdmin
    .from('cohorts')
    .select('id')
    .eq('id', cohortId)
    .eq('institution_id', institutionId)
    .single()

  if (findError || !existing) {
    return Response.json({ error: 'Cohort not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))

  const updates = {}
  for (const [key, column] of Object.entries(EDITABLE_COLUMNS)) {
    if (body[key] === undefined) continue

    if (REQUIRED_TEXT_KEYS.has(key)) {
      const value = String(body[key]).trim()
      if (!value) {
        return Response.json({ error: `${key} cannot be empty.` }, { status: 400 })
      }
      updates[column] = value
    } else if (key === 'startDate' || key === 'endDate') {
      updates[column] = body[key] || null
    } else {
      updates[column] = body[key]?.trim() || null
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update.' }, { status: 400 })
  }

  const { data: cohort, error } = await supabaseAdmin
    .from('cohorts')
    .update(updates)
    .eq('id', cohortId)
    .eq('institution_id', institutionId)
    .select('id, name, program, start_date, end_date, completion_criteria, signatory_name, signatory_title, created_at')
    .single()

  if (error) {
    return Response.json({ error: 'Failed to update cohort.', detail: error.message }, { status: 500 })
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
    },
  })
}

// ── DELETE /api/cohorts/[cohortId] ───────────────────────────
// Removes the cohort and, via ON DELETE CASCADE on
// cohort_members.cohort_id, its participant rows. Certificates already
// issued through the cohort are NOT touched — they're standalone records
// with their own verify URLs and stay valid and verifiable afterwards.
export async function DELETE(request, { params }) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth
  const { cohortId } = await params

  const { data: existing, error: findError } = await supabaseAdmin
    .from('cohorts')
    .select('id')
    .eq('id', cohortId)
    .eq('institution_id', institutionId)
    .single()

  if (findError || !existing) {
    return Response.json({ error: 'Cohort not found.' }, { status: 404 })
  }

  const { error } = await supabaseAdmin
    .from('cohorts')
    .delete()
    .eq('id', cohortId)
    .eq('institution_id', institutionId)

  if (error) {
    return Response.json({ error: 'Failed to delete cohort.', detail: error.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
