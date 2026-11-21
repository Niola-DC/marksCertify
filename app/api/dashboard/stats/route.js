// ============================================================
// MARKSCERTIFY — Dashboard Stats API
// File: /app/api/dashboard/stats/route.js
//
// Powers the admin Overview page: institution info, cert counts,
// and the 5 most recently issued certificates.
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../lib/apiAuth'
import { DEFAULT_TEMPLATE_CONFIG, isMissingColumnError } from '../../../lib/templateOptions'

const PLAN_LIMITS = {
  starter: 50,
  growth: 500,
  scale: 2000,
  enterprise: Infinity,
}

// Cert-visible profile fields — the ones an institution needs filled in
// before its certificates look right to a recipient.
const PROFILE_COLS = 'name, plan_tier, certs_issued_this_month, logo_url, contact_email, default_signatory_name, default_signatory_title'

// `template_config` arrives with migration 0006 — select it optionally so
// the dashboard still loads if that migration hasn't been applied.
async function loadInstitution(institutionId) {
  const withTemplate = await supabaseAdmin
    .from('institutions')
    .select(`${PROFILE_COLS}, template_config`)
    .eq('id', institutionId)
    .single()

  if (isMissingColumnError(withTemplate.error)) {
    return supabaseAdmin
      .from('institutions')
      .select(PROFILE_COLS)
      .eq('id', institutionId)
      .single()
  }
  return withTemplate
}

// "Customized" = the saved config differs from the shipped default (a
// brand-new institution carries the default until it touches the builder).
function isTemplateCustomized(config) {
  if (!config) return false
  return Object.keys(DEFAULT_TEMPLATE_CONFIG).some(
    (key) => config[key] !== DEFAULT_TEMPLATE_CONFIG[key]
  )
}

export async function GET(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth

  const { data: institution, error: instError } = await loadInstitution(institutionId)

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
    setup: {
      profileComplete: Boolean(
        institution.logo_url &&
        institution.contact_email &&
        institution.default_signatory_name &&
        institution.default_signatory_title
      ),
      templateCustomized: isTemplateCustomized(institution.template_config),
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
