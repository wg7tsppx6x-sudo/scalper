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
