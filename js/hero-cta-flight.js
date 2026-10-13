/**
 * Hero CTA flight: a small decorative card flies around the hero
 * on page load, then lands on the "Get an instant quote" button
 * and lights it up. Home page only — no-ops if the elements aren't
 * present. Purely decorative: wrapped in try/catch and skipped
 * entirely for prefers-reduced-motion or if the Web Animations API
 * isn't available, so it can never block or break the real CTA.
 */
(function () {
  const btn = document.getElementById("instant-quote-btn");
  const hero = document.querySelector(".hero");
  if (!btn || !hero) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  if (!btn.animate || !("Element" in window) || typeof Element.prototype.animate !== "function") return;

  function runFlight() {
    try {
      const card = document.createElement("div");
      card.className = "fly-card";
      card.setAttribute("aria-hidden", "true");
      document.body.appendChild(card);

      // translate() moves the card's top-left corner, so offset
      // every waypoint by half the card's own size to land/fly
      // centered on each point instead.
      const cardRect = card.getBoundingClientRect();
      const halfW = cardRect.width / 2;
      const halfH = cardRect.height / 2;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const btnRect = btn.getBoundingClientRect();
      const endX = btnRect.left + btnRect.width / 2 - halfW;
      const endY = btnRect.top + btnRect.height / 2 - halfH;

      // A loose, swooping path across the hero before diving onto
      // the button — expressed as waypoints relative to the
      // viewport so it still looks reasonable at any screen size.
      const waypoints = [
        { x: -40 - halfW, y: vh * 0.15 - halfH, r: -20, s: 0.8, o: 0 },
        { x: vw * 0.15 - halfW, y: vh * 0.1 - halfH, r: 15, s: 1, o: 1 },
        { x: vw * 0.82 - halfW, y: vh * 0.2 - halfH, r: -25, s: 1.1, o: 1 },
        { x: vw * 0.2 - halfW, y: vh * 0.42 - halfH, r: 20, s: 0.9, o: 1 },
        { x: vw * 0.78 - halfW, y: vh * 0.3 - halfH, r: -15, s: 1, o: 1 },
        { x: endX, y: endY, r: 0, s: 0.4, o: 0 },
      ];

      const keyframes = waypoints.map((wp, i) => ({
        transform: `translate(${wp.x}px, ${wp.y}px) rotate(${wp.r}deg) scale(${wp.s})`,
        opacity: wp.o,
        offset: i / (waypoints.length - 1),
      }));

      const animation = card.animate(keyframes, {
        duration: 2200,
        easing: "cubic-bezier(0.45, 0, 0.2, 1)",
        fill: "forwards",
      });

      animation.onfinish = () => {
        card.remove();
        btn.classList.add("lit");
        btn.addEventListener(
          "animationend",
          () => btn.classList.remove("lit"),
          { once: true }
        );
      };
    } catch (err) {
      // Decorative only — never let this interfere with the page.
    }
  }

  // Let the hero's own entrance animation settle first.
  window.setTimeout(runFlight, 900);
})();
