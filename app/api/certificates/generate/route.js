// ============================================================
// MARKSCERTIFY — Certificate Generation API Route
// File location in your Next.js project:
//   /app/api/certificates/generate/route.js
//
// This is the CORE of the entire product.
// One POST request to this route:
//   1. Validates the input
//   2. Checks the institution's plan limits
//   3. Delegates earner/Cert ID/QR/PDF/storage/DB work to
//      lib/certificateGenerator.js (shared with batch generation)
//   4. Returns the cert record with PDF URL and verify URL
// ============================================================

import puppeteer from 'puppeteer'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { generateCertificateForEarner } from '../../../lib/certificateGenerator'

// ── Plan limits ───────────────────────────────────────────────
// How many certificates each tier can issue per month
const PLAN_LIMITS = {
  starter:    50,
  growth:     500,
  scale:      2000,
  enterprise: Infinity
}

// ── POST /api/certificates/generate ──────────────────────────
export async function POST(request) {
  try {

    // ── Step 1: Authenticate the admin ─────────────────────
    // Get the JWT from the Authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')

    // Verify the token with Supabase Auth
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return Response.json({ error: 'Invalid session. Please log in again.' }, { status: 401 })
    }

    // Get the admin's institution
    const { data: adminRecord, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('institution_id, role')
      .eq('id', user.id)
      .single()

    if (adminError || !adminRecord) {
      return Response.json({ error: 'Admin profile not found.' }, { status: 403 })
    }

    const institutionId = adminRecord.institution_id


    // ── Step 2: Validate the request body ──────────────────
    const body = await request.json()

    const {
      earnerName,        // required — full name of the person receiving the cert
      earnerEmail,       // optional but recommended
      earnerPhone,       // optional — needed for WhatsApp delivery
      courseTitle,       // required — name of the program
      issueDate,         // optional — defaults to today
      expiryDate,        // optional — null means never expires
      signatoryName,     // required — name on the signature block
      signatoryTitle,    // required — title/role of the signatory
      cohortId,          // optional — link cert to a cohort
    } = body

    // Check required fields
    const missing = []
    if (!earnerName?.trim())    missing.push('earnerName')
    if (!courseTitle?.trim())   missing.push('courseTitle')
    if (!signatoryName?.trim()) missing.push('signatoryName')
    if (!signatoryTitle?.trim()) missing.push('signatoryTitle')

    if (missing.length > 0) {
      return Response.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }


    // ── Step 3: Check plan limits ───────────────────────────
    const { data: institution, error: instError } = await supabaseAdmin
      .from('institutions')
      .select('name, logo_url, signature_url, plan_tier, certs_issued_this_month, billing_cycle_start')
      .eq('id', institutionId)
      .single()

    if (instError || !institution) {
      return Response.json({ error: 'Institution not found.' }, { status: 404 })
    }

    // Reset monthly count if billing cycle has rolled over
    const cycleStart = new Date(institution.billing_cycle_start)
    const today = new Date()
    const monthsElapsed = (today.getFullYear() - cycleStart.getFullYear()) * 12
                        + (today.getMonth() - cycleStart.getMonth())

    let currentMonthCount = institution.certs_issued_this_month
    if (monthsElapsed >= 1) {
      // New billing month — reset the counter
      await supabaseAdmin
        .from('institutions')
        .update({
          certs_issued_this_month: 0,
          billing_cycle_start: today.toISOString().split('T')[0]
        })
        .eq('id', institutionId)
      currentMonthCount = 0
    }

    const limit = PLAN_LIMITS[institution.plan_tier]
    if (currentMonthCount >= limit) {
      return Response.json(
        {
          error: `You have reached your ${institution.plan_tier} plan limit of ${limit} certificates this month.`,
          code: 'PLAN_LIMIT_REACHED',
          upgradeUrl: '/dashboard/billing'
        },
        { status: 402 }
      )
    }


    // ── Step 4: Generate the certificate (earner, Cert ID, QR, PDF, storage, DB) ──
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // required in serverless environments
      ]
    })

    let certificate
    try {
      certificate = await generateCertificateForEarner({
        browser,
        institution,
        institutionId,
        earnerName,
        earnerEmail,
        earnerPhone,
        courseTitle,
        issueDate,
        expiryDate,
        signatoryName,
        signatoryTitle,
        cohortId,
      })
    } finally {
      await browser.close()
    }


    // ── Step 5: Increment the institution's monthly count ───
    await supabaseAdmin
      .from('institutions')
      .update({ certs_issued_this_month: currentMonthCount + 1 })
      .eq('id', institutionId)


    // ── Return success ───────────────────────────────────────
    return Response.json({ success: true, certificate }, { status: 201 })


  } catch (error) {
    console.error('[generate-cert] Error:', error)
    return Response.json(
      { error: 'Certificate generation failed. Please try again.', detail: error.message },
      { status: 500 }
    )
  }
}
