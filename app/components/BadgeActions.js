// ============================================================
// MARKSCERTIFY — Badge Share Actions
// File: /app/components/BadgeActions.js
//
// Shared between the verify page (full treatment, inline on the
// earner-details card) and the portal search results (compact —
// just the LinkedIn button, since "Copy link" already exists there
// and points at the same verify URL the badge now lives on).
// ============================================================

'use client'

import { useState } from 'react'

// The email-signature snippet is copied as raw HTML into whatever the
// earner pastes it into (an email client, their own site) — unlike JSX
// text content, which React escapes automatically, this string bypasses
// that entirely. courseTitle/institution fields are admin-set at
// certificate creation, so an unescaped course title becomes an HTML/
// script-injection vector into content the earner controls and shares.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildLinkedInUrl({ courseTitle, institutionName, issueDate, verifyUrl, certId }) {
  const d = new Date(issueDate)
  // Guards against a malformed/missing issueDate producing a broken
  // "issueYear=NaN" LinkedIn link instead of a merely incomplete one.
  const hasValidDate = !isNaN(d.getTime())
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: courseTitle,
    organizationName: institutionName,
    ...(hasValidDate && {
      issueYear: String(d.getUTCFullYear()),
      issueMonth: String(d.getUTCMonth() + 1),
    }),
    certUrl: verifyUrl,
    certId,
  })
  return `https://www.linkedin.com/profile/add?${params.toString()}`
}

function buildEmailSignatureSnippet({ verifyUrl, badgeImageUrl, courseTitle }) {
  const safeCourseTitle = escapeHtml(courseTitle)
  const safeVerifyUrl = escapeHtml(verifyUrl)
  const img = badgeImageUrl
    ? `<img src="${escapeHtml(badgeImageUrl)}" alt="${safeCourseTitle} badge" width="48" height="48" style="vertical-align:middle;border-radius:6px;object-fit:contain;background:#0D0D0D;padding:4px;" />`
    : ''
  return `<a href="${safeVerifyUrl}" style="text-decoration:none;display:inline-flex;align-items:center;gap:8px;font-family:Arial,sans-serif;">${img}<span style="font-size:12px;color:#B8962E;font-weight:600;">Verified: ${safeCourseTitle}</span></a>`
}

async function copyToClipboard(text, onDone) {
  try {
    await navigator.clipboard.writeText(text)
    onDone()
  } catch {
    // clipboard API unavailable — silently no-op, nothing else to fall back to
  }
}

export default function BadgeActions({ cert, variant = 'full' }) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedSnippet, setCopiedSnippet] = useState(false)

  const linkedInUrl = buildLinkedInUrl(cert)

  if (variant === 'compact') {
    return (
      <a
        href={linkedInUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="py-3 text-center text-xs font-medium text-[#B8962E] hover:bg-white/5"
      >
        Add to LinkedIn
      </a>
    )
  }

  return (
    <div className="w-full">
      <p className="mb-2 text-[10px] uppercase tracking-[1.5px] text-white/35">Digital Badge</p>
      <div className="flex flex-col gap-2">
        <a
          href={linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-[#0A66C2] px-3 py-2 text-center text-xs font-semibold text-white hover:opacity-90"
        >
          Add to LinkedIn Profile
        </a>
        <div className="flex gap-2">
          <button
            onClick={() => copyToClipboard(cert.verifyUrl, () => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000) })}
            className="flex-1 rounded-md border border-[#B8962E]/30 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/5"
          >
            {copiedLink ? 'Copied!' : 'Copy Badge Link'}
          </button>
          <button
            onClick={() => copyToClipboard(
              buildEmailSignatureSnippet({ verifyUrl: cert.verifyUrl, badgeImageUrl: cert.institutionLogo, courseTitle: cert.courseTitle }),
              () => { setCopiedSnippet(true); setTimeout(() => setCopiedSnippet(false), 2000) }
            )}
            className="flex-1 rounded-md border border-[#B8962E]/30 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/5"
          >
            {copiedSnippet ? 'Copied!' : 'Email Signature'}
          </button>
        </div>
      </div>
    </div>
  )
}
