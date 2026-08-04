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
