// ============================================================
// MARKSCERTIFY — Dashboard Stats API
// File: /app/api/dashboard/stats/route.js
//
// Powers the admin Overview page: institution info, cert counts,
// and the 5 most recently issued certificates.
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../lib/apiAuth'

const PLAN_LIMITS = {
  starter: 50,
  growth: 500,
  scale: 2000,
  enterprise: Infinity,
}

export async function GET(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth

  const { data: institution, error: instError } = await supabaseAdmin
    .from('institutions')
    .select('name, plan_tier, certs_issued_this_month')
    .eq('id', institutionId)
    .single()

  if (instError || !institution) {
    return Response.json({ error: 'Institution not found.' }, { status: 404 })
  }

  const { count: total } = await supabaseAdmin
    .from('certificates')
    .select('id', { count: 'exact', head: true })
    .eq('institution_id', institutionId)

  const { count: revoked } = await supabaseAdmin
    .from('certificates')
    .select('id', { count: 'exact', head: true })
    .eq('institution_id', institutionId)
    .eq('status', 'revoked')

  const { data: recentCerts } = await supabaseAdmin
    .from('certificates')
    .select('cert_id, course_title, status, created_at, earners ( full_name )')
    .eq('institution_id', institutionId)
    .order('created_at', { ascending: false })
    .limit(5)

  return Response.json({
    institution: {
      name: institution.name,
      planTier: institution.plan_tier,
      certsThisMonth: institution.certs_issued_this_month,
      planLimit: PLAN_LIMITS[institution.plan_tier],
    },
    totals: {
      total: total || 0,
      active: (total || 0) - (revoked || 0),
      revoked: revoked || 0,
    },
    recent: (recentCerts || []).map((c) => ({
      certId: c.cert_id,
      courseTitle: c.course_title,
      status: c.status,
      earnerName: c.earners?.full_name,
      createdAt: c.created_at,
    })),
  })
}
