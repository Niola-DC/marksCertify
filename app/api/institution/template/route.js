// ============================================================
// MARKSCERTIFY — Institution Template Configuration API
// File: /app/api/institution/template/route.js
//
// GET: fetch the admin's institution certificate template config.
// PATCH: update it (baseStyle, primaryColor, secondaryColor, fontFamily).
//
// Kept separate from /api/institution/profile — different validation
// shape (enum/hex fields vs. free text) and keeping it separate avoids
// any regression risk to the already-shipped profile PATCH handler.
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../lib/apiAuth'
import { BASE_STYLES, FONT_OPTIONS, DEFAULT_TEMPLATE_CONFIG, HEX_COLOR_RE } from '../../../lib/templateOptions'

export async function GET(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth

  const { data: institution, error } = await supabaseAdmin
    .from('institutions')
    .select('template_config')
    .eq('id', auth.institutionId)
    .single()

  if (error) {
    return Response.json({ error: 'Failed to load template.', detail: error.message }, { status: 500 })
  }

  return Response.json({ templateConfig: institution.template_config || DEFAULT_TEMPLATE_CONFIG })
}

export async function PATCH(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => ({}))
  const config = { ...DEFAULT_TEMPLATE_CONFIG, ...body }

  if (!BASE_STYLES.includes(config.baseStyle)) {
    return Response.json({ error: 'Invalid baseStyle.' }, { status: 400 })
  }
  if (!HEX_COLOR_RE.test(config.primaryColor) || !HEX_COLOR_RE.test(config.secondaryColor)) {
    return Response.json({ error: 'Colors must be hex (#RRGGBB).' }, { status: 400 })
  }
  if (!FONT_OPTIONS.some((f) => f.key === config.fontFamily)) {
    return Response.json({ error: 'Invalid fontFamily.' }, { status: 400 })
  }

  // No plan_tier gate — open to all tiers for now, matching WhatsApp
  // distribution's current behaviour. Once Stage 3 billing (Paystack)
  // lands, gate here, e.g.: if (!['growth','scale','enterprise'].includes(planTier)) return 403.

  const { data: institution, error } = await supabaseAdmin
    .from('institutions')
    .update({ template_config: config })
    .eq('id', auth.institutionId)
    .select('template_config')
    .single()

  if (error) {
    return Response.json({ error: 'Failed to save template.', detail: error.message }, { status: 500 })
  }

  return Response.json({ templateConfig: institution.template_config })
}
