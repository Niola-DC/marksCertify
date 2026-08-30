// ============================================================
// MARKSCERTIFY — Template Builder & Custom Design Shared Options
// File: /app/lib/templateOptions.js
//
// Single source of truth for the certificate customization schema —
// covering both the built-in Template Builder (colors/font/border) and
// the Custom Design upload add-on (positioned fields over an uploaded
// background). Imported by the API routes (validation), by
// certificateGenerator.js (rendering), and by the dashboard UI (controls
// + preview). Plain ESM constants only — safe to import from client or
// server code.
//
// This is also the shape the future AI Design Studio (Stage 4) will
// generate from a prompt instead of from manual picker input, so it
// writes into the same template_config column through the same
// validation this file backs.
// ============================================================

// 'classic' matches today's hardcoded certificate.html look exactly — a
// double border with 4 corner ornaments — and needs no CSS override block.
export const BASE_STYLES = ['classic', 'modern-minimal', 'ornate', 'bold-frame', 'clean-line']

// fontFile paths are relative to node_modules/, resolved in
// certificateGenerator.js's loadFontBase64(). 'georgia' has none — it's
// the system serif already used today, no @font-face needed.
// Weight 400 (not 700): the only two rules {{FONT_HEADING}} drives in
// certificate.html — .earner-name and .signature-text — are both
// font-weight: normal, font-style: italic in the existing template.
export const FONT_OPTIONS = [
  {
    key: 'georgia',
    label: 'Georgia (Classic Serif)',
    cssFamily: "'Georgia', 'Times New Roman', serif",
  },
  {
    key: 'playfair',
    label: 'Playfair Display',
    cssFamily: "'Playfair Display', serif",
    fontFile: '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff2',
  },
  {
    key: 'merriweather',
    label: 'Merriweather',
    cssFamily: "'Merriweather', serif",
    fontFile: '@fontsource/merriweather/files/merriweather-latin-400-normal.woff2',
  },
  {
    key: 'montserrat',
    label: 'Montserrat',
    cssFamily: "'Montserrat', sans-serif",
    fontFile: '@fontsource/montserrat/files/montserrat-latin-400-normal.woff2',
  },
  {
    key: 'poppins',
    label: 'Poppins',
    cssFamily: "'Poppins', sans-serif",
    fontFile: '@fontsource/poppins/files/poppins-latin-400-normal.woff2',
  },
  {
    key: 'greatvibes',
    label: 'Great Vibes (Script)',
    cssFamily: "'Great Vibes', cursive",
    fontFile: '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff2',
  },
]

export const DEFAULT_TEMPLATE_CONFIG = {
  baseStyle: 'classic',
  primaryColor: '#B8962E',
  secondaryColor: '#0D0D0D',
  fontFamily: 'georgia',
}

export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

// ── Custom Design upload (paid add-on — PRD §6.2 "Custom-branded templates") ──
// An institution uploads their own certificate background image and
// positions these fields on top of it, instead of using the built-in
// template. Field positions are stored keyed by these names rather than as
// an array, since the set of fields is fixed — "is EARNER_NAME positioned?"
// is then a plain key check against custom_design_fields.
export const CUSTOM_DESIGN_FIELD_KEYS = [
  'EARNER_NAME',
  'COURSE_TITLE',
  'ISSUE_DATE',
  'EXPIRY_DATE',
  'SIGNATORY_NAME',
  'SIGNATORY_TITLE',
  'CERT_ID',
  'QR_CODE',
]

// A certificate without a visible earner name, course, or verification QR
// isn't a usable certificate — these must be positioned before an
// institution can activate their custom design.
export const REQUIRED_CUSTOM_DESIGN_FIELDS = ['EARNER_NAME', 'COURSE_TITLE', 'QR_CODE']

export const TEXT_ALIGN_OPTIONS = ['left', 'center', 'right']

// A4 landscape, matching the 297mm x 210mm canvas certificates already
// render at. Uploaded designs are checked against this ratio (not against
// exact pixel dimensions) so any sufficiently high-resolution export works.
export const CUSTOM_DESIGN_ASPECT_RATIO = 297 / 210
export const CUSTOM_DESIGN_ASPECT_TOLERANCE = 0.08 // ±8%, absorbs typical export rounding

function inRange(n, min, max) {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
}

function isValidTextFieldEntry(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    inRange(entry.xPercent, 0, 100) &&
    inRange(entry.yPercent, 0, 100) &&
    inRange(entry.widthPercent, 5, 100) &&
    inRange(entry.fontSize, 4, 72) &&
    typeof entry.color === 'string' &&
    HEX_COLOR_RE.test(entry.color) &&
    FONT_OPTIONS.some((f) => f.key === entry.fontFamily) &&
    TEXT_ALIGN_OPTIONS.includes(entry.align)
  )
}

function isValidQrFieldEntry(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    inRange(entry.xPercent, 0, 100) &&
    inRange(entry.yPercent, 0, 100) &&
    inRange(entry.sizePercent, 2, 50)
  )
}

// institution.custom_design_fields comes straight from the database — either
// what an admin saved through the validated PATCH route, or (in the render
// path) read back out for use. It isn't trusted here either way: every field
// value gets interpolated directly into an unescaped Puppeteer HTML `style`
// attribute (see buildCustomDesignHtml in certificateGenerator.js), so this
// allowlist check is the actual injection defense — a string like
// "50; } </style><script>..." for xPercent fails inRange()'s typeof/Number
// check and the whole entry is dropped, never coerced into a number and
// used. Returns which keys were dropped so callers can decide how to react
// (a strict 400 in the PATCH route vs. a silent drop as a render-time
// backstop in certificateGenerator.js).
export function sanitizeCustomDesignFields(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const fields = {}
  const invalidKeys = []

  for (const key of Object.keys(input)) {
    if (!CUSTOM_DESIGN_FIELD_KEYS.includes(key)) {
      invalidKeys.push(key)
      continue
    }

    const entry = input[key]

    if (key === 'QR_CODE') {
      if (!isValidQrFieldEntry(entry)) {
        invalidKeys.push(key)
        continue
      }
      fields[key] = {
        xPercent: entry.xPercent,
        yPercent: entry.yPercent,
        sizePercent: entry.sizePercent,
      }
    } else {
      if (!isValidTextFieldEntry(entry)) {
        invalidKeys.push(key)
        continue
      }
      fields[key] = {
        xPercent: entry.xPercent,
        yPercent: entry.yPercent,
        widthPercent: entry.widthPercent,
        fontSize: entry.fontSize,
        color: entry.color,
        fontFamily: entry.fontFamily,
        align: entry.align,
      }
    }
  }

  return { fields, invalidKeys }
}
