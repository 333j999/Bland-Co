const ADMIN_EMAIL = 'bland.jewellers@gmail.com';
const FROM        = process.env.RESEND_FROM || 'Bland & Co <noreply@blandco.com>';
const API_KEY     = process.env.RESEND_API_KEY;

async function sendEmail({ to, subject, html }) {
  if (!API_KEY) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return res.json();
}

function row(label, value) {
  if (!value) return '';
  return `<tr><td style="padding:6px 0;color:#888;font-size:13px;vertical-align:top;width:140px;">${label}</td><td style="padding:6px 0;font-size:13px;color:#1a1a1a;">${value}</td></tr>`;
}

function baseTemplate(title, bodyHtml) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:40px auto;background:#fff;border:1px solid #e0e0e0;">
  <div style="background:#0c3a2d;padding:28px 32px;">
    <p style="margin:0;color:#e8dfc8;font-size:11px;letter-spacing:.2em;text-transform:uppercase;">Bland &amp; Co Jewellers</p>
    <h1 style="margin:8px 0 0;color:#e8dfc8;font-size:22px;font-weight:300;">${title}</h1>
  </div>
  <div style="padding:32px;">${bodyHtml}</div>
  <div style="padding:20px 32px;border-top:1px solid #eee;background:#fafafa;">
    <p style="margin:0;font-size:11px;color:#aaa;">Bland &amp; Co Jewellers &mdash; Hatton Garden, London</p>
  </div>
</div></body></html>`;
}

// ── Enquiry ──────────────────────────────────────────────────────────────────

function enquiryAdminHtml(d) {
  return baseTemplate('New Enquiry', `
    <p style="margin:0 0 20px;font-size:14px;color:#444;">A new contact form submission has been received.</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row('Name', d.name)}${row('Email', d.email)}${row('Phone', d.phone)}${row('Subject', d.subject)}${row('Message', d.message)}${row('Submitted', new Date(d.createdAt).toLocaleString('en-GB',{timeZone:'Europe/London'}))}
    </table>`);
}

function enquiryConfirmHtml(d) {
  return baseTemplate('We\'ve received your message', `
    <p style="margin:0 0 16px;font-size:14px;color:#444;">Thank you, ${d.name.split(' ')[0]}. We've received your enquiry and will get back to you within 24 hours.</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row('Subject', d.subject)}${row('Your message', d.message)}
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:#888;">If you need to reach us urgently, you can reply to this email or call us directly.</p>`);
}

// ── Valuation ────────────────────────────────────────────────────────────────

function valuationAdminHtml(d) {
  return baseTemplate('New Valuation Request', `
    <p style="margin:0 0 20px;font-size:14px;color:#444;">A new sell/valuation request has been submitted.</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row('Name', d.fullName)}${row('Email', d.email)}${row('Phone', d.phone)}${row('Item Type', d.itemType)}${row('Brand', d.brand)}${row('Model', d.model)}${row('Year', d.year)}${row('Condition', d.condition)}${row('Accessories', d.accessories)}${row('Description', d.description)}${row('Submitted', new Date(d.createdAt).toLocaleString('en-GB',{timeZone:'Europe/London'}))}
    </table>`);
}

function valuationConfirmHtml(d) {
  return baseTemplate('Valuation request received', `
    <p style="margin:0 0 16px;font-size:14px;color:#444;">Thank you, ${(d.fullName||'').split(' ')[0]}. We've received your valuation request and will be in touch within 24 hours with an initial assessment.</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row('Item', [d.brand, d.model].filter(Boolean).join(' ') || d.itemType)}${row('Condition', d.condition)}
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:#888;">We may contact you to arrange a viewing or request additional photos.</p>`);
}

// ── Consultation ─────────────────────────────────────────────────────────────

const PURPOSE_LABEL = { buying: 'Buying', selling: 'Selling', valuation: 'Valuation', general: 'General Enquiry' };

function consultationAdminHtml(d) {
  return baseTemplate('New Consultation Booking', `
    <p style="margin:0 0 20px;font-size:14px;color:#444;">A new consultation has been booked.</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row('Name', d.name)}${row('Email', d.email)}${row('Phone', d.phone)}${row('Purpose', PURPOSE_LABEL[d.purpose] || d.purpose)}${row('Preferred Date', d.preferredDate)}${row('Preferred Time', d.preferredTime)}${row('Notes', d.message)}${row('Submitted', new Date(d.createdAt).toLocaleString('en-GB',{timeZone:'Europe/London'}))}
    </table>`);
}

function consultationConfirmHtml(d) {
  return baseTemplate('Consultation request received', `
    <p style="margin:0 0 16px;font-size:14px;color:#444;">Thank you, ${d.name.split(' ')[0]}. Your consultation request has been received. We'll confirm your appointment shortly.</p>
    <table style="width:100%;border-collapse:collapse;">
      ${row('Purpose', PURPOSE_LABEL[d.purpose] || d.purpose)}${row('Requested date', d.preferredDate)}${row('Requested time', d.preferredTime)}
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:#888;">Our team will be in touch within 24 hours to confirm availability.</p>`);
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

async function sendSubmissionEmails(resource, item) {
  if (resource === 'enquiries') {
    await Promise.all([
      sendEmail({ to: ADMIN_EMAIL, subject: `New enquiry — ${item.name}`, html: enquiryAdminHtml(item) }),
      item.email && sendEmail({ to: item.email, subject: 'We\'ve received your message — Bland & Co', html: enquiryConfirmHtml(item) }),
    ]);
  } else if (resource === 'valuations') {
    await Promise.all([
      sendEmail({ to: ADMIN_EMAIL, subject: `New valuation request — ${item.fullName}`, html: valuationAdminHtml(item) }),
      item.email && sendEmail({ to: item.email, subject: 'Valuation request received — Bland & Co', html: valuationConfirmHtml(item) }),
    ]);
  } else if (resource === 'consultations') {
    await Promise.all([
      sendEmail({ to: ADMIN_EMAIL, subject: `New consultation — ${item.name} (${item.preferredDate})`, html: consultationAdminHtml(item) }),
      item.email && sendEmail({ to: item.email, subject: 'Consultation request received — Bland & Co', html: consultationConfirmHtml(item) }),
    ]);
  }
}

module.exports = { sendSubmissionEmails };
