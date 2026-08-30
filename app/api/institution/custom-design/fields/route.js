// ============================================================
// MARKSCERTIFY — Custom Design Field Positions API (paid add-on)
// File: /app/api/institution/custom-design/fields/route.js
//
// GET: fetch the admin's custom design state (entitlement, uploaded
// image, positioned fields, live/draft status) — ungated, so the editor
// page can render a friendly locked message on direct navigation instead
// of erroring.
// PATCH: save field positions and/or activate the design. Gated behind
// the customDesign entitlement; strictly rejects invalid field data
// rather than silently coercing it (unlike the render-time backstop in
// certificateGenerator.js, an admin's explicit save should never persist
// something other than what they set).
// ============================================================

import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../../lib/apiAuth'
import { REQUIRED_CUSTOM_DESIGN_FIELDS, sanitizeCustomDesignFields } from '../../../../lib/templateOptions'

const SELECT = 'addons, custom_design_url, custom_design_fields, custom_design_enabled'

export async function GET(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth

  const { data: institution, error } = await supabaseAdmin
    .from('institutions')
    .select(SELECT)
    .eq('id', auth.institutionId)
    .single()

  if (error || !institution) {
    return Response.json({ error: 'Institution not found.' }, { status: 404 })
  }

  return Response.json({
    entitled: Boolean(institution.addons?.customDesign),
    designUrl: institution.custom_design_url,
    fields: institution.custom_design_fields || {},
    enabled: institution.custom_design_enabled,
  })
}

export async function PATCH(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth

  const { data: institution, error: instError } = await supabaseAdmin
    .from('institutions')
    .select(SELECT)
    .eq('id', auth.institutionId)
    .single()

  if (instError || !institution) {
    return Response.json({ error: 'Institution not found.' }, { status: 404 })
  }
  if (!institution.addons?.customDesign) {
    return Response.json({ error: 'Custom Design is a paid add-on. Contact us to unlock it.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))

  const { fields, invalidKeys } = sanitizeCustomDesignFields(body.fields)
  if (invalidKeys.length > 0) {
    return Response.json({ error: 'Invalid field data.', invalidKeys }, { status: 400 })
  }

  const updates = { custom_design_fields: fields }

  if ('enabled' in body) {
    if (body.enabled === true) {
      if (!institution.custom_design_url) {
        return Response.json({ error: 'Upload a design before activating it.' }, { status: 400 })
      }
      const missing = REQUIRED_CUSTOM_DESIGN_FIELDS.filter((key) => !(key in fields))
      if (missing.length > 0) {
        return Response.json(
          { error: 'Place all required fields before activating.', missing },
          { status: 400 }
        )
      }
      updates.custom_design_enabled = true
    } else {
      updates.custom_design_enabled = false
    }
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('institutions')
    .update(updates)
    .eq('id', auth.institutionId)
    .select(SELECT)
    .single()

  if (updateError) {
    return Response.json({ error: 'Failed to save.', detail: updateError.message }, { status: 500 })
  }

  return Response.json({
    designUrl: updated.custom_design_url,
    fields: updated.custom_design_fields || {},
    enabled: updated.custom_design_enabled,
  })
}
