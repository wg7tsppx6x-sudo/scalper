/**
 * GET /api/wins-export
 * Vercel serverless function (Node.js runtime).
 *
 * Downloads a CSV of every spin wheel win, cross-referenced with any
 * shipping details submitted via the claim popup or claim.html —
 * email, claimed status, name, address, postcode, submitted-at. Same
 * HTTP Basic Auth (ADMIN_USERNAME / ADMIN_PASSWORD) as the other
 * admin endpoints. See also GET /api/admin, which shows this same
 * data as a page.
 *
 * Requires the same Upstash env vars as api/spin.js.
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

  let spinLogRaw;
  let winsClaimsPairs;
  try {
    [spinLogRaw, winsClaimsPairs] = await Promise.all([redis("LRANGE", "spin:log", 0, -1), redis("HGETALL", "wins:claims")]);
  } catch (err) {
    console.error("Wins export: failed to read from Upstash:", err);
    return res.status(502).json({ error: "Couldn't read the wins list right now." });
  }

  const claimsByToken = {};
  for (let i = 0; i < (winsClaimsPairs || []).length; i += 2) {
    const tok = winsClaimsPairs[i];
    try {
      claimsByToken[tok] = JSON.parse(winsClaimsPairs[i + 1]);
    } catch (err) {
      // Skip a malformed claim entry.
    }
  }

  const rows = [["timestamp", "email", "claimed", "name", "address", "postcode", "submitted_at"]];
  for (const raw of spinLogRaw || []) {
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch (err) {
      continue;
    }
    if (!entry || !entry.win) continue;

    const claim = entry.claimToken ? claimsByToken[entry.claimToken] : null;
    rows.push([
      entry.at || "",
      entry.email || "",
      Boolean(claim),
      claim ? claim.name : "",
      claim ? claim.address : "",
      claim ? claim.postcode : "",
      claim ? claim.submittedAt : "",
    ]);
  }

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="wins.csv"');
  res.status(200);
  if (typeof res.send === "function") {
    return res.send(csv);
  }
  return res.end(csv);
};
