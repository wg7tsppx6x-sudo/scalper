/**
 * POST /api/claim
 * Vercel serverless function (Node.js runtime).
 *
 * Lets a spin wheel winner submit their shipping details (name,
 * address, postcode) — from the on-page popup shown right after a
 * win, or from claim.html if they use the link in their winner email
 * instead. Requires the one-time claimToken issued by api/spin.js at
 * win time, so a claim can't be submitted by anyone who didn't
 * actually win (the token is checked against claim:<token> in
 * Upstash, not just trusted from the request).
 *
 * Requires the same Upstash env vars as api/spin.js.
 */

const NAME_MAX_LENGTH = 200;
const ADDRESS_MAX_LENGTH = 500;
const POSTCODE_MAX_LENGTH = 20;

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

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const postcode = typeof body.postcode === "string" ? body.postcode.trim() : "";

  if (!token) {
    return res.status(400).json({ error: "Missing claim link. Please use the link from your winner email." });
  }
  if (!name) {
    return res.status(400).json({ error: "Please enter your name." });
  }
  if (name.length > NAME_MAX_LENGTH) {
    return res.status(400).json({ error: `Please keep your name under ${NAME_MAX_LENGTH} characters.` });
  }
  if (!address) {
    return res.status(400).json({ error: "Please enter your address." });
  }
  if (address.length > ADDRESS_MAX_LENGTH) {
    return res.status(400).json({ error: `Please keep your address under ${ADDRESS_MAX_LENGTH} characters.` });
  }
  if (!postcode) {
    return res.status(400).json({ error: "Please enter your postcode." });
  }
  if (postcode.length > POSTCODE_MAX_LENGTH) {
    return res.status(400).json({ error: `Please keep your postcode under ${POSTCODE_MAX_LENGTH} characters.` });
  }

  let email;
  try {
    email = await redis("GET", `claim:${token}`);
  } catch (err) {
    console.error("Claim: failed to look up claim token:", err);
    return res.status(502).json({ error: "Couldn't process your claim right now. Please try again shortly." });
  }

  if (!email) {
    return res.status(404).json({ error: "This claim link is invalid or has expired. Please reply to your winner email instead." });
  }

  let alreadyClaimed;
  try {
    alreadyClaimed = await redis("HEXISTS", "wins:claims", token);
  } catch (err) {
    console.error("Claim: failed to check existing claim:", err);
    return res.status(502).json({ error: "Couldn't process your claim right now. Please try again shortly." });
  }

  if (alreadyClaimed) {
    return res.status(409).json({ error: "This prize has already been claimed." });
  }

  try {
    await redis(
      "HSET",
      "wins:claims",
      token,
      JSON.stringify({ email, name, address, postcode, submittedAt: new Date().toISOString() })
    );
  } catch (err) {
    console.error("Claim: failed to store claim:", err);
    return res.status(502).json({ error: "Couldn't process your claim right now. Please try again shortly." });
  }

  return res.status(200).json({ ok: true });
};
