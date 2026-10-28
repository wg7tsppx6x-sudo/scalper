/**
 * GET /api/admin
 * Vercel serverless function (Node.js runtime).
 *
 * A simple password-protected admin page showing the spin wheel's
 * marketing opt-in list and recent spin request log, so there's no
 * secret baked into a bookmarkable/shareable URL (the previous
 * approach) — instead the browser's native username/password prompt
 * guards the whole page. CSV downloads are still available via
 * api/marketing-export.js and api/spin-log.js, which use the same
 * login.
 *
 * Requires:
 *   ADMIN_USERNAME, ADMIN_PASSWORD - whatever you choose. Visit
 *     https://therarepull.co.uk/api/admin
 *   and your browser will prompt for them once per browser session.
 *
 *   Same Upstash env vars as api/spin.js (UPSTASH_REDIS_REST_URL /
 *   UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL / KV_REST_API_TOKEN).
 */

const SPIN_LOG_PAGE_SIZE = 500;
const CONTACT_LOG_PAGE_SIZE = 200;

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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function describeResult(entry) {
  if (entry.alreadySpun) {
    const parts = [];
    if (entry.blockedByEmail) parts.push("email");
    if (entry.blockedByIp) parts.push("IP");
    return `Blocked (${parts.length ? parts.join(" + ") : "already spun"})`;
  }
  return entry.win ? "🎉 Win" : "No win";
}

module.exports = async (req, res) => {
  if (!checkBasicAuth(req, res)) return;

  let marketingPairs = [];
  let spinLogTotal = 0;
  let spinLogRaw = [];
  let contactLogTotal = 0;
  let contactLogRaw = [];
  let fullSpinLogRaw = [];
  let winsClaimsPairs = [];
  try {
    [marketingPairs, spinLogTotal, spinLogRaw, contactLogTotal, contactLogRaw, fullSpinLogRaw, winsClaimsPairs] = await Promise.all([
      redis("HGETALL", "marketing:consented-emails"),
      redis("LLEN", "spin:log"),
      redis("LRANGE", "spin:log", -SPIN_LOG_PAGE_SIZE, -1),
      redis("LLEN", "contact:log"),
      redis("LRANGE", "contact:log", -CONTACT_LOG_PAGE_SIZE, -1),
      // Full log (not just the recent page above) so a win isn't
      // missed just because a lot of non-winning spins came after it.
      redis("LRANGE", "spin:log", 0, -1),
      redis("HGETALL", "wins:claims"),
    ]);
  } catch (err) {
    console.error("Admin page: failed to read from Upstash:", err);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(502).send("<p>Couldn't load admin data right now. Please try again shortly.</p>");
  }

  const marketingRows = [];
  for (let i = 0; i < (marketingPairs || []).length; i += 2) {
    const email = marketingPairs[i];
    let consentedAt = "";
    let source = "";
    try {
      const parsed = JSON.parse(marketingPairs[i + 1]);
      consentedAt = parsed.consentedAt || "";
      source = parsed.source || "";
    } catch (err) {
      // Leave blank for a malformed entry.
    }
    marketingRows.push({ email, consentedAt, source });
  }
  marketingRows.sort((a, b) => (b.consentedAt || "").localeCompare(a.consentedAt || ""));

  const spinRows = (spinLogRaw || [])
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean)
    .reverse(); // newest first

  const spinLogNote =
    spinLogTotal > spinRows.length
      ? `Showing the most recent ${spinRows.length} of ${spinLogTotal} total entries. <a href="/api/spin-log">Download full CSV</a>.`
      : `${spinRows.length} entries. <a href="/api/spin-log">Download as CSV</a>.`;

  const contactRows = (contactLogRaw || [])
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean)
    .reverse(); // newest first

  const contactLogNote =
    contactLogTotal > contactRows.length
      ? `Showing the most recent ${contactRows.length} of ${contactLogTotal} total messages. <a href="/api/contact-log">Download full CSV</a>.`
      : `${contactRows.length} messages. <a href="/api/contact-log">Download as CSV</a>.`;

  const claimsByToken = {};
  for (let i = 0; i < (winsClaimsPairs || []).length; i += 2) {
    const tok = winsClaimsPairs[i];
    try {
      claimsByToken[tok] = JSON.parse(winsClaimsPairs[i + 1]);
    } catch (err) {
      // Skip a malformed claim entry.
    }
  }

  const winRows = (fullSpinLogRaw || [])
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch (err) {
        return null;
      }
    })
    .filter((entry) => entry && entry.win)
    .reverse() // newest first
    .map((entry) => {
      const claim = entry.claimToken ? claimsByToken[entry.claimToken] : null;
      return {
        at: entry.at || "",
        email: entry.email || "",
        claimed: Boolean(claim),
        name: claim ? claim.name : "",
        address: claim ? claim.address : "",
        postcode: claim ? claim.postcode : "",
        submittedAt: claim ? claim.submittedAt : "",
      };
    });

  const unclaimedCount = winRows.filter((row) => !row.claimed).length;
  const winsNote = `${winRows.length} total win${winRows.length === 1 ? "" : "s"}${
    unclaimedCount ? `, ${unclaimedCount} not yet claimed` : ""
  }. <a href="/api/wins-export">Download as CSV</a>.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>Admin | The Rare Pull</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/css/style.css" />
<style>
  body { background: var(--color-bg); padding: 2rem 1.25rem; }
  .admin-wrap { max-width: 1000px; margin: 0 auto; }
  .admin-wrap h1 { font-family: var(--font-heading); color: var(--primary-color); margin-bottom: 0.25rem; }
  .admin-wrap h2 { font-family: var(--font-heading); color: var(--primary-color); margin: 2rem 0 0.5rem; }
  .admin-note { color: var(--color-text-muted); font-size: 0.9rem; margin-bottom: 1rem; }
  .admin-note a { color: var(--stripe-blue); }
  table { width: 100%; border-collapse: collapse; background: var(--color-surface); border-radius: var(--radius-md); overflow: hidden; box-shadow: var(--shadow-sm); }
  th, td { text-align: left; padding: 0.6em 0.8em; border-bottom: 1px solid var(--color-border); font-size: 0.9rem; }
  th { background: var(--primary-color); color: #fff; font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: var(--color-bg); }
  .empty { color: var(--color-text-muted); font-style: italic; padding: 1rem; }
  .table-scroll { overflow-x: auto; }
</style>
</head>
<body>
  <div class="admin-wrap">
    <h1>The Rare Pull — Admin</h1>
    <p class="admin-note">Not linked from anywhere public. Bookmark this page — your browser will remember the login for this session.</p>

    <h2>Contact form messages</h2>
    <p class="admin-note">${contactLogNote}</p>
    <div class="table-scroll">
      ${
        contactRows.length
          ? `<table>
        <thead><tr><th>Time (UTC)</th><th>Name</th><th>Email</th><th>Message</th><th>Emailed to you?</th></tr></thead>
        <tbody>
          ${contactRows
            .map(
              (entry) => `<tr>
            <td>${escapeHtml(entry.at || "")}</td>
            <td>${escapeHtml(entry.name || "")}</td>
            <td>${escapeHtml(entry.email || "")}</td>
            <td style="white-space: pre-wrap;">${escapeHtml(entry.message || "")}</td>
            <td>${entry.delivered ? "✅ Yes" : "⚠️ Failed"}</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>`
          : `<p class="empty">No contact form messages logged yet.</p>`
      }
    </div>

    <h2>Wins</h2>
    <p class="admin-note">${winsNote}</p>
    <div class="table-scroll">
      ${
        winRows.length
          ? `<table>
        <thead><tr><th>Time (UTC)</th><th>Email</th><th>Claimed?</th><th>Name</th><th>Address</th><th>Postcode</th><th>Submitted (UTC)</th></tr></thead>
        <tbody>
          ${winRows
            .map(
              (row) => `<tr>
            <td>${escapeHtml(row.at)}</td>
            <td>${escapeHtml(row.email)}</td>
            <td>${row.claimed ? "✅ Yes" : "⏳ Not yet"}</td>
            <td>${escapeHtml(row.name)}</td>
            <td style="white-space: pre-wrap;">${escapeHtml(row.address)}</td>
            <td>${escapeHtml(row.postcode)}</td>
            <td>${escapeHtml(row.submittedAt)}</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>`
          : `<p class="empty">No wins yet.</p>`
      }
    </div>

    <h2>Spin requests</h2>
    <p class="admin-note">${spinLogNote}</p>
    <div class="table-scroll">
      ${
        spinRows.length
          ? `<table>
        <thead><tr><th>Time (UTC)</th><th>Email</th><th>Result</th><th>IP</th></tr></thead>
        <tbody>
          ${spinRows
            .map(
              (entry) => `<tr>
            <td>${escapeHtml(entry.at || "")}</td>
            <td>${escapeHtml(entry.email || "")}</td>
            <td>${escapeHtml(describeResult(entry))}</td>
            <td>${escapeHtml(entry.ip || "")}</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>`
          : `<p class="empty">No spin requests logged yet.</p>`
      }
    </div>

    <h2>Marketing opt-ins</h2>
    <p class="admin-note">${marketingRows.length} ${marketingRows.length === 1 ? "person has" : "people have"} opted in. <a href="/api/marketing-export">Download as CSV</a>.</p>
    <div class="table-scroll">
      ${
        marketingRows.length
          ? `<table>
        <thead><tr><th>Email</th><th>Consented at (UTC)</th><th>Source</th></tr></thead>
        <tbody>
          ${marketingRows
            .map(
              (row) => `<tr>
            <td>${escapeHtml(row.email)}</td>
            <td>${escapeHtml(row.consentedAt)}</td>
            <td>${escapeHtml(row.source)}</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>`
          : `<p class="empty">No marketing opt-ins yet.</p>`
      }
    </div>
  </div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200);
  if (typeof res.send === "function") {
    return res.send(html);
  }
  return res.end(html);
};
