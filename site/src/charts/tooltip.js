// One shared tooltip for every chart.
const tip = Object.assign(document.createElement("div"), { className: "tooltip", role: "status" });
document.body.appendChild(tip);

export function showTip(e, html) {
  tip.innerHTML = html;
  tip.classList.add("on");
  tip.style.left = `${Math.max(8, Math.min(e.clientX + 14, innerWidth - 230))}px`;
  tip.style.top = `${e.clientY + 14}px`;
}
export const hideTip = () => tip.classList.remove("on");

// Touch screens have no hover. A tap replays the chart's hover handler at the tap point, after
// the browser's own pointerleave has fired; scrolling or tapping somewhere else hides it again.
let downAt = null;
addEventListener("pointerdown", (e) => (downAt = e.pointerType === "mouse" ? null : [e.clientX, e.clientY]), { passive: true });
addEventListener("pointercancel", () => (downAt = null), { passive: true }); // the touch became a scroll
addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 10) return;
  const { target, clientX, clientY } = e;
  hideTip();
  setTimeout(() => target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX, clientY, pointerType: "touch" })));
}, { passive: true });
addEventListener("scroll", hideTip, { passive: true });
