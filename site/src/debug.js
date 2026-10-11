// Phone review overlay, loaded only when the URL has ?debug (its own chunk: 0 bytes otherwise).
// Shows frame rate, viewport, pixel ratio, resizes, errors and the current story stop, and can
// open Eruda (an on-page console) because Safari's remote inspector needs a Mac.
const ERUDA = "https://cdn.jsdelivr.net/npm/eruda@3.4.3/eruda.js";

let errors = 0, resizes = 0;
addEventListener("error", () => errors++);
addEventListener("unhandledrejection", () => errors++);
const consoleError = console.error;
console.error = (...args) => { errors++; consoleError(...args); };
addEventListener("resize", () => resizes++);

const hud = document.createElement("div");
hud.setAttribute("aria-hidden", "true");
hud.style.cssText = `position:fixed;left:calc(8px + env(safe-area-inset-left));bottom:calc(8px + env(safe-area-inset-bottom));
  z-index:1000;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,0.78);color:#ecebe8;
  font:500 11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre;-webkit-backdrop-filter:blur(6px);
  backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.15);touch-action:manipulation`;
const text = document.createElement("div");
const btn = document.createElement("button");
btn.textContent = "open console";
btn.style.cssText = "margin-top:6px;font:inherit;color:inherit;background:#22252f;border:1px solid #444;border-radius:6px;padding:8px 10px;width:100%";
btn.addEventListener("click", () => {
  if (window.eruda) return window.eruda.show();
  btn.textContent = "loading…";
  const s = Object.assign(document.createElement("script"), { src: ERUDA });
  s.onload = () => { window.eruda.init(); window.eruda.show(); btn.textContent = "open console"; };
  s.onerror = () => (btn.textContent = "console failed to load");
  document.head.appendChild(s);
});
hud.append(text, btn);
document.body.appendChild(hud);
// tap the numbers to shrink the panel out of the way
let small = false;
text.addEventListener("click", () => { small = !small; btn.style.display = small ? "none" : ""; });

let frames = 0, worst = 0, last = performance.now(), windowStart = last, fps = 0, worstShown = 0;
function tick(now) {
  const dt = now - last;
  last = now;
  frames++;
  worst = Math.max(worst, dt);
  if (now - windowStart >= 1000) {
    fps = Math.round((frames * 1000) / (now - windowStart));
    worstShown = Math.round(worst);
    frames = 0; worst = 0; windowStart = now;
    const vv = window.visualViewport;
    const stop = document.querySelector("[data-stop].active")?.dataset.stop ?? "—";
    const lines = [
      `${fps} fps · worst ${worstShown} ms`,
      `stop ${stop}`,
    ];
    if (!small) lines.push(
      `${innerWidth}×${innerHeight} · vv ${vv ? Math.round(vv.height) : "?"} · dpr ${devicePixelRatio}`,
      `resizes ${resizes} · errors ${errors}`,
    );
    text.textContent = lines.join("\n");
    text.style.color = errors ? "#ff8a8c" : fps && fps < 30 ? "#f2c14e" : "";
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
