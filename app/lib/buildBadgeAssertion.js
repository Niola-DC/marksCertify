// ============================================================
// MARKSCERTIFY — Open Badges 3.0 Assertion Builder
// File: /app/lib/buildBadgeAssertion.js
//
// Builds a hosted (unsigned) OB3 / W3C Verifiable Credential JSON-LD
// document for a certificate. "Hosted" means the credential is trusted
// because it's served from a URL the issuer controls — the same trust
// model the verify page already uses — rather than a cryptographically
// signed proof (DIDs, key management). LinkedIn's own "Add to Profile"
// flow doesn't check signatures either, so this is enough for the
// share/portability use case; a signed proof can be layered on later
// without changing this shape.
//
// No badge record is persisted — this is built fresh from the same
// certificate/earner/institution data the verify page already reads,
// so it can never drift from the certificate's current state (a
// revoked cert stops having a valid badge immediately, no cleanup job
// needed).
// ============================================================

export function buildBadgeAssertion({ cert, earner, institution, institutionId, appUrl }) {
  const badgeUrl = `${appUrl}/api/badges/${cert.cert_id}`
  const verifyUrl = `${appUrl}/verify/${cert.cert_id}`

  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://purl.imsglobal.org/spec/ob/v3p0/context.json',
    ],
    id: badgeUrl,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      id: `${appUrl}/institutions/${institutionId}`,
      type: ['Profile'],
      name: institution.name,
      ...(institution.logo_url && { image: institution.logo_url }),
    },
    validFrom: new Date(cert.issue_date).toISOString(),
    ...(cert.expiry_date && { validUntil: new Date(cert.expiry_date).toISOString() }),
    credentialSubject: {
      type: ['AchievementSubject'],
      name: earner.full_name,
      achievement: {
        type: ['Achievement'],
        name: cert.course_title,
        description: `Awarded by ${institution.name} for completing ${cert.course_title}.`,
        criteria: {
          narrative: `Issued by ${institution.name} upon successful completion of ${cert.course_title}.`,
        },
        ...(institution.logo_url && {
          image: { id: institution.logo_url, type: 'Image' },
        }),
      },
    },
    // Not a formal OB3 credentialStatus registry — just a plain signal a
    // verifier reading the JSON can check without following a status list.
    verification: {
      certificateId: cert.cert_id,
      verifyUrl,
      status: cert.status,
    },
  }
}
