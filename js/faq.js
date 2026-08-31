/**
 * FAQ accordion: click a question to expand/collapse its answer.
 * Multiple items can be open at once.
 */
document.addEventListener("DOMContentLoaded", () => {
  const items = document.querySelectorAll(".accordion-item");

  items.forEach((item) => {
    const button = item.querySelector(".accordion-question");
    const answer = item.querySelector(".accordion-answer");

    button.addEventListener("click", () => {
      const isOpen = item.classList.toggle("open");
      button.setAttribute("aria-expanded", String(isOpen));
      answer.style.maxHeight = isOpen ? `${answer.scrollHeight}px` : "0px";
    });
  });
});
