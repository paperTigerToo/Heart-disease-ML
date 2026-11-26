// Chapter 6: move the cut-off and watch the confusion matrix and every metric respond.
import * as d3 from "d3";
import { svgIn, xGrid, int, pct1, once, dur, chartWidth, EASE, DUR } from "./util.js";

const METRICS = [
  { key: "acc", label: "Accuracy" }, { key: "prec", label: "Precision" },
  { key: "rec", label: "Recall" }, { key: "f1", label: "F1" },
];

export function thresholdChart(el, ctx) {
  const t = ctx.t;
  const byT = new Map(t.sweep.map((d) => [Math.round(d.t * 100), d]));
  const chosen = Math.round(t.chosen_threshold * 100);
  el.insertAdjacentHTML("beforeend", `
    <div class="thresh-controls">
      <label for="thresh">Cut-off <output id="thresh-out">0.50</output></label>
      <input id="thresh" type="range" min="1" max="99" step="1" value="50" aria-describedby="thresh-help">
      <button class="chip" data-t="50" aria-pressed="true">Default 0.50</button>
      <button class="chip" data-t="${chosen}" aria-pressed="false">Tuned ${(chosen / 100).toFixed(2)}</button>
    </div>
    <p id="thresh-help" class="sr-only">Moves the probability above which the model flags someone as at risk.</p>
    <div class="cm" aria-live="polite">
      <span></span><span class="h">Flagged</span><span class="h">Cleared</span>
      <span class="rh">Sick</span>
      <div class="cell" style="--c:var(--accent)"><b data-k="tp"></b><span>caught (TP)</span></div>
      <div class="cell" style="--c:var(--missed)"><b data-k="fn"></b><span>missed (FN)</span></div>
      <span class="rh">Healthy</span>
      <div class="cell" style="--c:var(--no)"><b data-k="fp"></b><span>false alarm (FP)</span></div>
      <div class="cell" style="--c:var(--no)"><b data-k="tn"></b><span>cleared (TN)</span></div>
    </div>`);
  const { W } = chartWidth(el);
  const rowH = 30, m = { t: 4, r: 56, b: 24, l: 84 };
  const H = m.t + m.b + rowH * METRICS.length;
  const svg = svgIn(el, W, H, "Accuracy, precision, recall and F1 at the selected cut-off");
  const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
  const y = d3.scaleBand().domain(METRICS.map((d) => d.key)).range([m.t, H - m.b]).padding(0.3);
  xGrid(svg, x, m.t, H - m.b, [0, 0.25, 0.5, 0.75, 1], (d) => `${d * 100}%`);
  svg.append("g").selectAll("text").data(METRICS).join("text").attr("class", "label")
    .attr("x", m.l - 10).attr("y", (d) => y(d.key) + y.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "end").text((d) => d.label);
  const bars = svg.append("g").selectAll("rect").data(METRICS).join("rect")
    .attr("x", m.l).attr("y", (d) => y(d.key)).attr("height", y.bandwidth()).attr("rx", 3).attr("fill", "var(--model)").attr("width", 0);
  const vals = svg.append("g").selectAll("text").data(METRICS).join("text").attr("class", "label")
    .attr("y", (d) => y(d.key) + y.bandwidth() / 2).attr("dy", "0.35em");
  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = `Logistic regression on the real, imbalanced test set. The tuned cut-off was chosen from training data only (${t.chosen_by}); the slider is for exploring.`;
  el.appendChild(note);

  const input = el.querySelector("#thresh"), out = el.querySelector("#thresh-out");
  const chips = el.querySelectorAll(".chip");
  function render(v, animate) {
    const d = byT.get(v);
    out.textContent = (v / 100).toFixed(2);
    el.querySelectorAll("[data-k]").forEach((b) => (b.textContent = int(d[b.dataset.k])));
    chips.forEach((c) => c.setAttribute("aria-pressed", +c.dataset.t === v));
    const tr = (sel) => (animate ? sel.transition().duration(dur(DUR.fast)).ease(EASE) : sel);
    tr(bars).attr("width", (k) => x(d[k.key]) - m.l);
    tr(vals).attr("x", (k) => x(d[k.key]) + 6).text((k) => pct1(d[k.key]));
    el.dispatchEvent(new CustomEvent("cutoff", { bubbles: true, detail: d })); // the 3D matrix follows
  }
  input.addEventListener("input", () => render(+input.value, false));
  chips.forEach((c) => c.addEventListener("click", () => { input.value = c.dataset.t; render(+c.dataset.t, true); }));
  render(50, false);
  bars.attr("width", 0);
  return { enter: once(() => render(+input.value, true)) };
}
