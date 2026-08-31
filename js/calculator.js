/**
 * Bulk Card Calculator.
 * Reads `pricingTiers` from pricing-config.js. Recalculates on
 * every keystroke/change — no page reload, no submit button
 * needed for the calculation itself.
 */
document.addEventListener("DOMContentLoaded", () => {
  const quantityInput = document.getElementById("quantity");
  const errorEl = document.getElementById("quantity-error");
  const totalEl = document.getElementById("calc-total");
  const breakdownEl = document.getElementById("calc-breakdown");
  const tiersBody = document.getElementById("calc-tiers-body");
  const quoteBtn = document.getElementById("get-quote-btn");
  const toast = document.getElementById("toast");

  // A sane ceiling so someone typing "99999999999999" doesn't
  // freeze the tab or produce a nonsensical dollar figure.
  const MAX_QUANTITY = 1_000_000;

  let lastResult = null; // holds the most recent valid calculation, for the quote button

  function findTier(quantity) {
    return pricingTiers.find((tier) => quantity >= tier.min && quantity <= tier.max);
  }

  function formatMoney(amount) {
    return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function renderTierTable(activeTier) {
    tiersBody.innerHTML = "";
    pricingTiers.forEach((tier) => {
      const row = document.createElement("tr");
      if (tier === activeTier) {
        row.classList.add("active-tier");
      }
      const maxLabel = tier.max === Infinity ? "+" : `–${tier.max.toLocaleString()}`;
      row.innerHTML = `
        <td>${tier.min.toLocaleString()}${maxLabel}</td>
        <td>${formatMoney(tier.pricePerCard)} / card</td>
      `;
      tiersBody.appendChild(row);
    });
  }

  function setError(message) {
    errorEl.textContent = message || "";
  }

  function resetResult() {
    lastResult = null;
    totalEl.innerHTML = `${formatMoney(0)} <span class="calc-total-unit">estimated total</span>`;
    breakdownEl.textContent = "Enter a quantity above to see your quote.";
    quoteBtn.disabled = true;
    renderTierTable(null);
  }

  function calculate() {
    const rawValue = quantityInput.value.trim();

    if (rawValue === "") {
      setError("");
      resetResult();
      return;
    }

    const quantity = Number(rawValue);

    if (!Number.isFinite(quantity) || !/^\d+$/.test(rawValue)) {
      setError("Please enter a whole number of cards.");
      resetResult();
      return;
    }

    if (quantity <= 0) {
      setError("Quantity must be at least 1 card.");
      resetResult();
      return;
    }

    if (quantity > MAX_QUANTITY) {
      setError(`For quotes over ${MAX_QUANTITY.toLocaleString()} cards, please contact us directly.`);
      resetResult();
      return;
    }

    setError("");

    const tier = findTier(quantity);
    if (!tier) {
      // Should not happen if tiers are configured with no gaps,
      // but fail gracefully instead of showing a broken total.
      setError("No pricing tier is configured for that quantity. Please contact us.");
      resetResult();
      return;
    }

    const total = quantity * tier.pricePerCard;

    totalEl.innerHTML = `${formatMoney(total)} <span class="calc-total-unit">estimated total</span>`;
    breakdownEl.textContent = `${quantity.toLocaleString()} cards × ${formatMoney(tier.pricePerCard)} = ${formatMoney(total)}`;
    renderTierTable(tier);
    quoteBtn.disabled = false;

    lastResult = { quantity, pricePerCard: tier.pricePerCard, total };
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      toast.classList.remove("visible");
    }, 2500);
  }

  quantityInput.addEventListener("input", calculate);

  quoteBtn.addEventListener("click", async () => {
    if (!lastResult) return;

    const quoteText =
      `The Rare Pull — Bulk Quote\n` +
      `${lastResult.quantity.toLocaleString()} cards × ${formatMoney(lastResult.pricePerCard)} = ${formatMoney(lastResult.total)}`;

    // Simplest option: copy the quote to the clipboard so the
    // customer can paste it into the contact form or an email.
    try {
      await navigator.clipboard.writeText(quoteText);
      showToast("Quote copied! Paste it into the contact form.");
    } catch (err) {
      // Clipboard API can fail (older browsers, insecure context).
      // Fall back to prefilling the contact page via a query param.
      showToast("Couldn't copy automatically — opening contact form instead.");
    }

    // Also carry the quote over to the contact form via query
    // string so "Get this quote" is one click from a filled-in
    // message, clipboard or not.
    const params = new URLSearchParams({ quote: quoteText });
    window.setTimeout(() => {
      window.location.href = `contact.html?${params.toString()}`;
    }, 900);
  });

  resetResult();
});
