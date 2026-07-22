// ============================================================
// MARKSCERTIFY — Institution Branding Upload API
// File: /app/api/institution/upload/route.js
//
// Handles both logo and signature image uploads. Each institution
// gets exactly one file per type (upsert overwrites on re-upload),
// so there's no cleanup needed when an admin replaces an image.
// ============================================================

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../lib/apiAuth'
import { removeWhiteBackground } from '../../../lib/imageProcessing'

const ALLOWED_TYPES = new Set(['logo', 'signature'])
const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

// SVG is deliberately excluded — it can carry embedded <script>, a stored-XSS
// vector if the file is ever opened directly rather than rendered in an <img>.
const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function POST(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return Response.json({ error: 'Expected multipart form data.' }, { status: 400 })
  }

  const type = formData.get('type')
  const file = formData.get('file')

  if (!ALLOWED_TYPES.has(type)) {
    return Response.json({ error: 'type must be "logo" or "signature".' }, { status: 400 })
  }
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

  let buffer = Buffer.from(await file.arrayBuffer())
  let outputExt = ext
  let outputContentType = file.type

  // Signatures get their white/light background stripped so they show up
  // correctly against the certificate's dark background. Logos are left
  // as uploaded — they may legitimately have a colored or white backdrop
  // as part of the institution's branding.
  if (type === 'signature') {
    try {
      buffer = await removeWhiteBackground(buffer)
      outputExt = 'png'
      outputContentType = 'image/png'
    } catch (err) {
      return Response.json({ error: 'Failed to process signature image.', detail: err.message }, { status: 500 })
    }
  }

  const storagePath = `branding/${institutionId}/${type}.${outputExt}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('certificates')
    .upload(storagePath, buffer, { contentType: outputContentType, upsert: true })

  if (uploadError) {
    return Response.json({ error: 'Upload failed.', detail: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('certificates').getPublicUrl(storagePath)
  // Cache-bust so the new image shows immediately even though the path is reused.
  const versionedUrl = `${publicUrl}?v=${Date.now()}`

  const column = type === 'logo' ? 'logo_url' : 'signature_url'
  const { error: updateError } = await supabaseAdmin
    .from('institutions')
    .update({ [column]: versionedUrl })
    .eq('id', institutionId)

  if (updateError) {
    return Response.json({ error: 'Failed to save image URL.', detail: updateError.message }, { status: 500 })
  }

  return Response.json({ success: true, url: versionedUrl })
}
