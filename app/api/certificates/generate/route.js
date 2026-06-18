// ============================================================
// MARKSCERTIFY — Certificate Generation API Route
// File location in your Next.js project:
//   /app/api/certificates/generate/route.js
//
// This is the CORE of the entire product.
// One POST request to this route:
//   1. Validates the input
//   2. Checks the institution's plan limits
//   3. Creates / finds the earner record
//   4. Generates a unique Cert ID
//   5. Generates a QR code
//   6. Renders the HTML certificate template
//   7. Converts it to a PDF via Puppeteer
//   8. Uploads the PDF to Supabase Storage
//   9. Saves the certificate record to the database
//  10. Returns the cert record with PDF URL and verify URL
// ============================================================

import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'
import QRCode from 'qrcode'
import { readFile } from 'fs/promises'
import { join } from 'path'

// ── Supabase admin client ─────────────────────────────────────
// Uses the SERVICE ROLE key — bypasses RLS so this route can
// write to any table it needs to. NEVER expose this key to the browser.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // in .env.local, never committed to git
)

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
      .select('name, logo_url, plan_tier, certs_issued_this_month, billing_cycle_start')
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


    // ── Step 4: Create or find the earner record ────────────
    let earnerId

    // If earnerEmail provided, check if they already exist for this institution
    if (earnerEmail) {
      const { data: existingEarner } = await supabaseAdmin
        .from('earners')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('email', earnerEmail.toLowerCase().trim())
        .single()

      if (existingEarner) {
        earnerId = existingEarner.id
        // Update their name/phone in case it changed
        await supabaseAdmin
          .from('earners')
          .update({
            full_name: earnerName.trim(),
            phone_number: earnerPhone?.trim() || null
          })
          .eq('id', earnerId)
      }
    }

    if (!earnerId) {
      // Create a new earner record
      const { data: newEarner, error: earnerError } = await supabaseAdmin
        .from('earners')
        .insert({
          institution_id: institutionId,
          full_name: earnerName.trim(),
          email: earnerEmail?.toLowerCase().trim() || null,
          phone_number: earnerPhone?.trim() || null
        })
        .select('id')
        .single()

      if (earnerError) throw new Error(`Failed to create earner: ${earnerError.message}`)
      earnerId = newEarner.id
    }


    // ── Step 5: Generate a unique Cert ID ───────────────────
    // Calls the SQL function we created in schema.sql
    const { data: certIdResult, error: certIdError } = await supabaseAdmin
      .rpc('generate_cert_id')

    if (certIdError) throw new Error(`Failed to generate cert ID: ${certIdError.message}`)
    const certId = certIdResult  // e.g. "MC-2026-NG-00001"

    // The public verify URL for this certificate
    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify/${certId}`


    // ── Step 6: Generate QR code ────────────────────────────
    // toDataURL gives us a base64 PNG we can embed directly in the HTML
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 200,
      margin: 1,
      color: {
        dark: '#B8962E',    // gold dots
        light: '#0D0D0D'    // dark background — matches certificate
      }
    })


    // ── Step 7: Render the certificate HTML ─────────────────
    // Load the template file
    const templatePath = join(process.cwd(), 'templates', 'certificate.html')
    let htmlTemplate = await readFile(templatePath, 'utf-8')

    // Format dates for display
    const formatDate = (dateStr) => {
      if (!dateStr) return null
      return new Date(dateStr).toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    }

    const displayIssueDate = formatDate(issueDate) || formatDate(new Date().toISOString())
    const displayExpiryDate = formatDate(expiryDate)

    // Replace all template placeholders with real values
    // Simple string replacement — no template engine needed
    const replacements = {
      '{{EARNER_NAME}}':      earnerName.trim(),
      '{{COURSE_TITLE}}':     courseTitle.trim(),
      '{{INSTITUTION_NAME}}': institution.name,
      '{{INSTITUTION_LOGO}}': institution.logo_url || '',
      '{{ISSUE_DATE}}':       displayIssueDate,
      '{{EXPIRY_DATE}}':      displayExpiryDate || '',
      '{{SIGNATORY_NAME}}':   signatoryName.trim(),
      '{{SIGNATORY_TITLE}}':  signatoryTitle.trim(),
      '{{CERT_ID}}':          certId,
      '{{QR_DATA_URL}}':      qrDataUrl,
      '{{SIGNATURE_URL}}':    '', // will add signature upload in a later sprint
    }

    // Handle optional {{#if ...}} blocks in the template
    // If EXPIRY_DATE is empty, remove the "Valid until" text
    if (!displayExpiryDate) {
      htmlTemplate = htmlTemplate.replace(
        /{{#if EXPIRY_DATE}}.*?{{\/if}}/gs, ''
      )
    } else {
      htmlTemplate = htmlTemplate
        .replace('{{#if EXPIRY_DATE}}', '')
        .replace('{{/if}}', '')
    }

    // If no institution logo, remove the img tag
    if (!institution.logo_url) {
      htmlTemplate = htmlTemplate.replace(
        /{{#if INSTITUTION_LOGO}}[\s\S]*?{{\/if}}/g, ''
      )
    } else {
      htmlTemplate = htmlTemplate
        .replace('{{#if INSTITUTION_LOGO}}', '')
        .replace('{{/if}}', '')
    }

    // Do all the simple replacements
    for (const [placeholder, value] of Object.entries(replacements)) {
      htmlTemplate = htmlTemplate.replaceAll(placeholder, value)
    }


    // ── Step 8: Convert HTML to PDF with Puppeteer ──────────
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // required in serverless environments
      ]
    })

    const page = await browser.newPage()

    // Set the HTML content
    await page.setContent(htmlTemplate, {
      waitUntil: 'networkidle0'  // wait for fonts/images to load
    })

    // Generate PDF at A4 landscape
    const pdfBuffer = await page.pdf({
      width: '297mm',
      height: '210mm',
      printBackground: true,    // IMPORTANT: renders background colours and images
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    })

    await browser.close()


    // ── Step 9: Upload PDF to Supabase Storage ──────────────
    // Path: certificates/{institutionId}/{certId}.pdf
    const storagePath = `certificates/${institutionId}/${certId}.pdf`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('certificates')              // bucket name — create this in Supabase dashboard
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false                    // don't allow overwriting
      })

    if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`)

    // Get the public URL for the uploaded PDF
    const { data: { publicUrl: pdfUrl } } = supabaseAdmin.storage
      .from('certificates')
      .getPublicUrl(storagePath)


    // ── Step 10: Save certificate record to database ─────────
    const { data: certRecord, error: certError } = await supabaseAdmin
      .from('certificates')
      .insert({
        cert_id:          certId,
        institution_id:   institutionId,
        earner_id:        earnerId,
        course_title:     courseTitle.trim(),
        issue_date:       issueDate || new Date().toISOString().split('T')[0],
        expiry_date:      expiryDate || null,
        signatory_name:   signatoryName.trim(),
        signatory_title:  signatoryTitle.trim(),
        pdf_url:          pdfUrl,
        verify_url:       verifyUrl,
        status:           'active'
      })
      .select()
      .single()

    if (certError) throw new Error(`Failed to save certificate: ${certError.message}`)


    // ── Step 11: Increment the institution's monthly count ───
    await supabaseAdmin
      .from('institutions')
      .update({ certs_issued_this_month: currentMonthCount + 1 })
      .eq('id', institutionId)


    // ── Step 12: If cohort provided, link the cert ───────────
    if (cohortId) {
      await supabaseAdmin
        .from('cohort_members')
        .update({
          status: 'completed',
          cert_id: certRecord.id
        })
        .eq('cohort_id', cohortId)
        .eq('earner_id', earnerId)
    }


    // ── Return success ───────────────────────────────────────
    return Response.json({
      success: true,
      certificate: {
        certId,
        pdfUrl,
        verifyUrl,
        earnerName: earnerName.trim(),
        courseTitle: courseTitle.trim(),
        issueDate: certRecord.issue_date,
        status: 'active'
      }
    }, { status: 201 })


  } catch (error) {
    console.error('[generate-cert] Error:', error)
    return Response.json(
      { error: 'Certificate generation failed. Please try again.', detail: error.message },
      { status: 500 }
    )
  }
}