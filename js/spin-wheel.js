/**
 * Spin to Win wheel (homepage only).
 * The win/lose decision and the once-a-day limit are both decided
 * server-side by /api/spin — this file only animates the wheel to
 * land on whatever result the server returns. It never decides a
 * win itself (and only spins once we have the real result), so
 * there's nothing here for someone to read in the page source and
 * exploit, and no risk of the animation disagreeing with the result.
 */
document.addEventListener("DOMContentLoaded", () => {
  const wheelEl = document.getElementById("spin-wheel");
  const form = document.getElementById("spin-form");
  const emailInput = document.getElementById("spin-email");
  const emailErrorEl = document.getElementById("spin-email-error");
  const spinBtn = document.getElementById("spin-btn");
  const resultEl = document.getElementById("spin-result");

  if (!wheelEl || !form) return; // not on this page

  const STORAGE_KEY = "rarepull-spin-last-date";

  // Purely decorative — the real odds (1 in 10000) are enforced by
  // the server. Exactly one segment is the win segment; the rest
  // are flavour text for "didn't win this time".
  const SEGMENTS = [
    { label: "Try Again", win: false, color: "var(--primary-color)" },
    { label: "So Close!", win: false, color: "var(--secondary-color)" },
    { label: "🎁 FUN PACK", win: true, color: "var(--accent-color)" },
    { label: "Try Again", win: false, color: "var(--primary-color)" },
    { label: "Not Today", win: false, color: "var(--secondary-color)" },
    { label: "Try Again", win: false, color: "var(--primary-color)" },
    { label: "Nice Try", win: false, color: "var(--secondary-color)" },
    { label: "Try Again", win: false, color: "var(--primary-color)" },
  ];
  const SEGMENT_ANGLE = 360 / SEGMENTS.length;

  // Build the wheel face: a conic-gradient for the colour wedges,
  // plus one rotated label per segment.
  const gradientStops = SEGMENTS.map((seg, i) => `${seg.color} ${i * SEGMENT_ANGLE}deg ${(i + 1) * SEGMENT_ANGLE}deg`).join(", ");
  wheelEl.style.background = `conic-gradient(${gradientStops})`;

  SEGMENTS.forEach((seg, i) => {
    const angleFromTop = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const label = document.createElement("div");
    label.className = "spin-wheel-label";
    // CSS rotate(0) on this element points right (3 o'clock); -90
    // corrects that back to "angleFromTop measured clockwise from
    // 12 o'clock", matching how conic-gradient angles are measured.
    label.style.transform = `rotate(${angleFromTop - 90}deg)`;
    const span = document.createElement("span");
    span.textContent = seg.label;
    label.appendChild(span);
    wheelEl.appendChild(label);
  });

  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function todayLocalDate() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }

  function markSpunToday() {
    try {
      window.localStorage.setItem(STORAGE_KEY, todayLocalDate());
    } catch (err) {
      // non-essential
    }
  }

  function showAlreadySpunToday() {
    spinBtn.disabled = true;
    spinBtn.textContent = "Come back tomorrow";
    resultEl.textContent = "You've already had your free spin today — come back tomorrow for another go!";
  }

  // Client-side nicety only (saves a round trip); the server is
  // the real source of truth and checks this independently.
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === todayLocalDate()) {
      showAlreadySpunToday();
    }
  } catch (err) {
    // localStorage unavailable — fine, the server still enforces the limit.
  }

  function pickLandingIndex(win) {
    const candidates = SEGMENTS.map((seg, i) => i).filter((i) => SEGMENTS[i].win === win);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Spins exactly once per call. Called only after the server has
  // already told us the real result, so the animation can never
  // land on an answer that then has to be corrected.
  function spinToIndex(index, onDone) {
    const targetCenter = index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const extraSpins = 5 + Math.floor(Math.random() * 3); // a few full turns for visual effect
    const rotation = extraSpins * 360 + (360 - targetCenter);

    const handleEnd = (event) => {
      if (event.propertyName !== "transform") return;
      wheelEl.removeEventListener("transitionend", handleEnd);
      onDone();
    };
    wheelEl.addEventListener("transitionend", handleEnd);
    wheelEl.style.transform = `rotate(${rotation}deg)`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    emailErrorEl.textContent = "";
    resultEl.textContent = "";

    const email = emailInput.value.trim();
    if (!validateEmail(email)) {
      emailErrorEl.textContent = "Please enter a valid email address.";
      return;
    }

    spinBtn.disabled = true;
    const originalLabel = spinBtn.textContent;
    spinBtn.textContent = "Asking the wheel…";
    wheelEl.classList.add("waiting");

    // A small minimum wait so the request doesn't feel instant/fake
    // even on a very fast connection — the wheel itself only starts
    // moving once we actually know the result (see below).
    const minWait = new window.Promise((resolve) => window.setTimeout(resolve, 900));

    let data;
    try {
      const [response] = await Promise.all([
        fetch("/api/spin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }),
        minWait,
      ]);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong.");
      }
      data = await response.json();
    } catch (err) {
      wheelEl.classList.remove("waiting");
      resultEl.textContent = "Couldn't spin right now — please try again shortly.";
      spinBtn.disabled = false;
      spinBtn.textContent = originalLabel;
      return;
    }

    wheelEl.classList.remove("waiting");

    if (data.alreadySpun) {
      markSpunToday();
      showAlreadySpunToday();
      return;
    }

    spinBtn.textContent = "Spinning…";

    spinToIndex(pickLandingIndex(data.win), () => {
      resultEl.textContent = data.win
        ? "🎉 You won a Fun Pack! Check your inbox — we've emailed you next steps."
        : "No win this time — come back tomorrow for another free spin!";
      markSpunToday();
      spinBtn.disabled = true;
      spinBtn.textContent = "Come back tomorrow";
    });
  });
});
