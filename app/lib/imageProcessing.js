import sharp from 'sharp'

// Scanned/photographed signatures are dark ink on an opaque paper
// background. The certificate template inverts signature colors to white
// so they show up against the certificate's dark background — that only
// works if the "paper" is transparent. On an opaque upload there's no
// alpha channel to distinguish ink from paper, so the invert collapses
// the whole image into a single solid block with no visible signature.
//
// A single fixed brightness threshold only works for a clean, evenly-lit
// flatbed scan. Real submissions are often phone photos of paper: uneven
// lighting, shadows, paper grain, faint ruled lines — the "white" of the
// paper can vary well below any single global cutoff. So instead this
// estimates a LOCAL background per pixel (a heavily blurred copy of the
// image, which washes out thin ink strokes and ruled lines but preserves
// large-scale lighting/shading) and makes a pixel transparent based on how
// much darker it is than its own neighborhood, not a fixed brightness
// value. That degenerates to the simple case for a clean uniform scan and
// still works for uneven, shadowed, textured photos.
export async function removeWhiteBackground(buffer) {
  // Downscale first — a signature doesn't need phone-camera resolution,
  // and it keeps the blur pass fast regardless of the source photo size.
  const oriented = sharp(buffer).rotate() // apply EXIF orientation from phone photos
  const resized = oriented.clone().resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })

  const { data: gray, info: grayInfo } = await resized
    .clone()
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height } = grayInfo

  const blurRadius = Math.max(12, Math.round(Math.min(width, height) / 12))
  const { data: background } = await sharp(gray, { raw: { width, height, channels: 1 } })
    .blur(blurRadius)
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { data, info: rgbaInfo } = await resized.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const channels = rgbaInfo.channels

  const TRANSPARENT_BELOW = 12 // darker-than-local-background delta that's still "paper"
  const OPAQUE_ABOVE = 45      // delta at which we're confident it's ink

  for (let p = 0; p < width * height; p++) {
    const delta = background[p] - gray[p] // how much darker than its local neighborhood
    const idx = p * channels

    if (delta <= TRANSPARENT_BELOW) {
      data[idx + 3] = 0
    } else if (delta < OPAQUE_ABOVE) {
      const fade = (delta - TRANSPARENT_BELOW) / (OPAQUE_ABOVE - TRANSPARENT_BELOW)
      data[idx + 3] = Math.min(data[idx + 3], Math.round(255 * fade))
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer()
}
