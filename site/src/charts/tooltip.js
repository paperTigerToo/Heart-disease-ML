// One shared tooltip for every chart.
const tip = Object.assign(document.createElement("div"), { className: "tooltip", role: "status" });
document.body.appendChild(tip);

export function showTip(e, html) {
  tip.innerHTML = html;
  tip.classList.add("on");
  tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 230)}px`;
  tip.style.top = `${e.clientY + 14}px`;
}
export const hideTip = () => tip.classList.remove("on");
