/**
 * POST /api/spin
 * Vercel serverless function (Node.js runtime).
 *
 * Free daily "Spin to Win" — one spin per email per day, odds fixed
 * at 1 in 10000. The win/lose decision and the once-a-day limit are
 * both enforced here, never in the browser: client-side JS can
 * always be read or bypassed, so a user could otherwise just
 * re-spin until they won, or edit the odds themselves.
 *
 * Requires environment variables set in the Vercel project, from an
 * Upstash Redis database connected via Storage -> Create Database ->
 * Upstash for Redis -> Connect to Project. Depending on how that
 * integration names things, this reads either pair:
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, or
 *   KV_REST_API_URL / KV_REST_API_TOKEN
 *
 *   RESEND_API_KEY, QUOTE_FROM_EMAIL / a dedicated FROM address, and
 *   BUSINESS_EMAIL are reused from api/quote.js for sending the
 *   win/notification emails.
 */

const ODDS_DENOMINATOR = 10000; // 1-in-10000 chance to win
const KEY_TTL_SECONDS = 60 * 60 * 48; // 48h — comfortably covers "today" regardless of timezone, keys are date-stamped anyway so this is just cleanup

const RESEND_API_URL = "https://api.resend.com/emails";

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function todayKey() {
  // UTC calendar date, e.g. "2026-10-21" — resets the limit at
  // midnight UTC. Using the date itself as part of the storage key
  // (rather than relying solely on a TTL) means "once per day"
  // stays correct even if the TTL math is ever slightly off.
  return new Date().toISOString().slice(0, 10);
}

function getClientIp(req) {
  const headers = req.headers || {};
  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (typeof headers["x-real-ip"] === "string") {
    return headers["x-real-ip"];
  }
  return "unknown";
}

async function redis(...args) {
  // Vercel's Upstash marketplace integration can land the same REST
  // credentials under either naming convention depending on how the
  // database was connected, so accept both.
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

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const date = todayKey();
  const emailKey = `spin:email:${email}:${date}`;
  const ipKey = `spin:ip:${getClientIp(req)}:${date}`;

  let alreadySpun;
  try {
    const [emailSpun, ipSpun] = await Promise.all([redis("GET", emailKey), redis("GET", ipKey)]);
    alreadySpun = Boolean(emailSpun || ipSpun);
  } catch (err) {
    console.error("Spin wheel: failed to check spin history:", err);
    return res.status(502).json({ error: "Couldn't check your spin status right now. Please try again shortly." });
  }

  if (alreadySpun) {
    return res.status(200).json({ win: false, alreadySpun: true });
  }

  // Record the spin BEFORE emailing, so a slow/failed email can
  // never let the same email or IP spin twice in one day.
  try {
    await Promise.all([
      redis("SET", emailKey, "1", "EX", String(KEY_TTL_SECONDS)),
      redis("SET", ipKey, "1", "EX", String(KEY_TTL_SECONDS)),
    ]);
  } catch (err) {
    console.error("Spin wheel: failed to record spin:", err);
    return res.status(502).json({ error: "Couldn't process your spin right now. Please try again shortly." });
  }

  // Cryptographically random, exact 1-in-ODDS_DENOMINATOR chance.
  const crypto = require("crypto");
  const win = crypto.randomInt(1, ODDS_DENOMINATOR + 1) === 1;

  // Best-effort running stats for the business — never block the
  // actual result on these.
  redis("INCR", "spin:stats:total").catch(() => {});
  if (win) {
    redis("INCR", "spin:stats:wins").catch(() => {});
  }

  if (win) {
    const fromEmail = process.env.SPIN_FROM_EMAIL || process.env.QUOTE_FROM_EMAIL || "noreply@therarepull.co.uk";
    const businessEmail = process.env.BUSINESS_EMAIL || "williamleework@icloud.com";

    try {
      await sendEmail({
        from: `The Rare Pull <${fromEmail}>`,
        to: email,
        subject: "🎉 You won a Fun Pack from The Rare Pull!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color:#14142b;">You won!</h2>
            <p>Your free daily spin landed on a Fun Pack. Nice one!</p>
            <p>Reply to this email with your name and postal address and we'll get it sent out to you.</p>
          </div>
        `,
        text: "You won! Your free daily spin landed on a Fun Pack. Reply to this email with your name and postal address and we'll get it sent out to you.",
      });
    } catch (err) {
      // The win is already recorded; don't fail the response over
      // a flaky confirmation email. Logged so it can be followed up.
      console.error("Spin wheel: failed to send winner email:", err);
    }

    try {
      await sendEmail({
        from: `The Rare Pull Website <${fromEmail}>`,
        to: businessEmail,
        replyTo: email,
        subject: "🎰 Spin to Win — new winner!",
        html: `<p>${email} just won a Fun Pack from the homepage spin wheel.</p>`,
        text: `${email} just won a Fun Pack from the homepage spin wheel.`,
      });
    } catch (err) {
      console.error("Spin wheel: failed to send winner notification to business:", err);
    }
  }

  return res.status(200).json({ win });
};
