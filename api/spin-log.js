/**
 * GET /api/spin-log
 * Vercel serverless function (Node.js runtime).
 *
 * Downloads a CSV of every processed spin request — email, win/lose,
 * whether it was blocked as an already-used daily entry, IP, and
 * timestamp — so you can see exactly what's been coming in. Protected
 * by a secret so it can't be scraped by anyone who finds the URL.
 *
 * Requires:
 *   ADMIN_EXPORT_SECRET - same secret used by api/marketing-export.js.
 *   Visit:
 *     https://therarepull.co.uk/api/spin-log?secret=YOUR_SECRET
 *   (or send it as an x-admin-secret header instead).
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

  let rawEntries;
  try {
    rawEntries = (await redis("LRANGE", "spin:log", 0, -1)) || [];
  } catch (err) {
    console.error("Spin log export: failed to read from Upstash:", err);
    return res.status(502).json({ error: "Couldn't read the spin log right now." });
  }

  const rows = [["timestamp", "email", "win", "already_spun", "ip"]];
  for (const raw of rawEntries) {
    try {
      const entry = JSON.parse(raw);
      rows.push([entry.at || "", entry.email || "", entry.win, entry.alreadySpun, entry.ip || ""]);
    } catch (err) {
      // Skip a malformed entry rather than failing the whole export.
    }
  }

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="spin-log.csv"');
  res.status(200);
  if (typeof res.send === "function") {
    return res.send(csv);
  }
  return res.end(csv);
};
