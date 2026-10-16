/**
 * POST /api/quote
 * Vercel serverless function (Node.js runtime).
 *
 * Takes the customer's raw inputs (never a client-computed total —
 * the price shown in an email has to come from the server), looks
 * up the same rate card the frontend uses, and emails the quote to
 * the customer plus a lead notification to the business.
 *
 * Requires environment variables set in the Vercel project:
 *   RESEND_API_KEY   - from resend.com, after verifying your domain
 *   QUOTE_FROM_EMAIL - e.g. quotes@therarepull.co.uk (optional,
 *                      defaults below)
 *   BUSINESS_EMAIL   - where lead notifications go (optional,
 *                      defaults below)
 */

const {
  pricingRatesByGame,
  DEFAULT_PRICING_GAME,
  weightPricing,
  MAX_QUANTITY_PER_CATEGORY,
  MAX_WEIGHT_KG,
} = require("../js/pricing-config.js");

const RESEND_API_URL = "https://api.resend.com/emails";

const moneyFormatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
function money(amount) {
  return moneyFormatter.format(amount);
}

// Mirrors formatRate() in js/calculator.js — GBP formatting would
// flatten a rate like 1.3p down to "£0.01".
function formatRate(pricePerCard) {
  if (pricePerCard >= 1) {
    return money(pricePerCard);
  }
  const pence = pricePerCard * 100;
  const penceStr = Number.isInteger(pence) ? String(pence) : pence.toFixed(1);
  return `${penceStr}p`;
}

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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

  const { mode, email, quantities, weightKg } = body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "A valid email address is required." });
  }

  let total;
  let breakdownLines;
  let breakdownHtml;

  if (mode === "card") {
    const rateCard = pricingRatesByGame[DEFAULT_PRICING_GAME];

    if (!quantities || typeof quantities !== "object") {
      return res.status(400).json({ error: "Missing card quantities." });
    }

    const lineItems = [];
    for (const category of rateCard) {
      const raw = quantities[category.id];
      if (raw === undefined || raw === null || raw === "") continue;

      const quantity = Number(raw);
      if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ error: `Invalid quantity for ${category.label}.` });
      }
      if (quantity > MAX_QUANTITY_PER_CATEGORY) {
        return res.status(400).json({ error: `Quantity for ${category.label} is too large. Please contact us directly.` });
      }
      if (quantity > 0) {
        lineItems.push({ category, quantity, subtotal: quantity * category.pricePerCard });
      }
    }

    if (lineItems.length === 0) {
      return res.status(400).json({ error: "Enter at least one card quantity." });
    }

    total = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    breakdownLines = lineItems.map(
      (item) =>
        `${item.quantity.toLocaleString()} x ${item.category.label} (${formatRate(item.category.pricePerCard)}) = ${money(item.subtotal)}`
    );
    breakdownHtml = lineItems
      .map(
        (item) =>
          `<tr><td style="padding:4px 12px 4px 0;">${item.quantity.toLocaleString()} &times; ${item.category.label}</td><td style="padding:4px 0;text-align:right;">${money(item.subtotal)}</td></tr>`
      )
      .join("");
  } else if (mode === "weight") {
    const weight = Number(weightKg);

    if (!Number.isFinite(weight) || weight <= 0) {
      return res.status(400).json({ error: "Enter a valid collection weight." });
    }
    if (weight > MAX_WEIGHT_KG) {
      return res.status(400).json({ error: "Collection weight is too large. Please contact us directly." });
    }

    total = weight * weightPricing.pricePerKg;
    breakdownLines = [`${weight.toLocaleString()} kg x ${money(weightPricing.pricePerKg)}/kg = ${money(total)}`];
    breakdownHtml = `<tr><td style="padding:4px 12px 4px 0;">${weight.toLocaleString()} kg &times; ${money(weightPricing.pricePerKg)}/kg</td><td style="padding:4px 0;text-align:right;">${money(total)}</td></tr>`;
  } else {
    return res.status(400).json({ error: "Unknown quote mode." });
  }

  const fromEmail = process.env.QUOTE_FROM_EMAIL || "quotes@therarepull.co.uk";
  const businessEmail = process.env.BUSINESS_EMAIL || "williamleework@icloud.com";
  const modeLabel = mode === "card" ? "by card" : "by weight";

  const customerHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#14142b;">Your Rare Pull quote</h2>
      <table style="width:100%; border-collapse:collapse; font-size:14px; color:#1c1a24;">
        ${breakdownHtml}
        <tr>
          <td style="padding:10px 12px 0 0; font-weight:bold; border-top:1px solid #e4e1ee;">Total</td>
          <td style="padding:10px 0 0; text-align:right; font-weight:bold; border-top:1px solid #e4e1ee;">${money(total)}</td>
        </tr>
      </table>
      <p style="color:#5c5870; font-size:13px; margin-top:24px;">
        This is an estimate based on the details you provided. The final offer may vary slightly
        once we see the cards${mode === "weight" ? " and check what's inside your collection" : ""}.
        Reply to this email or use our contact form to arrange sending your cards in.
      </p>
    </div>
  `;

  const businessHtml = `
    <div style="font-family: Arial, sans-serif;">
      <h2>New quote request (${modeLabel})</h2>
      <p><strong>From:</strong> ${email}</p>
      <table style="border-collapse:collapse; font-size:14px;">
        ${breakdownHtml}
        <tr>
          <td style="padding:10px 12px 0 0; font-weight:bold;">Total</td>
          <td style="padding:10px 0 0; font-weight:bold;">${money(total)}</td>
        </tr>
      </table>
    </div>
  `;

  try {
    await sendEmail({
      from: `The Rare Pull <${fromEmail}>`,
      to: email,
      subject: "Your Rare Pull quote",
      html: customerHtml,
      text: `Your Rare Pull quote\n\n${breakdownLines.join("\n")}\n\nTotal: ${money(total)}`,
    });
  } catch (err) {
    console.error("Failed to send customer quote email:", err);
    return res.status(502).json({ error: "We couldn't send your quote email right now. Please try again shortly." });
  }

  try {
    await sendEmail({
      from: `The Rare Pull Website <${fromEmail}>`,
      to: businessEmail,
      replyTo: email,
      subject: `New quote request (${modeLabel}) - ${money(total)}`,
      html: businessHtml,
      text: `New quote request (${modeLabel})\nFrom: ${email}\n\n${breakdownLines.join("\n")}\n\nTotal: ${money(total)}`,
    });
  } catch (err) {
    // The customer already has their quote at this point — don't
    // fail their request just because our own notification email
    // had trouble. Just log it so it's visible in Vercel logs.
    console.error("Failed to send business notification email:", err);
  }

  return res.status(200).json({ ok: true });
};
