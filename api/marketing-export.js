/**
 * GET /api/marketing-export
 * Vercel serverless function (Node.js runtime).
 *
 * Downloads a CSV of everyone who ticked the "email me about offers"
 * checkbox on the spin wheel (see api/spin.js), for importing into
 * whatever email marketing tool you use. Protected by HTTP Basic Auth
 * (the browser's native username/password prompt) rather than a
 * secret in the URL, which would otherwise end up in browser history,
 * server logs, and screenshots. See also GET /api/admin, which shows
 * this same data as a page instead of a CSV download.
 *
 * Requires:
 *   ADMIN_USERNAME, ADMIN_PASSWORD - whatever you choose. Visit
 *     https://therarepull.co.uk/api/marketing-export
 *   and your browser will prompt for them.
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

  let pairs;
  try {
    pairs = (await redis("HGETALL", "marketing:consented-emails")) || [];
  } catch (err) {
    console.error("Marketing export: failed to read from Upstash:", err);
    return res.status(502).json({ error: "Couldn't read the marketing list right now." });
  }

  const rows = [["email", "consented_at", "source"]];
  for (let i = 0; i < pairs.length; i += 2) {
    const email = pairs[i];
    let consentedAt = "";
    let source = "";
    try {
      const parsed = JSON.parse(pairs[i + 1]);
      consentedAt = parsed.consentedAt || "";
      source = parsed.source || "";
    } catch (err) {
      // Malformed entry — still include the email, leave the rest blank.
    }
    rows.push([email, consentedAt, source]);
  }

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="marketing-emails.csv"');
  res.status(200);
  if (typeof res.send === "function") {
    return res.send(csv);
  }
  return res.end(csv);
};
