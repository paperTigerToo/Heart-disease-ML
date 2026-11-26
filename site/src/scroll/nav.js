// Chapter rail (desktop) and a thin progress bar (phones).
export function initNav(scrollToEl) {
  const rail = document.getElementById("rail");
  const bar = document.getElementById("progress");
  const chapters = [...document.querySelectorAll("main > section[id]")]
    .filter((s) => s.id !== "hero")
    .map((s) => ({ el: s, id: s.id, name: s.dataset.name ?? s.id }));
  rail.innerHTML = chapters.map((c) => `<a href="#${c.id}"><span>${c.name}</span><i></i></a>`).join("");
  const links = [...rail.querySelectorAll("a")];
  links.forEach((a, i) => a.addEventListener("click", (e) => {
    e.preventDefault();
    scrollToEl(chapters[i].el);
  }));

  // phones: a "Chapters" button that names where you are and opens the full list
  const menu = document.getElementById("chapmenu");
  const btn = menu.querySelector("button"), list = menu.querySelector("ol"), lbl = btn.querySelector(".lbl");
  list.innerHTML = chapters.map((c) => `<li><a href="#${c.id}">${c.name}</a></li>`).join("");
  const items = [...list.querySelectorAll("a")];
  const open = (on) => { list.hidden = !on; btn.setAttribute("aria-expanded", on); };
  btn.addEventListener("click", () => open(list.hidden));
  items.forEach((a, i) => a.addEventListener("click", (e) => {
    e.preventDefault();
    open(false);
    scrollToEl(chapters[i].el);
  }));
  document.addEventListener("pointerdown", (e) => { if (!menu.contains(e.target)) open(false); });
  menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { open(false); btn.focus(); } });

  // in-page links (the model list and its skip link) go through the same smooth scroll
  document.querySelectorAll('.xp-jump a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const el = document.querySelector(a.getAttribute("href"));
    if (!el) return;
    e.preventDefault();
    scrollToEl(el);
  }));

  let current = -1;
  function update() {
    const line = innerHeight * 0.4;
    let i = -1;
    chapters.forEach((c, k) => { if (c.el.getBoundingClientRect().top <= line) i = k; });
    if (i !== current) {
      current = i;
      links.forEach((a, k) => a.setAttribute("aria-current", k === i ? "true" : "false"));
      items.forEach((a, k) => a.setAttribute("aria-current", k === i ? "true" : "false"));
      lbl.textContent = i < 0 ? "Chapters" : chapters[i].name;
    }
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  }
  addEventListener("scroll", update, { passive: true });
  update();
}
