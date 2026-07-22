// ============================================================
// MARKSCERTIFY — Admin Account Profile API
// File: /app/api/account/profile/route.js
//
// The logged-in admin's own account details (distinct from the
// institution profile) — name, phone, avatar. Email lives in
// Supabase Auth and is changed client-side via supabase.auth
// .updateUser(), which sends its own confirmation email.
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../lib/apiAuth'

export async function GET(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth

  const { data: adminUser, error } = await supabaseAdmin
    .from('admin_users')
    .select('full_name, email, phone_number, avatar_url, role')
    .eq('id', auth.user.id)
    .single()

  if (error) {
    return Response.json({ error: 'Failed to load account.', detail: error.message }, { status: 500 })
  }
  if (!adminUser) {
    return Response.json({ error: 'Account not found.' }, { status: 404 })
  }

  return Response.json({
    account: {
      fullName: adminUser.full_name,
      email: adminUser.email,
      phoneNumber: adminUser.phone_number,
      avatarUrl: adminUser.avatar_url,
      role: adminUser.role,
    },
  })
}

export async function PATCH(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => ({}))

  const updates = {}
  if ('fullName' in body) updates.full_name = body.fullName?.trim() || null
  if ('phoneNumber' in body) updates.phone_number = body.phoneNumber?.trim() || null

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  const { data: adminUser, error } = await supabaseAdmin
    .from('admin_users')
    .update(updates)
    .eq('id', auth.user.id)
    .select('full_name, email, phone_number, avatar_url, role')
    .single()

  if (error) {
    return Response.json({ error: 'Failed to update account.', detail: error.message }, { status: 500 })
  }

  return Response.json({
    account: {
      fullName: adminUser.full_name,
      email: adminUser.email,
      phoneNumber: adminUser.phone_number,
      avatarUrl: adminUser.avatar_url,
      role: adminUser.role,
    },
  })
}
