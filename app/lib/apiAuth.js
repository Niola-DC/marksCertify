import { supabaseAdmin } from './supabaseAdmin'

// Resolves the Bearer token on a request to { user, institutionId }.
// Returns a Response on any auth failure — callers should check
// `if (result instanceof Response) return result` before using it.
export async function requireAdmin(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return Response.json({ error: 'Invalid session. Please log in again.' }, { status: 401 })
  }

  const { data: adminRecord, error: adminError } = await supabaseAdmin
    .from('admin_users')
    .select('institution_id, role')
    .eq('id', user.id)
    .single()

  if (adminError || !adminRecord) {
    return Response.json({ error: 'Admin profile not found.' }, { status: 403 })
  }

  return { user, institutionId: adminRecord.institution_id, role: adminRecord.role }
}
