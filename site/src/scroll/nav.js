// Chapter rail (desktop) and a thin progress bar (phones).
export function initNav(scrollToEl) {
  const rail = document.getElementById("rail");
  const bar = document.getElementById("progress");
  const chapters = [...document.querySelectorAll("main > section[id]")]
    .filter((s) => s.id !== "hero")
    .map((s) => {
      const eyebrow = s.querySelector(".eyebrow")?.textContent ?? s.id;
      return { el: s, id: s.id, name: eyebrow.replace(/^\d+\s*·\s*/, "") };
    });
  rail.innerHTML = chapters.map((c) => `<a href="#${c.id}"><span>${c.name}</span><i></i></a>`).join("");
  const links = [...rail.querySelectorAll("a")];
  links.forEach((a, i) => a.addEventListener("click", (e) => {
    e.preventDefault();
    scrollToEl(chapters[i].el);
  }));

  let current = -1;
  function update() {
    const line = innerHeight * 0.4;
    let i = -1;
    chapters.forEach((c, k) => { if (c.el.getBoundingClientRect().top <= line) i = k; });
    if (i !== current) {
      current = i;
      links.forEach((a, k) => a.setAttribute("aria-current", k === i ? "true" : "false"));
    }
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  }
  addEventListener("scroll", update, { passive: true });
  update();
}
