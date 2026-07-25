// ============================================================
// MARKSCERTIFY — Certificate List API (admin)
// File: /app/api/certificates/list/route.js
//
// Scoped to the logged-in admin's institution. Supports search
// by earner name, course title, or Cert ID, with pagination.
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../lib/apiAuth'
import { escapePostgrestValue } from '../../../lib/postgrestEscape'

// earner_id is NOT NULL on certificates, so !inner never excludes a
// legitimate row — it's required for the earner-name/email .or() filter
// below to actually constrain results (a plain left-join embed doesn't
// restrict top-level rows, only shapes the nested object per row).
const SELECT = `
  cert_id, course_title, issue_date, expiry_date, status, pdf_url, verify_url, created_at,
  email_sent, email_sent_at, whatsapp_sent, whatsapp_sent_at,
  earners!inner ( full_name, email, phone_number )
`

// Institutions cap out at 2,000 certs/month on the largest Stage-1 plan,
// so fetching-then-paginating in memory keeps this simple and correct.
const MAX_ROWS = 2000

const VALID_STATUSES = new Set(['active', 'revoked'])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Applies the status/date filters shared by every query path below. Kept
// as one function so a filter can't accidentally be added to one query
// branch (e.g. the search-by-earner path) and forgotten on another.
function applyFilters(query, { status, dateFrom, dateTo }) {
  if (status) query = query.eq('status', status)
  if (dateFrom) query = query.gte('issue_date', dateFrom)
  if (dateTo) query = query.lte('issue_date', dateTo)
  return query
}

export async function GET(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)))

  const statusParam = searchParams.get('status')?.trim().toLowerCase()
  const status = VALID_STATUSES.has(statusParam) ? statusParam : null
  const dateFromParam = searchParams.get('dateFrom')?.trim()
  const dateFrom = dateFromParam && ISO_DATE.test(dateFromParam) ? dateFromParam : null
  const dateToParam = searchParams.get('dateTo')?.trim()
  const dateTo = dateToParam && ISO_DATE.test(dateToParam) ? dateToParam : null
  const filters = { status, dateFrom, dateTo }

  let rows = []

  if (q) {
    const term = `%${q}%`
    const safeTerm = escapePostgrestValue(term)

    const [
      { data: byCertOrCourse, error: e1 },
      { data: byEarner, error: e2 },
    ] = await Promise.all([
      applyFilters(
        supabaseAdmin
          .from('certificates')
          .select(SELECT)
          .eq('institution_id', institutionId)
          .or(`cert_id.ilike.${safeTerm},course_title.ilike.${safeTerm}`),
        filters
      )
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),

      applyFilters(
        supabaseAdmin
          .from('certificates')
          .select(SELECT + ', institution_id')
          .eq('institution_id', institutionId)
          .or(`full_name.ilike.${safeTerm},email.ilike.${safeTerm}`, { foreignTable: 'earners' }),
        filters
      )
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),
    ])

    if (e1) return Response.json({ error: 'Search failed.', detail: e1.message }, { status: 500 })
    if (e2) return Response.json({ error: 'Search failed.', detail: e2.message }, { status: 500 })

    const merged = new Map()
    for (const cert of [...(byCertOrCourse || []), ...(byEarner || [])]) merged.set(cert.cert_id, cert)
    rows = Array.from(merged.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } else {
    const { data, error } = await applyFilters(
      supabaseAdmin.from('certificates').select(SELECT).eq('institution_id', institutionId),
      filters
    )
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS)

    if (error) return Response.json({ error: 'Failed to load certificates.', detail: error.message }, { status: 500 })
    rows = data || []
  }

  const total = rows.length
  const start = (page - 1) * pageSize
  const pageRows = rows.slice(start, start + pageSize)

  return Response.json({
    total,
    page,
    pageSize,
    certificates: pageRows.map((c) => ({
      certId: c.cert_id,
      courseTitle: c.course_title,
      issueDate: c.issue_date,
      expiryDate: c.expiry_date,
      status: c.status,
      pdfUrl: c.pdf_url,
      verifyUrl: c.verify_url,
      earnerName: c.earners?.full_name,
      earnerEmail: c.earners?.email,
      earnerPhone: c.earners?.phone_number,
      emailSent: c.email_sent,
      emailSentAt: c.email_sent_at,
      whatsappSent: c.whatsapp_sent,
      whatsappSentAt: c.whatsapp_sent_at,
    })),
  })
}
