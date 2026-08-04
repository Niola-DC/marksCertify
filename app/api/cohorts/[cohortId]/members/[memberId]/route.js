// ============================================================
// MARKSCERTIFY — Cohort Member Status API
// File: /app/api/cohorts/[cohortId]/members/[memberId]/route.js
//
// PATCH changes a member's status. Moving a member INTO 'completed'
// (from any other status) auto-triggers certificate generation and
// distribution — that's the whole point of cohorts: completion
// itself issues the cert, no separate "generate" click needed.
// Any other status change is a plain field update.
//
// Generation is guarded by an atomic claim (generation_claimed_at) so
// two overlapping completion triggers for the same member — a double
// click, a resumed/retried batch, a re-delivered webhook — can't both
// pass a stale check and issue duplicate certificates. A request that
// loses the race waits for the winner to finish rather than bouncing
// back a conflict, since the caller has no useful way to "retry
// shortly" on its own.
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

// A claim older than this is assumed abandoned (the process that held it
// crashed or got killed before it could release the claim itself) and can
// be taken over. Comfortably above observed generation time.
const CLAIM_STALE_MS = 2 * 60 * 1000
// How long we'll wait, polling, for a concurrent claim to resolve before
// giving up and telling the caller to retry later.
const CLAIM_MAX_WAIT_MS = 20 * 1000
const CLAIM_POLL_INTERVAL_MS = 1000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Atomically claims memberId for generation. Returns true if this call won
// the claim, false if someone else holds a live (non-stale) one or the
// member already has a cert. WHERE-clause conditions, not a read-then-write
// check, so concurrent callers can't both see "unclaimed" and both proceed.
async function tryClaim(memberId) {
  const cutoff = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
  const { data, error } = await supabaseAdmin
    .from('cohort_members')
    .update({ generation_claimed_at: new Date().toISOString() })
    .eq('id', memberId)
    .is('cert_id', null)
    .or(`generation_claimed_at.is.null,generation_claimed_at.lt.${cutoff}`)
    .select('id')

  if (error) console.error('[cohort-claim] tryClaim query failed:', error)

  return Boolean(data && data.length > 0)
}

async function releaseClaim(memberId) {
  await supabaseAdmin
    .from('cohort_members')
    .update({ generation_claimed_at: null })
    .eq('id', memberId)
}

async function fetchMemberResponse(memberId) {
  const { data: updatedMember } = await supabaseAdmin
    .from('cohort_members')
    .select(`
      id, status, completed_at,
      earners ( full_name, email, phone_number ),
      certificates ( cert_id, pdf_url, verify_url, email_sent, whatsapp_sent, email_error, whatsapp_error )
    `)
    .eq('id', memberId)
    .single()

  return {
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
  }
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
  // who was already issued a cert, is a plain update — no claim needed,
  // there's nothing to generate.
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

  // ── Transitioning to 'completed' — claim the row before generating ──
  let claimed = await tryClaim(memberId)

  if (!claimed) {
    // Someone else has (or recently had) this claim. Wait for them to
    // finish rather than bouncing a conflict back — poll for either the
    // cert landing (they succeeded) or the claim going stale (they died
    // without releasing it, so we can take over).
    const deadline = Date.now() + CLAIM_MAX_WAIT_MS
    let resolved = null // 'already-done' | null

    while (!claimed && Date.now() < deadline) {
      await sleep(CLAIM_POLL_INTERVAL_MS)

      const { data: current } = await supabaseAdmin
        .from('cohort_members')
        .select('cert_id')
        .eq('id', memberId)
        .single()

      if (current?.cert_id) {
        resolved = 'already-done'
        break
      }

      claimed = await tryClaim(memberId)
    }

    if (resolved === 'already-done') {
      return Response.json({ member: await fetchMemberResponse(memberId) })
    }

    if (!claimed) {
      return Response.json(
        { error: 'Certificate generation is taking longer than expected for this participant. Please try again in a moment.' },
        { status: 503 }
      )
    }
  }

  // ── We hold the claim — every exit from here must release it unless generation succeeded ──
  try {
    const { data: institution, error: instError } = await supabaseAdmin
      .from('institutions')
      .select('name, logo_url, signature_url, plan_tier, certs_issued_this_month, billing_cycle_start')
      .eq('id', institutionId)
      .single()

    if (instError || !institution) {
      await releaseClaim(memberId)
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
      await releaseClaim(memberId)
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
      await releaseClaim(memberId)
      return Response.json({ error: 'Certificate generation failed.', detail: err.message }, { status: 500 })
    } finally {
      await browser.close()
    }

    await supabaseAdmin
      .from('institutions')
      .update({ certs_issued_this_month: currentMonthCount + 1 })
      .eq('id', institutionId)

    // generateCertificateForEarner already updated cohort_members
    // (status -> completed, cert_id, completed_at) as a side effect —
    // cert_id now being set is itself what keeps the claim from ever being
    // re-taken, so there's nothing left to release here.
    let distribution = null
    try {
      distribution = await distributeCertificate({ certId: certificate.certId, institutionId })
    } catch (err) {
      console.error('[cohort-complete] Distribution failed:', err)
      distribution = { email: 'failed', whatsapp: 'failed', error: err.message }
    }

    return Response.json({
      member: await fetchMemberResponse(memberId),
      certificate,
      distribution,
    })
  } catch (err) {
    await releaseClaim(memberId)
    return Response.json({ error: 'Certificate generation failed.', detail: err.message }, { status: 500 })
  }
}
