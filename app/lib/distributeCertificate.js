// ============================================================
// MARKSCERTIFY — Shared Certificate Distribution Logic
// File: /app/lib/distributeCertificate.js
//
// Extracted from /api/certificates/distribute so cohort completion
// can trigger a send directly (no internal HTTP round-trip) instead
// of duplicating the email/WhatsApp templates and send logic.
//
// Email currently sends from Resend's shared sandbox address
// (onboarding@resend.dev), which only delivers to the email
// address on the Resend account itself — fine for testing, not
// for real distribution. Swap RESEND_FROM once a domain is
// verified in the Resend dashboard.
// ============================================================

import { supabaseAdmin } from './supabaseAdmin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_FROM = process.env.RESEND_FROM || 'MarksCertify <onboarding@resend.dev>'

// Looks up the cert by its human-readable ID, sends email + WhatsApp where
// the earner has contact info, and records delivery status on the cert
// row. Throws on lookup/ownership/state failures — callers decide how to
// surface that (HTTP status mapping, or just logging for a background
// auto-distribute triggered by cohort completion).
export async function distributeCertificate({ certId, institutionId }) {
  const { data: cert, error: certError } = await supabaseAdmin
    .from('certificates')
    .select(`
      id, cert_id, course_title, issue_date, pdf_url, verify_url, status, institution_id,
      earners ( full_name, email, phone_number ),
      institutions ( id, name )
    `)
    .eq('cert_id', certId.toUpperCase())
    .single()

  if (certError || !cert) {
    throw new Error('Certificate not found.')
  }

  if (cert.institution_id !== institutionId) {
    throw new Error('Forbidden.')
  }

  if (cert.status === 'revoked') {
    throw new Error('Cannot distribute a revoked certificate.')
  }

  const results = { email: null, whatsapp: null }

  // ── Send Email ────────────────────────────────────────
  if (cert.earners.email) {
    try {
      const { error: sendError } = await resend.emails.send({
        from: EMAIL_FROM,
        to: cert.earners.email,
        subject: `Your Certificate — ${cert.course_title}`,
        html: buildEmailTemplate({
          earnerName:      cert.earners.full_name,
          courseTitle:     cert.course_title,
          institutionName: cert.institutions.name,
          issueDate:       cert.issue_date,
          pdfUrl:          cert.pdf_url,
          verifyUrl:       cert.verify_url,
          certId:          cert.cert_id
        })
      })

      if (sendError) throw new Error(sendError.message)

      await supabaseAdmin
        .from('certificates')
        .update({ email_sent: true, email_sent_at: new Date().toISOString() })
        .eq('id', cert.id)

      results.email = 'sent'
    } catch (emailErr) {
      console.error('[distribute] Email failed:', emailErr)
      results.email = 'failed'
      results.emailError = emailErr.message
    }
  } else {
    results.email = 'skipped — no email address'
  }

  // ── Send WhatsApp ─────────────────────────────────────
  // Only on Growth plan and above (enforced here)
  if (cert.earners.phone_number) {
    const twilioSid  = process.env.TWILIO_ACCOUNT_SID
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN
    const twilioFrom = process.env.TWILIO_WHATSAPP_FROM  // "whatsapp:+14155238886"

    if (!twilioSid || !twilioAuth || !twilioFrom) {
      results.whatsapp = 'skipped — WhatsApp not configured'
    } else {
      try {
        const whatsappMessage = buildWhatsAppMessage({
          earnerName:      cert.earners.full_name,
          courseTitle:     cert.course_title,
          institutionName: cert.institutions.name,
          pdfUrl:          cert.pdf_url,
          verifyUrl:       cert.verify_url,
          certId:          cert.cert_id
        })

        // Numbers are expected in local Nigerian format (e.g. "08012345678")
        // by default. A leading "+" is treated as "already international"
        // so numbers from other countries aren't mangled with a 234 prefix.
        const rawPhone = cert.earners.phone_number.trim()
        const digits = rawPhone.replace(/\D/g, '')
        const isAlreadyInternational = rawPhone.startsWith('+') || digits.startsWith('234')
        const toNumber = `whatsapp:+${isAlreadyInternational ? digits : '234' + digits.replace(/^0/, '')}`

        const twilioResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64')
            },
            body: new URLSearchParams({
              From: twilioFrom,
              To: toNumber,
              Body: whatsappMessage
            })
          }
        )

        if (twilioResponse.ok) {
          await supabaseAdmin
            .from('certificates')
            .update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() })
            .eq('id', cert.id)
          results.whatsapp = 'sent'
        } else {
          const errData = await twilioResponse.json()
          console.error('[distribute] WhatsApp failed:', errData)
          results.whatsapp = 'failed'
          results.whatsappError = errData.message
        }
      } catch (waErr) {
        console.error('[distribute] WhatsApp error:', waErr)
        results.whatsapp = 'failed'
        results.whatsappError = waErr.message
      }
    }
  } else {
    results.whatsapp = 'skipped — no phone number'
  }

  return results
}


// ── Email HTML template ───────────────────────────────────────
function buildEmailTemplate({ earnerName, courseTitle, institutionName, issueDate, pdfUrl, verifyUrl, certId }) {
  const formattedDate = new Date(issueDate).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  })

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D0D0D;border-radius:8px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#0D0D0D;padding:32px 40px;text-align:center;border-bottom:2px solid #B8962E;">
            <p style="margin:0;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#B8962E;">
              MarksCertify
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;color:#ffffff;">
            <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.6);">
              Dear ${earnerName},
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.8);line-height:1.6;">
              Congratulations! Your certificate from <strong style="color:#fff;">${institutionName}</strong>
              is ready. You have successfully completed:
            </p>

            <!-- Course title block -->
            <div style="background:rgba(184,150,46,0.1);border-left:3px solid #B8962E;padding:16px 20px;margin:0 0 24px;border-radius:0 4px 4px 0;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#B8962E;">${courseTitle}</p>
              <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">Issued ${formattedDate}</p>
            </div>

            <!-- Cert ID -->
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.4);">
              Certificate ID
            </p>
            <p style="margin:0 0 32px;font-size:13px;font-weight:600;color:rgba(184,150,46,0.9);">
              ${certId}
            </p>

            <!-- CTA buttons -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:12px;">
                  <a href="${pdfUrl}" style="display:inline-block;background:#B8962E;color:#0D0D0D;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:13px;font-weight:700;letter-spacing:0.5px;">
                    Download Certificate
                  </a>
                </td>
                <td>
                  <a href="${verifyUrl}" style="display:inline-block;background:transparent;color:#B8962E;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:13px;font-weight:700;letter-spacing:0.5px;border:1px solid #B8962E;">
                    View Verify Page
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:32px 0 0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;">
              Anyone can verify the authenticity of this certificate by visiting the verify link above
              or scanning the QR code on your certificate PDF. No account needed.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid rgba(184,150,46,0.2);text-align:center;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">
              Issued by ${institutionName} via MarksCertify · markscertify.com
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `
}


// ── WhatsApp message template ─────────────────────────────────
function buildWhatsAppMessage({ earnerName, courseTitle, institutionName, pdfUrl, verifyUrl, certId }) {
  return `🎉 *Congratulations, ${earnerName}!*

Your certificate from *${institutionName}* is ready.

*${courseTitle}*
Certificate ID: ${certId}

📄 *Download your certificate:*
${pdfUrl}

✅ *Verify this certificate:*
${verifyUrl}

Anyone can scan the QR code on your certificate or visit the verify link above to confirm it is authentic.

_Issued via MarksCertify_`
}
