// ============================================================
// MARKSCERTIFY — Shared Certificate Generation Logic
// File: /app/lib/certificateGenerator.js
//
// Extracted from the single-cert generate route so batch
// generation can reuse one Puppeteer browser across many rows
// instead of launching/closing it per certificate.
//
// Callers are responsible for: auth, plan-limit checks, and
// incrementing certs_issued_this_month (batch does this once
// for the whole run instead of per row).
// ============================================================

import QRCode from 'qrcode'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { supabaseAdmin } from './supabaseAdmin'

function formatDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// The template file never changes at runtime — read it once per process.
let cachedTemplate = null
async function loadTemplate() {
  if (cachedTemplate) return cachedTemplate
  const templatePath = join(process.cwd(), 'templates', 'certificate.html')
  cachedTemplate = await readFile(templatePath, 'utf-8')
  return cachedTemplate
}

// Renders one certificate, uploads the PDF, and saves the DB record.
// `browser` must already be launched — the caller owns its lifecycle.
export async function generateCertificateForEarner({
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
}) {
  // ── Find or create the earner ─────────────────────────────
  let earnerId

  if (earnerEmail) {
    const { data: existingEarner } = await supabaseAdmin
      .from('earners')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('email', earnerEmail.toLowerCase().trim())
      .single()

    if (existingEarner) {
      earnerId = existingEarner.id
      await supabaseAdmin
        .from('earners')
        .update({
          full_name: earnerName.trim(),
          phone_number: earnerPhone?.trim() || null,
        })
        .eq('id', earnerId)
    }
  }

  if (!earnerId) {
    const { data: newEarner, error: earnerError } = await supabaseAdmin
      .from('earners')
      .insert({
        institution_id: institutionId,
        full_name: earnerName.trim(),
        email: earnerEmail?.toLowerCase().trim() || null,
        phone_number: earnerPhone?.trim() || null,
      })
      .select('id')
      .single()

    if (earnerError) throw new Error(`Failed to create earner: ${earnerError.message}`)
    earnerId = newEarner.id
  }

  // ── Cert ID ─────────────────────────────────────────────────
  const { data: certIdResult, error: certIdError } = await supabaseAdmin.rpc('generate_cert_id')
  if (certIdError) throw new Error(`Failed to generate cert ID: ${certIdError.message}`)
  const certId = certIdResult

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify/${certId}`

  // ── QR code ─────────────────────────────────────────────────
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 200,
    margin: 1,
    color: { dark: '#B8962E', light: '#0D0D0D' },
  })

  // ── Render the certificate HTML ────────────────────────────
  let htmlTemplate = await loadTemplate()

  const displayIssueDate = formatDate(issueDate) || formatDate(new Date().toISOString())
  const displayExpiryDate = formatDate(expiryDate)

  const replacements = {
    '{{EARNER_NAME}}': earnerName.trim(),
    '{{COURSE_TITLE}}': courseTitle.trim(),
    '{{INSTITUTION_NAME}}': institution.name,
    '{{INSTITUTION_LOGO}}': institution.logo_url || '',
    '{{ISSUE_DATE}}': displayIssueDate,
    '{{EXPIRY_DATE}}': displayExpiryDate || '',
    '{{SIGNATORY_NAME}}': signatoryName.trim(),
    '{{SIGNATORY_TITLE}}': signatoryTitle.trim(),
    '{{CERT_ID}}': certId,
    '{{QR_DATA_URL}}': qrDataUrl,
    '{{SIGNATURE_URL}}': '',
  }

  if (!displayExpiryDate) {
    htmlTemplate = htmlTemplate.replace(/{{#if EXPIRY_DATE}}.*?{{\/if}}/gs, '')
  } else {
    htmlTemplate = htmlTemplate.replace('{{#if EXPIRY_DATE}}', '').replace('{{/if}}', '')
  }

  if (!institution.logo_url) {
    htmlTemplate = htmlTemplate.replace(/{{#if INSTITUTION_LOGO}}[\s\S]*?{{\/if}}/g, '')
  } else {
    htmlTemplate = htmlTemplate.replace('{{#if INSTITUTION_LOGO}}', '').replace('{{/if}}', '')
  }

  for (const [placeholder, value] of Object.entries(replacements)) {
    htmlTemplate = htmlTemplate.replaceAll(placeholder, value)
  }

  // ── PDF (reuses the caller's browser instance) ─────────────
  const page = await browser.newPage()
  let pdfBuffer
  try {
    await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' })
    pdfBuffer = await page.pdf({
      width: '297mm',
      height: '210mm',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })
  } finally {
    await page.close()
  }

  // ── Upload to Storage ───────────────────────────────────────
  const storagePath = `certificates/${institutionId}/${certId}.pdf`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('certificates')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: false })

  if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`)

  const { data: { publicUrl: pdfUrl } } = supabaseAdmin.storage.from('certificates').getPublicUrl(storagePath)

  // ── Save the certificate record ─────────────────────────────
  const { data: certRecord, error: certError } = await supabaseAdmin
    .from('certificates')
    .insert({
      cert_id: certId,
      institution_id: institutionId,
      earner_id: earnerId,
      course_title: courseTitle.trim(),
      issue_date: issueDate || new Date().toISOString().split('T')[0],
      expiry_date: expiryDate || null,
      signatory_name: signatoryName.trim(),
      signatory_title: signatoryTitle.trim(),
      pdf_url: pdfUrl,
      verify_url: verifyUrl,
      status: 'active',
    })
    .select()
    .single()

  if (certError) throw new Error(`Failed to save certificate: ${certError.message}`)

  if (cohortId) {
    await supabaseAdmin
      .from('cohort_members')
      .update({ status: 'completed', cert_id: certRecord.id })
      .eq('cohort_id', cohortId)
      .eq('earner_id', earnerId)
  }

  return {
    certId,
    pdfUrl,
    verifyUrl,
    earnerName: earnerName.trim(),
    courseTitle: courseTitle.trim(),
    issueDate: certRecord.issue_date,
    status: 'active',
  }
}
