// ============================================================
// MARKSCERTIFY — Custom Design Upload API (paid add-on)
// File: /app/api/institution/custom-design/upload/route.js
//
// Uploads the background image an institution designed themselves
// (Canva, Photoshop, Illustrator, wherever — exported as PNG/JPG) to be
// used as their certificate's background instead of MarksCertify's
// built-in template. See app/lib/certificateGenerator.js's
// buildCustomDesignHtml() for how this gets rendered.
// ============================================================

import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../../lib/apiAuth'
import { CUSTOM_DESIGN_ASPECT_RATIO, CUSTOM_DESIGN_ASPECT_TOLERANCE } from '../../../../lib/templateOptions'
import sharp from 'sharp'

// Print-quality background image, not a small branding icon — a higher
// ceiling than the 2MB logo/signature upload route.
const MAX_SIZE_BYTES = 8 * 1024 * 1024

// PNG/JPEG only for v1 — no PDF (no rasterisation library in the stack;
// exporting PNG/JPG from any design tool is standard), no WebP/SVG (kept
// deliberately narrow to match the branding upload route's reasoning: SVG
// can carry embedded <script>, a stored-XSS vector if ever opened directly
// rather than rendered in an <img>/CSS background).
const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

export async function POST(request) {
  const auth = await requireAdmin(request)
  if (auth instanceof Response) return auth
  const { institutionId } = auth

  const { data: institution, error: instError } = await supabaseAdmin
    .from('institutions')
    .select('addons')
    .eq('id', institutionId)
    .single()

  if (instError || !institution) {
    return Response.json({ error: 'Institution not found.' }, { status: 404 })
  }
  if (!institution.addons?.customDesign) {
    return Response.json({ error: 'Custom Design is a paid add-on. Contact us to unlock it.' }, { status: 403 })
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return Response.json({ error: 'Expected multipart form data.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'file is required.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json({ error: 'Image must be under 8MB.' }, { status: 400 })
  }

  const ext = MIME_EXTENSIONS[file.type]
  if (!ext) {
    return Response.json({ error: 'Supported formats: PNG, JPEG.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Reject an aspect ratio too far from A4 landscape rather than resize/crop
  // it — cropping would silently cut off part of the institution's design
  // without them choosing where, and a badly-mismatched ratio (e.g. a
  // square Instagram export) means they exported the wrong thing.
  let metadata
  try {
    metadata = await sharp(buffer).metadata()
  } catch (err) {
    return Response.json({ error: 'Could not read image file.', detail: err.message }, { status: 400 })
  }

  if (!metadata.width || !metadata.height) {
    return Response.json({ error: 'Could not read image dimensions.' }, { status: 400 })
  }

  const ratio = metadata.width / metadata.height
  const deviation = Math.abs(ratio - CUSTOM_DESIGN_ASPECT_RATIO) / CUSTOM_DESIGN_ASPECT_RATIO
  if (deviation > CUSTOM_DESIGN_ASPECT_TOLERANCE) {
    return Response.json(
      {
        error: 'Image shape doesn\'t match a certificate (A4 landscape). Export your design at roughly 297x210mm proportions and try again.',
        detail: `Uploaded image is ${metadata.width}x${metadata.height}px (ratio ${ratio.toFixed(2)}), expected close to ${CUSTOM_DESIGN_ASPECT_RATIO.toFixed(2)}.`,
      },
      { status: 400 }
    )
  }

  const storagePath = `custom-designs/${institutionId}/design.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('certificates')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    return Response.json({ error: 'Upload failed.', detail: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('certificates').getPublicUrl(storagePath)
  const versionedUrl = `${publicUrl}?v=${Date.now()}`

  // A fresh upload invalidates any previously-tuned field positions (they
  // were placed against the old image's specific layout/whitespace) — force
  // back to draft so a stale design can't stay live on real certificates
  // until the admin re-checks/re-activates it.
  const { error: updateError } = await supabaseAdmin
    .from('institutions')
    .update({ custom_design_url: versionedUrl, custom_design_enabled: false })
    .eq('id', institutionId)

  if (updateError) {
    return Response.json({ error: 'Failed to save design URL.', detail: updateError.message }, { status: 500 })
  }

  return Response.json({ success: true, url: versionedUrl })
}
