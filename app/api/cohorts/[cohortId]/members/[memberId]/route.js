// ============================================================
// MARKSCERTIFY — Cohort Member Status API
// File: /app/api/cohorts/[cohortId]/members/[memberId]/route.js
//
// PATCH changes a member's status. Moving a member INTO 'completed'
// (from any other status) auto-triggers certificate generation and
// distribution — that's the whole point of cohorts: completion
// itself issues the cert, no separate "generate" click needed.
// Any other status change is a plain field update.
// ============================================================

import puppeteer from 'puppeteer'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../../../lib/apiAuth'
import { generateCertificateForEarner } from '../../../../../lib/certificateGenerator'
import { distributeCertificate } from '../../../../../lib/distributeCertificate'

const VALID_STATUSES = new Set(['enrolled', 'in_progress', 'completed', 'dropped'])

const PLAN_LIMITS = {
  starter: 50,
  growth: 500,
  scale: 2000,
  enterprise: Infinity,
}

// ── PATCH /api/cohorts/[cohortId]/members/[memberId] ──────────
export async function PATCH(request, { params }) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth
  const { cohortId, memberId } = await params

  const body = await request.json().catch(() => ({}))
  const status = body.status

  if (!VALID_STATUSES.has(status)) {
    return Response.json({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` }, { status: 400 })
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from('cohort_members')
    .select(`
      id, status, cert_id, cohort_id, earner_id,
      earners ( full_name, email, phone_number ),
      cohorts ( id, program, signatory_name, signatory_title, institution_id )
    `)
    .eq('id', memberId)
    .eq('cohort_id', cohortId)
    .eq('institution_id', institutionId)
    .single()

  if (memberError || !member) {
    return Response.json({ error: 'Cohort member not found.' }, { status: 404 })
  }

  // Moving away from 'completed', or re-confirming completion for a member
  // who was already issued a cert, is a plain update — checking cert_id
  // (not just current status) matters because a member can cycle back to
  // 'completed' after being moved away from it, and re-generating would
  // silently issue a second certificate and re-send the email.
  if (status !== 'completed' || member.cert_id) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('cohort_members')
      .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
      .eq('id', memberId)
      .select()
      .single()

    if (updateError) {
      return Response.json({ error: 'Failed to update status.', detail: updateError.message }, { status: 500 })
    }
    return Response.json({ member: updated })
  }

  // ── Transitioning to 'completed' — generate + distribute ──────
  const { data: institution, error: instError } = await supabaseAdmin
    .from('institutions')
    .select('name, logo_url, signature_url, plan_tier, certs_issued_this_month, billing_cycle_start')
    .eq('id', institutionId)
    .single()

  if (instError || !institution) {
    return Response.json({ error: 'Institution not found.' }, { status: 404 })
  }

  const cycleStart = new Date(institution.billing_cycle_start)
  const today = new Date()
  const monthsElapsed = (today.getFullYear() - cycleStart.getFullYear()) * 12
                      + (today.getMonth() - cycleStart.getMonth())

  let currentMonthCount = institution.certs_issued_this_month
  if (monthsElapsed >= 1) {
    await supabaseAdmin
      .from('institutions')
      .update({ certs_issued_this_month: 0, billing_cycle_start: today.toISOString().split('T')[0] })
      .eq('id', institutionId)
    currentMonthCount = 0
  }

  const limit = PLAN_LIMITS[institution.plan_tier]
  if (currentMonthCount >= limit) {
    return Response.json(
      {
        error: `You have reached your ${institution.plan_tier} plan limit of ${limit} certificates this month.`,
        code: 'PLAN_LIMIT_REACHED',
      },
      { status: 402 }
    )
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  let certificate
  try {
    certificate = await generateCertificateForEarner({
      browser,
      institution,
      institutionId,
      earnerName: member.earners.full_name,
      earnerEmail: member.earners.email,
      earnerPhone: member.earners.phone_number,
      courseTitle: member.cohorts.program,
      signatoryName: member.cohorts.signatory_name,
      signatoryTitle: member.cohorts.signatory_title,
      cohortId,
    })
  } catch (err) {
    return Response.json({ error: 'Certificate generation failed.', detail: err.message }, { status: 500 })
  } finally {
    await browser.close()
  }

  await supabaseAdmin
    .from('institutions')
    .update({ certs_issued_this_month: currentMonthCount + 1 })
    .eq('id', institutionId)

  // generateCertificateForEarner already updated cohort_members
  // (status -> completed, cert_id, completed_at) as a side effect.
  let distribution = null
  try {
    distribution = await distributeCertificate({ certId: certificate.certId, institutionId })
  } catch (err) {
    console.error('[cohort-complete] Distribution failed:', err)
    distribution = { email: 'failed', whatsapp: 'failed', error: err.message }
  }

  const { data: updatedMember } = await supabaseAdmin
    .from('cohort_members')
    .select(`
      id, status, completed_at,
      earners ( full_name, email, phone_number ),
      certificates ( cert_id, pdf_url, verify_url, email_sent, whatsapp_sent, email_error, whatsapp_error )
    `)
    .eq('id', memberId)
    .single()

  return Response.json({
    member: {
      memberId: updatedMember.id,
      status: updatedMember.status,
      completedAt: updatedMember.completed_at,
      earnerName: updatedMember.earners?.full_name,
      earnerEmail: updatedMember.earners?.email,
      earnerPhone: updatedMember.earners?.phone_number,
      certId: updatedMember.certificates?.cert_id || null,
      pdfUrl: updatedMember.certificates?.pdf_url || null,
      verifyUrl: updatedMember.certificates?.verify_url || null,
      emailSent: updatedMember.certificates?.email_sent || false,
      whatsappSent: updatedMember.certificates?.whatsapp_sent || false,
      emailError: updatedMember.certificates?.email_error || null,
      whatsappError: updatedMember.certificates?.whatsapp_error || null,
    },
    certificate,
    distribution,
  })
}
