/**
 * GET /api/marketing-export
 * Vercel serverless function (Node.js runtime).
 *
 * Downloads a CSV of everyone who ticked the "email me about offers"
 * checkbox on the spin wheel (see api/spin.js), for importing into
 * whatever email marketing tool you use. Protected by a secret so it
 * can't be scraped by anyone who finds the URL.
 *
 * Requires:
 *   ADMIN_EXPORT_SECRET - a long random string you choose. Set it in
 *   Vercel, then visit:
 *     https://therarepull.co.uk/api/marketing-export?secret=YOUR_SECRET
 *   (or send it as an x-admin-secret header instead, if you prefer
 *   not to have it in a URL/browser history).
 *
 *   Same Upstash env vars as api/spin.js (UPSTASH_REDIS_REST_URL /
 *   UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL / KV_REST_API_TOKEN).
 */

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
  const expectedSecret = process.env.ADMIN_EXPORT_SECRET;
  if (!expectedSecret) {
    return res.status(500).json({ error: "ADMIN_EXPORT_SECRET is not configured" });
  }

  const query = req.query || {};
  const providedSecret = req.headers["x-admin-secret"] || query.secret || "";
  if (providedSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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
