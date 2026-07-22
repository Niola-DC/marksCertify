// ============================================================
// MARKSCERTIFY — Institution Signup API
// File: /app/api/auth/signup/route.js
//
// Creates the institution, a Supabase Auth user, and the
// admin_users link row in one shot, then signs the new admin in
// and hands the client a session to adopt.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const schoolName = body.schoolName?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password

  if (!schoolName || !email || !password) {
    return Response.json({ error: 'School name, email, and password are required.' }, { status: 400 })
  }
  if (password.length < 6) {
    return Response.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }

  // 1. Institution
  const { data: institution, error: instError } = await supabaseAdmin
    .from('institutions')
    .insert({ name: schoolName, plan_tier: 'starter' })
    .select('id')
    .single()

  if (instError) {
    return Response.json({ error: 'Failed to create institution.', detail: instError.message }, { status: 500 })
  }

  // 2. Auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    await supabaseAdmin.from('institutions').delete().eq('id', institution.id)
    // Always 400 here, regardless of the underlying reason (already
    // registered vs. some other validation failure) — a status code that
    // varies by reason turns this into a scriptable oracle for checking
    // whether an email is already registered.
    return Response.json({ error: authError.message }, { status: 400 })
  }

  // 3. Link admin_users
  const { error: linkError } = await supabaseAdmin.from('admin_users').insert({
    id: authData.user.id,
    institution_id: institution.id,
    role: 'owner',
    email,
  })

  if (linkError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    await supabaseAdmin.from('institutions').delete().eq('id', institution.id)
    return Response.json({ error: 'Failed to link admin account.', detail: linkError.message }, { status: 500 })
  }

  // 4. Mint a session for the new admin
  const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({ email, password })

  if (signInError || !signInData.session) {
    // Account was created successfully — just couldn't auto-login. Let them log in manually.
    return Response.json({ success: true, session: null })
  }

  return Response.json({
    success: true,
    session: {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    },
  })
}
