// ============================================================
// MARKSCERTIFY — Batch Certificate Generation API
// File: /app/api/certificates/batch/route.js
//
// Processes one chunk of a CSV upload (the client splits a large
// batch into chunks and calls this repeatedly so it can show real
// progress and keep each request comfortably short). Reuses a
// single Puppeteer browser across the whole chunk.
// ============================================================

import puppeteer from 'puppeteer'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../lib/apiAuth'
import { generateCertificateForEarner } from '../../../lib/certificateGenerator'

const PLAN_LIMITS = {
  starter: 50,
  growth: 500,
  scale: 2000,
  enterprise: Infinity,
}

const MAX_ROWS_PER_REQUEST = 50

function validateRow(row) {
  const missing = []
  if (!row.earnerName?.trim()) missing.push('earnerName')
  if (!row.courseTitle?.trim()) missing.push('courseTitle')
  if (!row.signatoryName?.trim()) missing.push('signatoryName')
  if (!row.signatoryTitle?.trim()) missing.push('signatoryTitle')
  return missing
}

export async function POST(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth

  const body = await request.json().catch(() => ({}))
  const rows = Array.isArray(body.rows) ? body.rows : []

  if (rows.length === 0) {
    return Response.json({ error: 'No rows provided.' }, { status: 400 })
  }
  if (rows.length > MAX_ROWS_PER_REQUEST) {
    return Response.json({ error: `Max ${MAX_ROWS_PER_REQUEST} rows per request.` }, { status: 400 })
  }

  const { data: institution, error: instError } = await supabaseAdmin
    .from('institutions')
    .select('name, logo_url, signature_url, plan_tier, certs_issued_this_month, billing_cycle_start, template_config, custom_design_url, custom_design_fields, custom_design_enabled')
    .eq('id', institutionId)
    .single()

  if (instError || !institution) {
    return Response.json({ error: 'Institution not found.' }, { status: 404 })
  }

  // Reset monthly count if billing cycle has rolled over (same logic as single-generate)
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
  const remainingAllowance = limit === Infinity ? Infinity : Math.max(0, limit - currentMonthCount)

  const results = []
  let successCount = 0

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {}

      if (successCount >= remainingAllowance) {
        results.push({
          index: i,
          success: false,
          error: `Plan limit reached (${institution.plan_tier}: ${limit}/month).`,
        })
        continue
      }

      const missing = validateRow(row)
      if (missing.length > 0) {
        results.push({ index: i, success: false, error: `Missing required fields: ${missing.join(', ')}` })
        continue
      }

      try {
        const certificate = await generateCertificateForEarner({
          browser,
          institution,
          institutionId,
          earnerName: row.earnerName,
          earnerEmail: row.earnerEmail,
          earnerPhone: row.earnerPhone,
          courseTitle: row.courseTitle,
          issueDate: row.issueDate,
          expiryDate: row.expiryDate,
          signatoryName: row.signatoryName,
          signatoryTitle: row.signatoryTitle,
        })
        results.push({ index: i, success: true, certificate })
        successCount++
      } catch (err) {
        results.push({ index: i, success: false, error: err.message })
      }
    }
  } finally {
    await browser.close()
  }

  if (successCount > 0) {
    await supabaseAdmin
      .from('institutions')
      .update({ certs_issued_this_month: currentMonthCount + successCount })
      .eq('id', institutionId)
  }

  return Response.json({
    results,
    successCount,
    failureCount: results.length - successCount,
  })
}
