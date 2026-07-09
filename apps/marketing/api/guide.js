// Vercel Serverless Function (Node runtime) — email capture for the
// "Own Your Club" guide. The rest of haptera.pleco.dev is a static Astro build;
// only this route is dynamic. Vercel auto-detects the /api directory and
// deploys this file as a function independently of the Astro build.
//
// It does two things with Resend (no database — the lead lives in Koda's inbox):
//   1. emails the requester a link to the free ebook, and
//   2. notifies Koda that a new lead came in (reply-to set to the lead).
//
// Required env (set in Vercel, never in the repo):
//   RESEND_API_KEY   – Resend secret key
//   GUIDE_FROM       – verified sender, e.g. "Pleco Haptera <guide@pleco.dev>"
//   CONTACT_EMAIL    – the human address Conor talks to leads from (defaults to
//                      conor@pleco.dev). Used as the guide's reply-to and as the
//                      default inbox for lead notifications below.
//   LEAD_NOTIFY_TO   – where lead notifications go (defaults to CONTACT_EMAIL)
//   SITE_URL         – public origin for the PDF link (defaults to prod)
import { Resend } from 'resend';

const SITE_URL = (process.env.SITE_URL || 'https://haptera.pleco.dev').replace(/\/$/, '');
const EBOOK_PATH = '/Own-Your-Club-ebook.pdf';
const GUIDE_FROM = process.env.GUIDE_FROM || 'Pleco Haptera <guide@pleco.dev>';
// One human address for the whole warm-lead conversation. Notifications land
// here (so a Gmail "reply from the same address the message was sent to" sends
// as conor@), and it's the reply-to on the guide email so a lead's reply
// reaches Conor directly too.
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'conor@pleco.dev';
const LEAD_NOTIFY_TO = process.env.LEAD_NOTIFY_TO || CONTACT_EMAIL;

// Deliberately forgiving but real: something@something.tld, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Vercel parses JSON and urlencoded bodies onto req.body, but be defensive
// about the string case so a stray content-type never 500s.
function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { /* fall through */ }
    return Object.fromEntries(new URLSearchParams(b));
  }
  return b;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // A no-JS form submit expects a redirect; a fetch() sends Accept: application/json.
  const wantsJson = (req.headers.accept || '').includes('application/json');
  const done = (ok) => {
    if (wantsJson) return res.status(ok ? 200 : 502).json({ ok });
    // Progressive-enhancement fallback: land on the thank-you page either way,
    // flagging failure so it can show a retry line instead of a dead end.
    res.setHeader('Location', ok ? '/guide/thanks' : '/guide?error=1');
    return res.status(303).end();
  };

  const body = readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const honeypot = String(body.company || '').trim(); // hidden field; humans leave it empty

  // Spam guard: silently accept-and-drop honeypot hits so bots get no signal.
  if (honeypot) return done(true);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return wantsJson
      ? res.status(400).json({ ok: false, error: 'invalid_email' })
      : (res.setHeader('Location', '/guide?error=1'), res.status(303).end());
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('guide: RESEND_API_KEY is not configured');
    return done(false);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const downloadUrl = `${SITE_URL}${EBOOK_PATH}`;
  const safeEmail = escapeHtml(email);

  try {
    // 1) Deliver the guide to the requester.
    const delivery = await resend.emails.send({
      from: GUIDE_FROM,
      to: email,
      replyTo: CONTACT_EMAIL,
      subject: 'Your copy of “Own Your Club”',
      text:
        `Thanks for grabbing the guide.\n\n` +
        `Here's your copy of Own Your Club — a short, honest read on running a ` +
        `membership or club program on rails you own instead of renting them:\n\n` +
        `${downloadUrl}\n\n` +
        `No spam. I'll occasionally send something useful; unsubscribe anytime.\n\n` +
        `If you're weighing a club for your own shop, just reply — happy to talk it through.\n\n` +
        `— Conor, Pleco\n${SITE_URL}\n`,
      html:
        `<div style="font-family:-apple-system,'IBM Plex Sans',Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#2A2825;max-width:520px">` +
        `<p>Thanks for grabbing the guide.</p>` +
        `<p>Here's your copy of <strong>Own Your Club</strong> — a short, honest read on running a membership or club program on rails you own instead of renting them.</p>` +
        `<p><a href="${downloadUrl}" style="display:inline-block;background:#2D7A6B;color:#FAF6EE;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:600">Download the guide (PDF)</a></p>` +
        `<p style="font-size:14px;color:#6B6862">Or paste this into your browser:<br><a href="${downloadUrl}" style="color:#245F54">${downloadUrl}</a></p>` +
        `<p style="font-size:14px;color:#6B6862">No spam. I'll occasionally send something useful; unsubscribe anytime.</p>` +
        `<p>If you're weighing a club for your own shop, just reply to this email — happy to talk it through.</p>` +
        `<p style="margin-top:24px">— Conor, Pleco<br><a href="${SITE_URL}" style="color:#245F54">${SITE_URL.replace(/^https?:\/\//, '')}</a></p>` +
        `</div>`,
    });

    if (delivery.error) {
      console.error('guide: delivery send failed', delivery.error);
      return done(false);
    }

    // 2) Notify Koda so the lead list accumulates in the inbox (reply-to = lead).
    const notify = await resend.emails.send({
      from: GUIDE_FROM,
      to: LEAD_NOTIFY_TO,
      replyTo: email,
      subject: `New guide signup: ${email}`,
      text: `New "Own Your Club" guide signup.\n\nEmail: ${email}\n\nReply to this message to reach them directly.\n`,
      html:
        `<div style="font-family:-apple-system,'IBM Plex Sans',Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#2A2825">` +
        `<p><strong>New “Own Your Club” guide signup.</strong></p>` +
        `<p>Email: <a href="mailto:${safeEmail}">${safeEmail}</a></p>` +
        `<p style="font-size:14px;color:#6B6862">Reply to this message to reach them directly.</p>` +
        `</div>`,
    });

    // The requester already got the guide; a failed internal notice shouldn't
    // fail their submit. Log it and still report success to the visitor.
    if (notify.error) console.error('guide: lead notification failed', notify.error);

    return done(true);
  } catch (err) {
    // Never leak internals (or the key) to the client.
    console.error('guide: unexpected error', err);
    return done(false);
  }
}
