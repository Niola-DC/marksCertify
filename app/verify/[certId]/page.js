// ============================================================
// MARKSCERTIFY — Public Verify Page
// File: /app/verify/[certId]/page.js
//
// This is what a human sees when they scan the QR code or
// visit the verify link. No login required.
//
// It calls your existing /api/verify/[certId]/route.js
// and renders the result visually.
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import BadgeActions from '../../components/BadgeActions'

export default function VerifyPage() {
  const params = useParams()
  const certId = params.certId

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    async function checkCertificate() {
      try {
        const res = await fetch(`/api/verify/${certId}`)
        const json = await res.json()
        setData(json)
      } catch (err) {
        setData({ valid: false, status: 'ERROR', message: 'Something went wrong checking this certificate.' })
      } finally {
        setLoading(false)
      }
    }

    if (certId) checkCertificate()
  }, [certId])

  // ── Loading state ──────────────────────────────────────
  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <p style={styles.loadingText}>Checking certificate…</p>
        </div>
      </main>
    )
  }

  // A fetch throwing (offline, DNS blip) or a 429 both land here with no
  // certificate data at all — rendering the normal card branch for these
  // would show a red banner over blank institution/earner/course fields
  // instead of telling the person what actually happened.
  const isUnresolved = data?.status === 'ERROR' || data?.status === 'RATE_LIMITED'

  // ── Status banner colour + label logic ─────────────────
  const isValid = data?.valid === true
  const statusColor = isUnresolved ? '#8A7A3A' : isValid ? '#2E7D32' : '#B23A3A'
  const statusLabel =
    data?.status === 'NOT_FOUND'    ? 'NOT FOUND' :
    data?.status === 'REVOKED'      ? 'REVOKED'   :
    data?.status === 'EXPIRED'      ? 'EXPIRED'   :
    data?.status === 'RATE_LIMITED' ? 'TRY AGAIN SHORTLY' :
    data?.status === 'ERROR'        ? 'COULD NOT CHECK' :
    isValid ? 'VALID' : 'INVALID'

  return (
    <main style={styles.page}>
      <div style={styles.card}>

        {/* ── Status Banner ───────────────────────────── */}
        <div style={{ ...styles.banner, background: statusColor }}>
          <span style={styles.bannerIcon}>{isUnresolved ? '!' : isValid ? '✓' : '✕'}</span>
          <span style={styles.bannerText}>{statusLabel}</span>
        </div>

        {/* ── Not found / error / rate-limited — short message only ── */}
        {data?.status === 'NOT_FOUND' ? (
          <div style={styles.body}>
            <p style={styles.notFoundText}>
              We could not find a certificate with ID <strong>{certId}</strong>.
              Please check the ID and try again.
            </p>
          </div>
        ) : isUnresolved ? (
          <div style={styles.body}>
            <p style={styles.notFoundText}>
              {data?.message || 'Something went wrong checking this certificate. Please check your connection and try again.'}
            </p>
          </div>
        ) : (
          <div style={styles.body}>

            {/* Institution */}
            {data?.institutionLogo && (
              <img src={data.institutionLogo} alt={data.institutionName} style={styles.logo} />
            )}
            <p style={styles.institutionName}>{data?.institutionName}</p>

            <div style={styles.divider} />

            {/* Earner name */}
            <p style={styles.label}>Issued to</p>
            <p style={styles.earnerName}>{data?.earnerName}</p>

            {/* Course title */}
            <p style={styles.label}>For completing</p>
            <p style={styles.courseTitle}>{data?.courseTitle}</p>

            {/* Dates */}
            <div style={styles.dateRow}>
              <div>
                <p style={styles.label}>Issued</p>
                <p style={styles.dateValue}>
                  {data?.issueDate && new Date(data.issueDate).toLocaleDateString('en-NG', {
                    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
                  })}
                </p>
              </div>
              {data?.expiryDate && (
                <div>
                  <p style={styles.label}>Expires</p>
                  <p style={styles.dateValue}>
                    {new Date(data.expiryDate).toLocaleDateString('en-NG', {
                      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
                    })}
                  </p>
                </div>
              )}
            </div>

            {/* Status message for revoked/expired */}
            {data?.message && !isValid && (
              <div style={styles.warningBox}>
                <p style={styles.warningText}>{data.message}</p>
              </div>
            )}

            <div style={styles.divider} />

            {/* Cert ID */}
            <p style={styles.label}>Certificate ID</p>
            <p style={styles.certId}>{data?.certId}</p>

            {isValid && (
              <>
                <div style={styles.divider} />
                <BadgeActions
                  cert={{
                    certId: data.certId,
                    courseTitle: data.courseTitle,
                    institutionName: data.institutionName,
                    institutionLogo: data.institutionLogo,
                    issueDate: data.issueDate,
                    verifyUrl: typeof window !== 'undefined' ? window.location.href : '',
                  }}
                  variant="full"
                />
              </>
            )}

          </div>
        )}

        {/* ── Footer ───────────────────────────────────── */}
        <div style={styles.footer}>
          <p style={styles.footerText}>
            Verified by <strong style={styles.footerBrand}>MarksCertify</strong>
          </p>
          <a href="/" style={styles.footerCta}>Issue your own certificates →</a>
        </div>

      </div>
    </main>
  )
}

// ── Inline styles (swap for Tailwind classes once you're using it in the project) ──
const styles = {
  page: {
    minHeight: '100vh',
    background: '#0D0D0D',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#161616',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid rgba(184,150,46,0.25)',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    padding: '60px 24px',
    fontSize: '14px',
  },
  banner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '20px',
  },
  bannerIcon: {
    fontSize: '22px',
    color: '#fff',
    fontWeight: 700,
  },
  bannerText: {
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '2px',
    color: '#fff',
  },
  body: {
    padding: '28px 24px',
    textAlign: 'center',
  },
  notFoundText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '14px',
    lineHeight: 1.6,
  },
  logo: {
    height: '32px',
    objectFit: 'contain',
    margin: '0 auto 8px',
  },
  institutionName: {
    color: '#B8962E',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    marginBottom: '20px',
  },
  divider: {
    height: '1px',
    background: 'rgba(184,150,46,0.15)',
    margin: '20px 0',
  },
  label: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: '10px',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  earnerName: {
    color: '#fff',
    fontSize: '22px',
    fontStyle: 'italic',
    marginBottom: '20px',
  },
  courseTitle: {
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    marginBottom: '20px',
  },
  dateRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '40px',
    marginBottom: '8px',
  },
  dateValue: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: '13px',
  },
  warningBox: {
    background: 'rgba(178,58,58,0.1)',
    border: '1px solid rgba(178,58,58,0.3)',
    borderRadius: '6px',
    padding: '12px',
    marginTop: '16px',
  },
  warningText: {
    color: '#E08A8A',
    fontSize: '12px',
  },
  certId: {
    color: 'rgba(184,150,46,0.9)',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '1px',
  },
  footer: {
    borderTop: '1px solid rgba(184,150,46,0.15)',
    padding: '16px 24px',
    textAlign: 'center',
  },
  footerText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: '11px',
    marginBottom: '6px',
  },
  footerBrand: {
    color: '#B8962E',
  },
  footerCta: {
    color: '#B8962E',
    fontSize: '12px',
    fontWeight: 600,
    textDecoration: 'none',
  },
}