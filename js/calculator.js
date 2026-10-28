/**
 * Bulk Card Calculator.
 * Two quote modes, switched via a toggle:
 *  - "card":   per condition/rarity bucket (pricingCategories)
 *  - "weight": flat rate per kg (weightPricing)
 * Both read their rates from pricing-config.js and show the total
 * live as you type, right here on the page. Email is optional — if
 * you add one, "Get this quote" also emails you a copy (via
 * /api/quote) alongside copying it to your clipboard; without one
 * it just copies to clipboard.
 *
 * UX extras: quantity +/- steppers, a live subtotal per row, a
 * sticky summary bar that mirrors the main total/button so it's
 * visible while scrolling the category list, and the entered
 * quantities/weight are auto-saved to localStorage so a reload
 * doesn't lose them (the email field is deliberately NOT persisted).
 */
document.addEventListener("DOMContentLoaded", () => {
  const categoriesEl = document.getElementById("calc-categories");
  const errorEl = document.getElementById("quantity-error");
  const totalEl = document.getElementById("calc-total");
  const breakdownEl = document.getElementById("calc-breakdown");
  const quoteBtn = document.getElementById("get-quote-btn");
  const toast = document.getElementById("toast");

  const modeCardBtn = document.getElementById("mode-card-btn");
  const modeWeightBtn = document.getElementById("mode-weight-btn");
  const modeCardPanel = document.getElementById("mode-card-panel");
  const modeWeightPanel = document.getElementById("mode-weight-panel");
  const weightInput = document.getElementById("weight-kg");

  const emailInput = document.getElementById("quote-email");
  const emailErrorEl = document.getElementById("quote-email-error");

  const stickyBar = document.getElementById("calc-sticky-bar");
  const stickyAmountEl = document.getElementById("calc-sticky-amount");
  const stickyBtn = document.getElementById("calc-sticky-btn");

  // MAX_QUANTITY_PER_CATEGORY / MAX_WEIGHT_KG come from
  // pricing-config.js (loaded before this file) so the frontend
  // and the /api/quote backend validate against the same ceilings.
  const MAX_QUANTITY = MAX_QUANTITY_PER_CATEGORY;

  const DRAFT_KEY = "rarepull-calc-draft-v1";

  const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

  // GBP currency formatting always rounds to whole pence, which
  // would flatten a rate like 1.4p down to "£0.01". Per-card rates
  // are shown in pence with fractional precision instead;
  // money.format() is still used for subtotals/totals, since real
  // payouts are naturally rounded to the nearest penny.
  function formatRate(pricePerCard) {
    if (pricePerCard >= 1) {
      return money.format(pricePerCard);
    }
    const pence = pricePerCard * 100;
    const penceStr = Number.isInteger(pence) ? String(pence) : pence.toFixed(1);
    return `${penceStr}p`;
  }

  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  let mode = "card"; // "card" | "weight"
  let lastResult = null; // holds the most recent valid calculation, for the quote button
  let lastTotalValue = null; // used to only pulse the total when it actually changes

  // Render one row per pricing category: icon, label, rate,
  // +/- stepper, quantity input, and a live per-row subtotal.
  pricingCategories.forEach((category) => {
    const row = document.createElement("div");
    row.className = "calc-category-row";
    row.innerHTML = `
      <div class="calc-category-row-main">
        <div class="calc-category-info">
          <span class="calc-category-icon" aria-hidden="true">${category.icon || ""}</span>
          <span>
            <label for="qty-${category.id}">${category.label}</label>
            <span class="calc-category-rate">${formatRate(category.pricePerCard)} / card</span>
          </span>
        </div>
        <div class="calc-qty-control">
          <button type="button" class="calc-qty-btn" data-step="-1" data-target="qty-${category.id}" aria-label="Decrease ${category.label} quantity">&minus;</button>
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
          <button type="button" class="calc-qty-btn" data-step="1" data-target="qty-${category.id}" aria-label="Increase ${category.label} quantity">+</button>
        </div>
      </div>
      <div class="calc-row-subtotal" id="subtotal-${category.id}"></div>
    `;
    categoriesEl.appendChild(row);
  });

  const cardInputs = Array.from(categoriesEl.querySelectorAll("input[data-category-id]"));

  // +/- steppers: delegated so one listener covers every row.
  categoriesEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".calc-qty-btn");
    if (!btn) return;
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const step = Number(btn.dataset.step);
    const current = Math.max(0, Math.trunc(Number(input.value) || 0));
    input.value = Math.max(0, current + step);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  function setMode(newMode) {
    mode = newMode;
    const isCard = mode === "card";
    modeCardBtn.classList.toggle("active", isCard);
    modeCardBtn.setAttribute("aria-selected", String(isCard));
    modeWeightBtn.classList.toggle("active", !isCard);
    modeWeightBtn.setAttribute("aria-selected", String(!isCard));
    modeCardPanel.hidden = !isCard;
    modeWeightPanel.hidden = isCard;
    errorEl.textContent = "";
    calculate();
  }

  modeCardBtn.addEventListener("click", () => setMode("card"));
  modeWeightBtn.addEventListener("click", () => setMode("weight"));

  function setQuoteButtonsDisabled(disabled) {
    quoteBtn.disabled = disabled;
    stickyBtn.disabled = disabled;
  }

  function setQuoteButtonsLabel(label) {
    quoteBtn.textContent = label;
    stickyBtn.textContent = label;
  }

  // Email is optional, so the buttons only depend on having a
  // valid calculated total — not on the email field.
  function updateQuoteButtonState() {
    setQuoteButtonsDisabled(!lastResult);
    stickyBar.classList.toggle("visible", !!lastResult);
    stickyBar.setAttribute("aria-hidden", String(!lastResult));
    document.body.classList.toggle("has-sticky-bar", !!lastResult);
  }

  function pulseTotal(value) {
    if (value === lastTotalValue) return;
    lastTotalValue = value;
    totalEl.classList.remove("pulse");
    // Force reflow so the animation restarts even if it's still running.
    void totalEl.offsetWidth;
    totalEl.classList.add("pulse");
  }

  function clearRowSubtotals() {
    cardInputs.forEach((input) => {
      const el = document.getElementById(`subtotal-${input.dataset.categoryId}`);
      if (el) el.textContent = "";
    });
  }

  function resetResult() {
    lastResult = null;
    totalEl.innerHTML = `${money.format(0)} <span class="calc-total-unit">estimated total</span>`;
    breakdownEl.innerHTML = `<p>Enter your details above to see your quote.</p>`;
    stickyAmountEl.textContent = money.format(0);
    updateQuoteButtonState();
  }

  function calculateCardMode() {
    let hasError = false;
    let hasAnyQuantity = false;
    const lineItems = [];

    for (const input of cardInputs) {
      const category = pricingCategories.find((c) => c.id === input.dataset.categoryId);
      const rawValue = input.value.trim();
      const subtotalEl = document.getElementById(`subtotal-${category.id}`);

      if (rawValue === "") {
        if (subtotalEl) subtotalEl.textContent = "";
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

      const subtotal = quantity * category.pricePerCard;
      if (subtotalEl) subtotalEl.textContent = quantity > 0 ? `= ${money.format(subtotal)}` : "";

      if (quantity > 0) {
        hasAnyQuantity = true;
        lineItems.push({ category, quantity, subtotal });
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
    const quantities = Object.fromEntries(lineItems.map((item) => [item.category.id, item.quantity]));

    totalEl.innerHTML = `${money.format(total)} <span class="calc-total-unit">estimated total</span>`;
    breakdownEl.innerHTML = lineItems
      .map(
        (item) =>
          `<p>${item.quantity.toLocaleString()} × ${item.category.label} (${formatRate(item.category.pricePerCard)}) = ${money.format(item.subtotal)}</p>`
      )
      .join("");
    stickyAmountEl.textContent = money.format(total);
    pulseTotal(total);

    lastResult = { mode: "card", lineItems, total, quantities };
    updateQuoteButtonState();
  }

  function calculateWeightMode() {
    const rawValue = weightInput.value.trim();

    if (rawValue === "") {
      resetResult();
      return;
    }

    if (!/^\d+(\.\d+)?$/.test(rawValue)) {
      errorEl.textContent = "Please enter a valid weight in kg.";
      resetResult();
      return;
    }

    const weight = Number(rawValue);

    if (weight <= 0) {
      errorEl.textContent = "Weight must be greater than 0kg.";
      resetResult();
      return;
    }

    if (weight > MAX_WEIGHT_KG) {
      errorEl.textContent = `For collections over ${MAX_WEIGHT_KG.toLocaleString()}kg, please contact us directly.`;
      resetResult();
      return;
    }

    errorEl.textContent = "";

    const total = weight * weightPricing.pricePerKg;

    totalEl.innerHTML = `${money.format(total)} <span class="calc-total-unit">estimated total</span>`;
    breakdownEl.innerHTML = `<p>${weight.toLocaleString()} kg × ${money.format(weightPricing.pricePerKg)}/kg = ${money.format(total)}</p>`;
    stickyAmountEl.textContent = money.format(total);
    pulseTotal(total);

    lastResult = { mode: "weight", weight, pricePerKg: weightPricing.pricePerKg, total };
    updateQuoteButtonState();
  }

  function saveDraft() {
    try {
      const quantities = {};
      cardInputs.forEach((input) => {
        if (input.value.trim() !== "") quantities[input.dataset.categoryId] = input.value.trim();
      });
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ mode, quantities, weightKg: weightInput.value.trim() })
      );
    } catch (err) {
      // localStorage can throw (private browsing, storage disabled) — non-essential, ignore.
    }
  }

  // localStorage is per-browser and never trusted as-is: a draft is
  // just a convenience to refill the form, never used for pricing
  // (every quote is recalculated from the live input values, and
  // /api/quote independently re-validates and re-prices server-side),
  // but a strict check here still stops a corrupted or tampered-with
  // draft from populating the UI with anything other than a plain,
  // in-range non-negative number.
  function isValidDraftNumberString(value, max) {
    if (typeof value !== "string" || value === "") return false;
    if (!/^\d+(\.\d+)?$/.test(value)) return false;
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 && num <= max;
  }

  function loadDraft() {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);

      if (draft.quantities && typeof draft.quantities === "object") {
        cardInputs.forEach((input) => {
          const value = draft.quantities[input.dataset.categoryId];
          if (isValidDraftNumberString(value, MAX_QUANTITY)) input.value = value;
        });
      }
      if (isValidDraftNumberString(draft.weightKg, MAX_WEIGHT_KG)) {
        weightInput.value = draft.weightKg;
      }
      if (draft.mode === "weight" || draft.mode === "card") {
        mode = draft.mode;
      }
    } catch (err) {
      // Corrupt or unavailable draft — just start fresh.
    }
  }

  function calculate() {
    if (mode === "card") {
      calculateCardMode();
    } else {
      calculateWeightMode();
    }
    saveDraft();
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      toast.classList.remove("visible");
    }, 3000);
  }

  function buildQuoteText() {
    if (lastResult.mode === "card") {
      const lines = lastResult.lineItems.map(
        (item) =>
          `${item.quantity.toLocaleString()} × ${item.category.label} (${formatRate(item.category.pricePerCard)}) = ${money.format(item.subtotal)}`
      );
      return `The Rare Pull — Bulk Quote (by card)\n${lines.join("\n")}\nTotal: ${money.format(lastResult.total)}`;
    }
    return (
      `The Rare Pull — Bulk Quote (by weight)\n` +
      `${lastResult.weight.toLocaleString()} kg × ${money.format(lastResult.pricePerKg)}/kg = ${money.format(lastResult.total)}`
    );
  }

  cardInputs.forEach((input) => input.addEventListener("input", calculate));
  weightInput.addEventListener("input", calculate);

  emailInput.addEventListener("input", () => {
    if (emailInput.value.trim() === "" || validateEmail(emailInput.value.trim())) {
      emailErrorEl.textContent = "";
    }
  });

  async function submitQuote() {
    if (!lastResult) return;

    const email = emailInput.value.trim();
    if (email && !validateEmail(email)) {
      emailErrorEl.textContent = "That doesn't look like a valid email address.";
      return;
    }
    emailErrorEl.textContent = "";

    const quoteText = buildQuoteText();

    // Clipboard copy always happens, email is a bonus on top.
    // Fire-and-forget: the Clipboard API can hang or reject
    // depending on permissions, and that must never block anything.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(quoteText).catch(() => {});
    }

    if (!email) {
      showToast("Quote copied to clipboard!");
      return;
    }

    // The server recomputes the price itself from these raw
    // inputs (against the same pricing-config.js) rather than
    // trusting a client-supplied total.
    const payload =
      lastResult.mode === "card"
        ? { mode: "card", email, quantities: lastResult.quantities }
        : { mode: "weight", email, weightKg: lastResult.weight };

    setQuoteButtonsDisabled(true);
    setQuoteButtonsLabel("Sending…");

    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong sending your quote.");
      }

      showToast(`Quote copied, and emailed to ${email}!`);
    } catch (err) {
      showToast("Quote copied to clipboard. Couldn't email it though, please try again shortly.");
    } finally {
      setQuoteButtonsLabel("Get this quote");
      updateQuoteButtonState();
    }
  }

  quoteBtn.addEventListener("click", submitQuote);
  stickyBtn.addEventListener("click", submitQuote);

  loadDraft();
  setMode(mode);
});
