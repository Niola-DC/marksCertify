// ============================================================
// MARKSCERTIFY — Certificate Live Preview
// File: /app/dashboard/templates/CertificatePreview.js
//
// Client-side React "twin" of templates/certificate.html — renders
// instantly on every template_config change (no Puppeteer round-trip),
// trivially satisfying the "preview within 3 seconds" requirement.
// Colors/border are hand-mirrored CSS (accepted drift risk vs. the real
// PDF template). Fonts are exact: this imports the same @fontsource CSS
// files certificateGenerator.js embeds server-side, so the preview and
// the generated PDF render the literal same font file.
// ============================================================

'use client'

import '@fontsource/playfair-display/400.css'
import '@fontsource/merriweather/400.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/poppins/400.css'
import '@fontsource/great-vibes/400.css'

import { FONT_OPTIONS, DEFAULT_TEMPLATE_CONFIG } from '../../lib/templateOptions'
import styles from './CertificatePreview.module.css'

// Same abbreviation logic as certificateGenerator.js's
// getSignatureFallbackText — "Palmer Wayne" becomes "P. Wayne".
function signatoryFallback(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  const first = parts[0]
  const last = parts[parts.length - 1]
  return `${first[0].toUpperCase()}. ${last}`
}

export default function CertificatePreview({
  templateConfig,
  institutionName = 'Your Institution',
  logoUrl,
  signatureUrl,
  signatoryName = 'Signatory Name',
  signatoryTitle = 'Title',
}) {
  const { baseStyle, primaryColor, secondaryColor, fontFamily } = templateConfig
  const fontOption =
    FONT_OPTIONS.find((f) => f.key === fontFamily) ||
    FONT_OPTIONS.find((f) => f.key === DEFAULT_TEMPLATE_CONFIG.fontFamily)
  const fontCssFamily = fontOption.cssFamily

  return (
    <div
      className={styles.wrap}
      data-style={baseStyle}
      style={{
        '--primary-color': primaryColor,
        '--secondary-color': secondaryColor,
        '--font-heading': fontCssFamily,
      }}
    >
      <div className={styles.outerBorder} />
      <div className={styles.innerBorder} />
      <div className={`${styles.corner} ${styles.cornerTl}`} />
      <div className={`${styles.corner} ${styles.cornerTr}`} />
      <div className={`${styles.corner} ${styles.cornerBl}`} />
      <div className={`${styles.corner} ${styles.cornerBr}`} />

      <div className={styles.content}>
        <div className={styles.header}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img className={styles.logo} src={logoUrl} alt={institutionName} />}
          <div className={styles.institutionName}>{institutionName}</div>
        </div>

        <div className={styles.divider} />

        <div className={styles.certLabel}>Certificate of Completion</div>
        <div className={styles.presents}>This is to certify that</div>

        <div className={styles.earnerName}>Jane Doe</div>
        <div className={styles.nameUnderline} />

        <div className={styles.completedText}>has successfully completed</div>
        <div className={styles.courseTitle}>Sample Course Title</div>
        <div className={styles.issueDate}>Issued on 1 January 2026</div>

        <div className={styles.footer}>
          <div className={styles.signatureBlock}>
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.signatureImg} src={signatureUrl} alt="Signature" />
            ) : (
              <div className={styles.signatureText}>{signatoryFallback(signatoryName)}</div>
            )}
            <div className={styles.signatureLine} />
            <div className={styles.signatoryName}>{signatoryName}</div>
            <div className={styles.signatoryTitle}>{signatoryTitle}</div>
          </div>

          <div className={styles.certMeta}>
            <div className={styles.certIdLabel}>Certificate ID</div>
            <div className={styles.certIdValue}>MC-2026-NG-00001</div>
          </div>

          <div className={styles.qrBlock} />
        </div>
      </div>
    </div>
  )
}
