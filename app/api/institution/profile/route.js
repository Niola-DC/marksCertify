// ============================================================
// MARKSCERTIFY — Institution Profile API
// File: /app/api/institution/profile/route.js
//
// GET: fetch the admin's institution profile.
// PATCH: update the editable fields (name, location, contact
// details, website, social links, default signatory name/title).
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../lib/apiAuth'

const SELECT = `
  name, plan_tier, certs_issued_this_month, logo_url, signature_url,
  location, contact_email, contact_phone, website,
  instagram_url, twitter_url, linkedin_url,
  default_signatory_name, default_signatory_title, addons
`

export async function GET(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth

  const { data: institution, error } = await supabaseAdmin
    .from('institutions')
    .select(SELECT)
    .eq('id', auth.institutionId)
    .single()

  if (error) {
    return Response.json({ error: 'Failed to load institution.', detail: error.message }, { status: 500 })
  }
  if (!institution) {
    return Response.json({ error: 'Institution not found.' }, { status: 404 })
  }

  return Response.json({ institution: toCamelCase(institution) })
}

export async function PATCH(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => ({}))

  const updates = {}
  if ('name' in body) updates.name = body.name?.trim()
  if ('location' in body) updates.location = body.location?.trim() || null
  if ('contactEmail' in body) updates.contact_email = body.contactEmail?.trim() || null
  if ('contactPhone' in body) updates.contact_phone = body.contactPhone?.trim() || null
  if ('website' in body) updates.website = body.website?.trim() || null
  if ('instagramUrl' in body) updates.instagram_url = body.instagramUrl?.trim() || null
  if ('twitterUrl' in body) updates.twitter_url = body.twitterUrl?.trim() || null
  if ('linkedinUrl' in body) updates.linkedin_url = body.linkedinUrl?.trim() || null
  if ('defaultSignatoryName' in body) updates.default_signatory_name = body.defaultSignatoryName?.trim() || null
  if ('defaultSignatoryTitle' in body) updates.default_signatory_title = body.defaultSignatoryTitle?.trim() || null

  if (updates.name === '') {
    return Response.json({ error: 'Institution name cannot be empty.' }, { status: 400 })
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  const { data: institution, error } = await supabaseAdmin
    .from('institutions')
    .update(updates)
    .eq('id', auth.institutionId)
    .select(SELECT)
    .single()

  if (error) {
    return Response.json({ error: 'Failed to update profile.', detail: error.message }, { status: 500 })
  }

  return Response.json({ institution: toCamelCase(institution) })
}

function toCamelCase(institution) {
  return {
    name: institution.name,
    planTier: institution.plan_tier,
    certsThisMonth: institution.certs_issued_this_month,
    logoUrl: institution.logo_url,
    signatureUrl: institution.signature_url,
    location: institution.location,
    contactEmail: institution.contact_email,
    contactPhone: institution.contact_phone,
    website: institution.website,
    instagramUrl: institution.instagram_url,
    twitterUrl: institution.twitter_url,
    linkedinUrl: institution.linkedin_url,
    defaultSignatoryName: institution.default_signatory_name,
    defaultSignatoryTitle: institution.default_signatory_title,
    addons: institution.addons || { customDesign: false },
  }
}
