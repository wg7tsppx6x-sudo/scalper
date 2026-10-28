/**
 * GET /api/contact-log
 * Vercel serverless function (Node.js runtime).
 *
 * Downloads a CSV of every contact form submission — name, email,
 * message, whether the notification email to the business actually
 * sent, and timestamp. Protected by HTTP Basic Auth (the browser's
 * native username/password prompt), same as api/spin-log.js and
 * api/marketing-export.js. See also GET /api/admin, which shows this
 * same data as a page instead of a CSV download.
 *
 * Requires:
 *   ADMIN_USERNAME, ADMIN_PASSWORD - same as the other admin endpoints.
 *
 *   Same Upstash env vars as api/spin.js (UPSTASH_REDIS_REST_URL /
 *   UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL / KV_REST_API_TOKEN).
 */

function checkBasicAuth(req, res) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    res.status(500).json({ error: "ADMIN_USERNAME / ADMIN_PASSWORD are not configured" });
    return false;
  }

  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  if (req.headers.authorization !== expected) {
    res.setHeader("WWW-Authenticate", 'Basic realm="The Rare Pull Admin"');
    res.status(401).end("Authentication required.");
    return false;
  }

  return true;
}

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

function csvEscape(value) {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = async (req, res) => {
  if (!checkBasicAuth(req, res)) return;

  let rawEntries;
  try {
    rawEntries = (await redis("LRANGE", "contact:log", 0, -1)) || [];
  } catch (err) {
    console.error("Contact log export: failed to read from Upstash:", err);
    return res.status(502).json({ error: "Couldn't read the contact log right now." });
  }

  const rows = [["timestamp", "name", "email", "message", "delivered"]];
  for (const raw of rawEntries) {
    try {
      const entry = JSON.parse(raw);
      rows.push([entry.at || "", entry.name || "", entry.email || "", entry.message || "", entry.delivered]);
    } catch (err) {
      // Skip a malformed entry rather than failing the whole export.
    }
  }

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="contact-log.csv"');
  res.status(200);
  if (typeof res.send === "function") {
    return res.send(csv);
  }
  return res.end(csv);
};
