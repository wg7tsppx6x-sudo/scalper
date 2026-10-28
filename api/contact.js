/**
 * POST /api/contact
 * Vercel serverless function (Node.js runtime).
 *
 * Emails the contact form message to the business, with reply-to
 * set to the customer's address so a reply goes straight to them.
 *
 * Requires environment variables set in the Vercel project:
 *   RESEND_API_KEY    - from resend.com, after verifying your domain
 *   CONTACT_FROM_EMAIL - e.g. contact@therarepull.co.uk (optional,
 *                        defaults below)
 *   BUSINESS_EMAIL     - where the message goes (optional, defaults
 *                        below)
 *
 * Every submission (name, email, message, and whether the email to
 * the business actually sent) is also logged to the contact:log
 * Redis list — same Upstash env vars as api/spin.js — so a message
 * that fails to deliver is still visible on GET /api/admin instead
 * of silently vanishing. This is best-effort: if Upstash isn't
 * configured, the contact form still works, it just isn't logged.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const CONTACT_LOG_KEY = "contact:log";
const CONTACT_LOG_MAX_ENTRIES = 5000;

async function redis(...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Upstash is not configured (UPSTASH_REDIS_REST_URL/KV_REST_API_URL or the matching token env var is missing)");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Upstash error (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.result;
}

// Best-effort, fire-and-forget — never blocks or fails the actual
// contact form response.
function logContactSubmission(entry) {
  redis("RPUSH", CONTACT_LOG_KEY, JSON.stringify({ ...entry, at: new Date().toISOString() }))
    .then(() => redis("LTRIM", CONTACT_LOG_KEY, -CONTACT_LOG_MAX_ENTRIES, -1))
    .catch((err) => console.error("Contact form: failed to write contact log:", err));
}

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmail({ from, to, replyTo, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, reply_to: replyTo, subject, html, text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${body}`);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ error: "Invalid request body." });
    }
  }
  body = body || {};

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name) {
    return res.status(400).json({ error: "Please enter your name." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!message) {
    return res.status(400).json({ error: "Please enter a message." });
  }

  const fromEmail = process.env.CONTACT_FROM_EMAIL || "contact@therarepull.co.uk";
  const businessEmail = process.env.BUSINESS_EMAIL || "williamleework@icloud.com";

  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2>New contact form message</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
    </div>
  `;

  try {
    await sendEmail({
      from: `The Rare Pull Website <${fromEmail}>`,
      to: businessEmail,
      replyTo: email,
      subject: `New contact form message from ${name}`,
      html,
      text: `New contact form message\n\nName: ${name}\nEmail: ${email}\n\n${message}`,
    });
  } catch (err) {
    console.error("Failed to send contact form email:", err);
    logContactSubmission({ name, email, message, delivered: false });
    return res.status(502).json({ error: "We couldn't send your message right now. Please try again shortly." });
  }

  logContactSubmission({ name, email, message, delivered: true });
  return res.status(200).json({ ok: true });
};
