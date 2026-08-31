/**
 * ============================================================
 * EDIT ME — Bulk Pokemon card pricing tiers.
 * ============================================================
 * This is the ONLY file you should need to touch to change
 * pricing. Each tier is flat-rate: every card in the submitted
 * quantity is priced at that tier's `pricePerCard`, based on
 * which tier the total quantity falls into.
 *
 * - `min` / `max` are inclusive card counts.
 * - Use `Infinity` for the top tier's `max` so there's no
 *   upper ceiling.
 * - Tiers must be listed in ascending order with no gaps.
 * - `label` is shown in the on-page tier table.
 *
 * `category` identifies which product line these tiers apply
 * to. Pokemon is the only category today; when other TCGs are
 * added, add another entry to `pricingTiersByCategory` (e.g.
 * "mtg", "yugioh") with its own tier list, and the calculator
 * can offer a category selector without any other code
 * changes.
 */

const pricingTiersByCategory = {
  pokemon: [
    { min: 1, max: 99, pricePerCard: 0.05, label: "1 - 99 cards" },
    { min: 100, max: 499, pricePerCard: 0.04, label: "100 - 499 cards" },
    { min: 500, max: 999, pricePerCard: 0.03, label: "500 - 999 cards" },
    { min: 1000, max: 4999, pricePerCard: 0.02, label: "1,000 - 4,999 cards" },
    { min: 5000, max: Infinity, pricePerCard: 0.015, label: "5,000+ cards" },
  ],
};

// Default category used by the calculator until multi-category
// selection is added to the UI.
const DEFAULT_PRICING_CATEGORY = "pokemon";
const pricingTiers = pricingTiersByCategory[DEFAULT_PRICING_CATEGORY];
