/**
 * Bulk Card Calculator.
 * Reads `pricingCategories` from pricing-config.js and renders
 * one quantity field per category. Recalculates on every
 * keystroke/change — no page reload, no submit button needed
 * for the calculation itself.
 */
document.addEventListener("DOMContentLoaded", () => {
  const categoriesEl = document.getElementById("calc-categories");
  const errorEl = document.getElementById("quantity-error");
  const totalEl = document.getElementById("calc-total");
  const breakdownEl = document.getElementById("calc-breakdown");
  const quoteBtn = document.getElementById("get-quote-btn");
  const toast = document.getElementById("toast");

  // A sane per-category ceiling so someone typing
  // "99999999999999" doesn't freeze the tab or produce a
  // nonsensical dollar figure.
  const MAX_QUANTITY = 500_000;

  const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

  // GBP currency formatting always rounds to whole pence, which
  // would flatten a rate like 1.3p down to "£0.01". Per-card
  // rates are shown in pence with fractional precision instead;
  // money.format() is still used for subtotals/totals, since
  // real payouts are naturally rounded to the nearest penny.
  function formatRate(pricePerCard) {
    if (pricePerCard >= 1) {
      return money.format(pricePerCard);
    }
    const pence = pricePerCard * 100;
    const penceStr = Number.isInteger(pence) ? String(pence) : pence.toFixed(1);
    return `${penceStr}p`;
  }

  let lastResult = null; // holds the most recent valid calculation, for the quote button

  // Render one row per pricing category: label, rate, quantity input.
  pricingCategories.forEach((category) => {
    const row = document.createElement("div");
    row.className = "calc-category-row";
    row.innerHTML = `
      <div class="calc-category-info">
        <label for="qty-${category.id}">${category.label}</label>
        <span class="calc-category-rate">${formatRate(category.pricePerCard)} / card</span>
      </div>
      <input
        type="number"
        id="qty-${category.id}"
        name="qty-${category.id}"
        inputmode="numeric"
        min="0"
        step="1"
        placeholder="0"
        autocomplete="off"
        data-category-id="${category.id}"
      />
    `;
    categoriesEl.appendChild(row);
  });

  const inputs = Array.from(categoriesEl.querySelectorAll("input[data-category-id]"));

  function resetResult() {
    lastResult = null;
    totalEl.innerHTML = `${money.format(0)} <span class="calc-total-unit">estimated total</span>`;
    breakdownEl.innerHTML = `<p>Enter your card counts above to see your quote.</p>`;
    quoteBtn.disabled = true;
  }

  function calculate() {
    let hasError = false;
    let hasAnyQuantity = false;
    const lineItems = [];

    for (const input of inputs) {
      const category = pricingCategories.find((c) => c.id === input.dataset.categoryId);
      const rawValue = input.value.trim();

      if (rawValue === "") {
        continue;
      }

      if (!/^\d+$/.test(rawValue)) {
        errorEl.textContent = "Please enter whole numbers only (0 or more) for each category.";
        hasError = true;
        continue;
      }

      const quantity = Number(rawValue);

      if (quantity < 0) {
        errorEl.textContent = "Quantities can't be negative.";
        hasError = true;
        continue;
      }

      if (quantity > MAX_QUANTITY) {
        errorEl.textContent = `For quantities over ${MAX_QUANTITY.toLocaleString()} per category, please contact us directly.`;
        hasError = true;
        continue;
      }

      if (quantity > 0) {
        hasAnyQuantity = true;
        lineItems.push({
          category,
          quantity,
          subtotal: quantity * category.pricePerCard,
        });
      }
    }

    if (hasError) {
      resetResult();
      return;
    }

    errorEl.textContent = "";

    if (!hasAnyQuantity) {
      resetResult();
      return;
    }

    const total = lineItems.reduce((sum, item) => sum + item.subtotal, 0);

    totalEl.innerHTML = `${money.format(total)} <span class="calc-total-unit">estimated total</span>`;
    breakdownEl.innerHTML = lineItems
      .map(
        (item) =>
          `<p>${item.quantity.toLocaleString()} × ${item.category.label} (${formatRate(item.category.pricePerCard)}) = ${money.format(item.subtotal)}</p>`
      )
      .join("");

    quoteBtn.disabled = false;
    lastResult = { lineItems, total };
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      toast.classList.remove("visible");
    }, 2500);
  }

  inputs.forEach((input) => input.addEventListener("input", calculate));

  quoteBtn.addEventListener("click", async () => {
    if (!lastResult) return;

    const lines = lastResult.lineItems.map(
      (item) =>
        `${item.quantity.toLocaleString()} × ${item.category.label} (${formatRate(item.category.pricePerCard)}) = ${money.format(item.subtotal)}`
    );
    const quoteText = `The Rare Pull — Bulk Quote\n${lines.join("\n")}\nTotal: ${money.format(lastResult.total)}`;

    // Simplest option: copy the quote to the clipboard so the
    // customer can paste it into the contact form or an email.
    try {
      await navigator.clipboard.writeText(quoteText);
      showToast("Quote copied! Paste it into the contact form.");
    } catch (err) {
      // Clipboard API can fail (older browsers, insecure context).
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
