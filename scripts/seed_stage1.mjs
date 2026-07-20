// One-time Stage 1 bootstrap: creates a storage bucket, a test institution,
// and a test admin auth user so the /dashboard login + generate flow can be
// exercised end-to-end. Safe to re-run — skips anything that already exists.
//
// Usage: node scripts/seed_stage1.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const TEST_ADMIN_EMAIL = 'admin@markscertify.test'
const TEST_ADMIN_PASSWORD = 'MarksCertify2026!'

async function main() {
  // 1. Storage bucket
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.some((b) => b.name === 'certificates')) {
    const { error } = await supabase.storage.createBucket('certificates', { public: true })
    if (error) throw new Error(`Bucket creation failed: ${error.message}`)
    console.log('Created storage bucket: certificates')
  } else {
    console.log('Storage bucket already exists: certificates')
  }

  // 2. Test institution
  let { data: institution } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('name', 'MarksCertify Demo Institution')
    .maybeSingle()

  if (!institution) {
    const { data, error } = await supabase
      .from('institutions')
      .insert({ name: 'MarksCertify Demo Institution', plan_tier: 'starter' })
      .select('id, name')
      .single()
    if (error) throw new Error(`Institution creation failed: ${error.message}`)
    institution = data
    console.log('Created institution:', institution.name)
  } else {
    console.log('Institution already exists:', institution.name)
  }

  // 3. Test admin auth user
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  let authUser = existingUsers?.users?.find((u) => u.email === TEST_ADMIN_EMAIL)

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`Auth user creation failed: ${error.message}`)
    authUser = data.user
    console.log('Created auth user:', TEST_ADMIN_EMAIL)
  } else {
    console.log('Auth user already exists:', TEST_ADMIN_EMAIL)
  }

  // 4. Link admin_users
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', authUser.id)
    .maybeSingle()

  if (!adminRow) {
    const { error } = await supabase
      .from('admin_users')
      .insert({
        id: authUser.id,
        institution_id: institution.id,
        role: 'owner',
        email: TEST_ADMIN_EMAIL,
        full_name: 'MarksCertify Demo Admin',
      })
    if (error) throw new Error(`admin_users link failed: ${error.message}`)
    console.log('Linked admin_users row')
  } else {
    console.log('admin_users row already linked')
  }

  console.log('\nDone. Log in at /dashboard with:')
  console.log('  email:   ', TEST_ADMIN_EMAIL)
  console.log('  password:', TEST_ADMIN_PASSWORD)
}

main().catch((err) => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
