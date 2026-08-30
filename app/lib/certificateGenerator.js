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
import {
  BASE_STYLES,
  FONT_OPTIONS,
  DEFAULT_TEMPLATE_CONFIG,
  HEX_COLOR_RE,
  sanitizeCustomDesignFields,
} from './templateOptions'

// The certificate template is plain HTML rendered by Puppeteer — any
// user-supplied text (earner name, course title, signatory, institution
// name) must be escaped before insertion, or it becomes HTML/script
// injection into that render.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// When an institution hasn't uploaded a signature image, fall back to a
// stylized abbreviation of the signatory's name — e.g. "Palmer Wayne"
// becomes "P. Wayne" — rendered in italic serif in place of the image.
function getSignatureFallbackText(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  const first = parts[0]
  const last = parts[parts.length - 1]
  return `${first[0].toUpperCase()}. ${last}`
}

function formatDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
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

// Font files never change at runtime either — same one-read-per-process
// caching as the template above, keyed by font option key. 'georgia' (and
// any unrecognised key) has no fontFile — it's the system serif already
// used by default, so no @font-face is needed for it.
const fontCache = new Map()
export async function loadFontBase64(fontKey) {
  const option = FONT_OPTIONS.find((f) => f.key === fontKey)
  if (!option?.fontFile) return null
  if (fontCache.has(fontKey)) return fontCache.get(fontKey)
  const fontPath = join(process.cwd(), 'node_modules', option.fontFile)
  const buffer = await readFile(fontPath)
  const base64 = buffer.toString('base64')
  fontCache.set(fontKey, base64)
  return base64
}

// Builds an inline @font-face rule embedding the font as a base64 data
// URI, so Puppeteer's page.setContent() has no external file/network
// dependency to resolve the font — it's self-contained in the HTML string.
export function buildFontFaceBlock(option, base64) {
  if (!base64) return ''
  const familyName = option.cssFamily.split(',')[0].replace(/'/g, '').trim()
  return `@font-face { font-family: '${familyName}'; src: url(data:font/woff2;base64,${base64}) format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }`
}

// institution.template_config comes straight from the database — it's
// either the column default, something written through the validated
// PATCH /api/institution/template route, or (eventually) AI-generated
// output. It still isn't trusted here: these values get substituted
// directly into an unescaped Puppeteer HTML string (they're CSS, not text
// content escapeHtml() would apply to), so this allowlist check against
// known-good enum/hex values is the actual injection defense for this
// data, mirroring the same checks the PATCH route already enforces.
function sanitizeTemplateConfig(raw) {
  const cfg = { ...DEFAULT_TEMPLATE_CONFIG, ...(raw || {}) }
  if (!BASE_STYLES.includes(cfg.baseStyle)) cfg.baseStyle = DEFAULT_TEMPLATE_CONFIG.baseStyle
  if (!HEX_COLOR_RE.test(cfg.primaryColor)) cfg.primaryColor = DEFAULT_TEMPLATE_CONFIG.primaryColor
  if (!HEX_COLOR_RE.test(cfg.secondaryColor)) cfg.secondaryColor = DEFAULT_TEMPLATE_CONFIG.secondaryColor
  if (!FONT_OPTIONS.some((f) => f.key === cfg.fontFamily)) cfg.fontFamily = DEFAULT_TEMPLATE_CONFIG.fontFamily
  return cfg
}

// Builds the final certificate HTML using MarksCertify's built-in template
// (templates/certificate.html), styled per the institution's Template
// Builder config. This is the default path — used unless the institution
// has an active Custom Design (see buildCustomDesignHtml below).
async function buildBuiltInTemplateHtml({
  institution,
  earnerName,
  courseTitle,
  displayIssueDate,
  displayExpiryDate,
  signatoryName,
  signatoryTitle,
  certId,
  qrDataUrl,
}) {
  let htmlTemplate = await loadTemplate()

  const templateConfig = sanitizeTemplateConfig(institution.template_config)
  const fontOption = FONT_OPTIONS.find((f) => f.key === templateConfig.fontFamily)
  const fontBase64 = await loadFontBase64(templateConfig.fontFamily)

  const replacements = {
    '{{EARNER_NAME}}': escapeHtml(earnerName.trim()),
    '{{COURSE_TITLE}}': escapeHtml(courseTitle.trim()),
    '{{INSTITUTION_NAME}}': escapeHtml(institution.name),
    '{{INSTITUTION_LOGO}}': institution.logo_url || '',
    '{{ISSUE_DATE}}': displayIssueDate,
    '{{EXPIRY_DATE}}': displayExpiryDate || '',
    '{{SIGNATORY_NAME}}': escapeHtml(signatoryName.trim()),
    '{{SIGNATORY_TITLE}}': escapeHtml(signatoryTitle.trim()),
    '{{CERT_ID}}': certId,
    '{{QR_DATA_URL}}': qrDataUrl,
    '{{SIGNATURE_URL}}': institution.signature_url || '',
    '{{SIGNATURE_TEXT}}': institution.signature_url ? '' : escapeHtml(getSignatureFallbackText(signatoryName.trim())),
    '{{BASE_STYLE}}': templateConfig.baseStyle,
    '{{PRIMARY_COLOR}}': templateConfig.primaryColor,
    '{{SECONDARY_COLOR}}': templateConfig.secondaryColor,
    '{{FONT_HEADING}}': fontOption.cssFamily,
    '{{FONT_FACE_BLOCK}}': buildFontFaceBlock(fontOption, fontBase64),
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

  if (!institution.signature_url) {
    htmlTemplate = htmlTemplate.replace(/{{#if SIGNATURE_URL}}[\s\S]*?{{\/if}}/g, '')
    htmlTemplate = htmlTemplate.replace('{{#if SIGNATURE_TEXT}}', '').replace('{{/if}}', '')
  } else {
    htmlTemplate = htmlTemplate.replace('{{#if SIGNATURE_URL}}', '').replace('{{/if}}', '')
    htmlTemplate = htmlTemplate.replace(/{{#if SIGNATURE_TEXT}}[\s\S]*?{{\/if}}/g, '')
  }

  for (const [placeholder, value] of Object.entries(replacements)) {
    htmlTemplate = htmlTemplate.replaceAll(placeholder, value)
  }

  return htmlTemplate
}

// Builds certificate HTML by overlaying the dynamic fields onto an
// institution's own uploaded design (the Custom Design paid add-on),
// instead of MarksCertify's built-in template. Reuses the same
// loadFontBase64/buildFontFaceBlock font-embedding mechanism as the
// built-in path — only fonts actually used by a placed field are embedded,
// since a custom design's fields can each pick a different font (the
// built-in template only ever uses one).
async function buildCustomDesignHtml({
  institution,
  earnerName,
  courseTitle,
  displayIssueDate,
  displayExpiryDate,
  signatoryName,
  signatoryTitle,
  certId,
  qrDataUrl,
}) {
  // institution.custom_design_fields comes straight from the database —
  // already validated once by the PATCH route, but re-validated here too
  // rather than trusted, since these values are about to be interpolated
  // directly into an unescaped Puppeteer HTML style attribute (see
  // sanitizeCustomDesignFields's doc comment for why this allowlist check
  // is the actual injection defense, not just a nicety).
  const { fields } = sanitizeCustomDesignFields(institution.custom_design_fields)

  const values = {
    EARNER_NAME: escapeHtml(earnerName.trim()),
    COURSE_TITLE: escapeHtml(courseTitle.trim()),
    ISSUE_DATE: displayIssueDate || '',
    EXPIRY_DATE: displayExpiryDate || '',
    SIGNATORY_NAME: escapeHtml(signatoryName.trim()),
    SIGNATORY_TITLE: escapeHtml(signatoryTitle.trim()),
    CERT_ID: certId,
  }

  const usedFontKeys = [...new Set(
    Object.entries(fields)
      .filter(([key]) => key !== 'QR_CODE')
      .map(([, field]) => field.fontFamily)
  )]
  const fontFaceBlocks = await Promise.all(
    usedFontKeys.map(async (fontKey) => {
      const option = FONT_OPTIONS.find((f) => f.key === fontKey)
      return buildFontFaceBlock(option, await loadFontBase64(fontKey))
    })
  )

  // custom_design_url is only ever written by the upload route (a
  // Supabase Storage public URL generated by us, never free text), but
  // the CSS interpolation point below is still guarded rather than
  // trusting that invariant to hold forever.
  const safeBackgroundUrl = String(institution.custom_design_url || '').replace(/['"()]/g, '')

  const fieldMarkup = Object.entries(fields)
    .map(([key, field]) => {
      if (key === 'QR_CODE') {
        return `<img src="${qrDataUrl}" style="position:absolute; left:${field.xPercent}%; top:${field.yPercent}%; width:${field.sizePercent}%; aspect-ratio:1/1; object-fit:contain;" alt="Verify QR" />`
      }

      const value = values[key]
      if (!value) return '' // field placed, but this cert has nothing for it (e.g. no expiry date)

      const fontOption = FONT_OPTIONS.find((f) => f.key === field.fontFamily) || FONT_OPTIONS[0]
      return `<div style="position:absolute; left:${field.xPercent}%; top:${field.yPercent}%; width:${field.widthPercent}%; font-size:${field.fontSize}pt; color:${field.color}; font-family:${fontOption.cssFamily}; text-align:${field.align}; white-space:pre-wrap;">${value}</div>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  ${fontFaceBlocks.join('\n')}
  html, body { width: 297mm; height: 210mm; overflow: hidden; }
  .canvas {
    position: relative;
    width: 297mm;
    height: 210mm;
    background-image: url('${safeBackgroundUrl}');
    background-size: cover;
    background-position: center;
  }
</style>
</head>
<body>
<div class="canvas">
${fieldMarkup}
</div>
</body>
</html>`
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
  const displayIssueDate = formatDate(issueDate) || formatDate(new Date().toISOString())
  const displayExpiryDate = formatDate(expiryDate)

  const builderArgs = {
    institution,
    earnerName,
    courseTitle,
    displayIssueDate,
    displayExpiryDate,
    signatoryName,
    signatoryTitle,
    certId,
    qrDataUrl,
  }

  // Custom Design (paid add-on) only engages once BOTH the institution has
  // uploaded a design AND explicitly activated it — an uploaded-but-draft
  // design must never silently go live on a real certificate. Everything
  // else (Puppeteer render, Storage upload, DB insert below) is identical
  // regardless of which HTML got built.
  const useCustomDesign = Boolean(institution.custom_design_enabled && institution.custom_design_url)
  const htmlDocument = useCustomDesign
    ? await buildCustomDesignHtml(builderArgs)
    : await buildBuiltInTemplateHtml(builderArgs)

  // ── PDF (reuses the caller's browser instance) ─────────────
  const page = await browser.newPage()
  let pdfBuffer
  try {
    await page.setContent(htmlDocument, { waitUntil: 'networkidle0' })
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
      .update({ status: 'completed', cert_id: certRecord.id, completed_at: new Date().toISOString() })
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
