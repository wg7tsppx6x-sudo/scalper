/**
 * ============================================================
 * EDIT ME — Bulk card pricing rates.
 * ============================================================
 * This is the ONLY file you should need to touch to change
 * pricing. Each rate card has a flat price per card in that
 * condition/rarity bucket — the calculator sums (quantity ×
 * pricePerCard) across every bucket the customer fills in.
 *
 * `pricePerCard` is in GBP (pounds), e.g. 1.3p = 0.013.
 * `id` must be unique within a rate card and is used as the
 * form field key — don't reuse an id across buckets.
 * `label` is shown next to the quantity field on the page.
 *
 * `pricingRatesByGame` is keyed by TCG. Pokemon is the only
 * game today; when other TCGs are added, add another entry
 * (e.g. "mtg", "yugioh") with its own rate card, and the
 * calculator can offer a game selector without any other code
 * changes.
 */

const pricingRatesByGame = {
  pokemon: [
    { id: "common", label: "Common / Uncommon (Near Mint)", pricePerCard: 0.013 },
    { id: "holo", label: "Holo / Reverse Holo", pricePerCard: 0.03 },
    { id: "exv", label: "EX / V", pricePerCard: 0.40 },
    { id: "fullart", label: "Full Art / AR / etc.", pricePerCard: 0.80 },
  ],
};

// Default game used by the calculator until multi-game selection
// is added to the UI.
const DEFAULT_PRICING_GAME = "pokemon";
const pricingCategories = pricingRatesByGame[DEFAULT_PRICING_GAME];

/**
 * Weight-based pricing — the alternative "By Weight" quote mode.
 * Flat rate per kilogram for a mixed bulk collection, no sorting
 * by rarity/condition needed. `pricePerKg` is in GBP.
 */
const weightPricing = {
  pricePerKg: 5.5,
};

// Sane ceilings shared by the frontend (calculator.js) and the
// backend (api/quote.js) so a submitted quote is validated the
// same way in both places.
const MAX_QUANTITY_PER_CATEGORY = 500_000;
const MAX_WEIGHT_KG = 2_000;

// This file is loaded two ways: as a plain <script> in the browser
// (where `module` doesn't exist, so this block is skipped and the
// `const`s above are just shared page-level bindings), and via
// require() from the Vercel serverless function in /api, which
// needs these as real exports. Keeping pricing in one file this
// way means there's still only one place to edit rates.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    pricingRatesByGame,
    DEFAULT_PRICING_GAME,
    pricingCategories,
    weightPricing,
    MAX_QUANTITY_PER_CATEGORY,
    MAX_WEIGHT_KG,
  };
}
