// ============================================================
// MARKSCERTIFY — Admin Avatar Upload API
// File: /app/api/account/avatar/route.js
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../lib/apiAuth'

const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function POST(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return Response.json({ error: 'Expected multipart form data.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'file is required.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json({ error: 'Image must be under 2MB.' }, { status: 400 })
  }

  const ext = MIME_EXTENSIONS[file.type]
  if (!ext) {
    return Response.json({ error: 'Supported formats: PNG, JPEG, WEBP.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const storagePath = `avatars/${auth.user.id}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('certificates')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    return Response.json({ error: 'Upload failed.', detail: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('certificates').getPublicUrl(storagePath)
  const versionedUrl = `${publicUrl}?v=${Date.now()}`

  const { error: updateError } = await supabaseAdmin
    .from('admin_users')
    .update({ avatar_url: versionedUrl })
    .eq('id', auth.user.id)

  if (updateError) {
    return Response.json({ error: 'Failed to save avatar.', detail: updateError.message }, { status: 500 })
  }

  return Response.json({ success: true, url: versionedUrl })
}

export async function DELETE(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth

  const { error } = await supabaseAdmin
    .from('admin_users')
    .update({ avatar_url: null })
    .eq('id', auth.user.id)

  if (error) {
    return Response.json({ error: 'Failed to remove avatar.', detail: error.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
