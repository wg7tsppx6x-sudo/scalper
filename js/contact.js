/**
 * Contact form: client-side validation, then submits to
 * /api/contact (Vercel serverless function) which emails the
 * message to the business with reply-to set to the customer, plus
 * prefill from a quote passed via ?quote= (see calculator.js
 * "Get this quote" button).
 */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  const successEl = document.getElementById("form-success");
  const errorBannerEl = document.getElementById("form-error-banner");
  const submitBtn = form.querySelector('button[type="submit"]');

  const fields = {
    name: { input: document.getElementById("name"), error: document.getElementById("name-error") },
    email: { input: document.getElementById("email"), error: document.getElementById("email-error") },
    message: { input: document.getElementById("message"), error: document.getElementById("message-error") },
  };

  // Prefill the message with a quote carried over from the calculator page.
  const params = new URLSearchParams(window.location.search);
  const quote = params.get("quote");
  if (quote) {
    fields.message.input.value = `${quote}\n\n`;
  }

  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validate() {
    let isValid = true;

    if (!fields.name.input.value.trim()) {
      fields.name.error.textContent = "Please enter your name.";
      isValid = false;
    } else {
      fields.name.error.textContent = "";
    }

    if (!fields.email.input.value.trim()) {
      fields.email.error.textContent = "Please enter your email.";
      isValid = false;
    } else if (!validateEmail(fields.email.input.value.trim())) {
      fields.email.error.textContent = "Please enter a valid email address.";
      isValid = false;
    } else {
      fields.email.error.textContent = "";
    }

    if (!fields.message.input.value.trim()) {
      fields.message.error.textContent = "Please enter a message.";
      isValid = false;
    } else {
      fields.message.error.textContent = "";
    }

    return isValid;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    successEl.classList.remove("visible");
    errorBannerEl.classList.remove("visible");

    if (!validate()) {
      return;
    }

    const payload = {
      name: fields.name.input.value.trim(),
      email: fields.email.input.value.trim(),
      message: fields.message.input.value.trim(),
    };

    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong sending your message.");
      }

      successEl.classList.add("visible");
      form.reset();
    } catch (err) {
      errorBannerEl.textContent = "Couldn't send your message right now. Please try again shortly, or email us directly.";
      errorBannerEl.classList.add("visible");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });

  // Clear individual field errors as the user corrects them.
  Object.values(fields).forEach(({ input, error }) => {
    input.addEventListener("input", () => {
      if (input.value.trim()) {
        error.textContent = "";
      }
    });
  });
});
