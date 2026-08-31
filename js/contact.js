/**
 * Contact form: client-side validation + prefill from a quote
 * passed via ?quote= (see calculator.js "Get this quote" button).
 *
 * TODO: connect to backend — this currently just validates the
 * form and shows a success message. Replace the submit handler's
 * "pretend to send" block with a real API call / email service
 * (e.g. fetch() to your backend, or a service like Formspree).
 */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  const successEl = document.getElementById("form-success");

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

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!validate()) {
      successEl.classList.remove("visible");
      return;
    }

    const payload = {
      name: fields.name.input.value.trim(),
      email: fields.email.input.value.trim(),
      message: fields.message.input.value.trim(),
    };

    // TODO: connect to backend — send `payload` to your email/API
    // service here instead of just logging it, e.g.:
    //   fetch("/api/contact", { method: "POST", body: JSON.stringify(payload) })
    console.log("Contact form submission (not yet wired to a backend):", payload);

    successEl.classList.add("visible");
    form.reset();
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
