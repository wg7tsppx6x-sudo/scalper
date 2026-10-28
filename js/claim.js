/**
 * Claim-prize page (claim.html) — fallback for a spin wheel winner
 * who closed the on-page popup, reached via the link in their winner
 * email. Submits to the same /api/claim endpoint as the popup
 * (js/spin-wheel.js), using the token from the URL.
 */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("claim-page-form");
  const missingTokenEl = document.getElementById("claim-page-missing-token");
  const successEl = document.getElementById("claim-page-success");
  const errorBannerEl = document.getElementById("claim-page-error-banner");
  const submitBtn = form.querySelector('button[type="submit"]');

  const fields = {
    name: { input: document.getElementById("claim-page-name"), error: document.getElementById("claim-page-name-error") },
    address: { input: document.getElementById("claim-page-address"), error: document.getElementById("claim-page-address-error") },
    postcode: { input: document.getElementById("claim-page-postcode"), error: document.getElementById("claim-page-postcode-error") },
  };

  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) {
    form.hidden = true;
    missingTokenEl.hidden = false;
    return;
  }

  function validate() {
    let isValid = true;
    Object.entries(fields).forEach(([key, field]) => {
      if (!field.input.value.trim()) {
        field.error.textContent = `Please enter your ${key === "postcode" ? "postcode" : key}.`;
        isValid = false;
      } else {
        field.error.textContent = "";
      }
    });
    return isValid;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    successEl.classList.remove("visible");
    errorBannerEl.classList.remove("visible");

    if (!validate()) return;

    const payload = {
      token,
      name: fields.name.input.value.trim(),
      address: fields.address.input.value.trim(),
      postcode: fields.postcode.input.value.trim(),
    };

    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
      const response = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong submitting your details.");
      }

      successEl.classList.add("visible");
      form.hidden = true;
    } catch (err) {
      errorBannerEl.textContent = err.message || "Couldn't submit your details right now. Please try again shortly, or reply to your winner email instead.";
      errorBannerEl.classList.add("visible");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });

  Object.values(fields).forEach(({ input, error }) => {
    input.addEventListener("input", () => {
      if (input.value.trim()) {
        error.textContent = "";
      }
    });
  });
});
