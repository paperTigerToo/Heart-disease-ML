// Small helpers shared by every chart.
import * as d3 from "d3";
import { reducedMotion } from "../scroll/story.js";

export const pct0 = (v) => `${Math.round(v * 100)}%`;
export const pct1 = (v) => `${(v * 100).toFixed(1)}%`;
export const int = d3.format(",");
export const dur = (ms) => (reducedMotion ? 0 : ms);

const FEATURE_LABEL = {
  BMI: "BMI", Smoking: "Smoking", AlcoholDrinking: "Heavy drinking", Stroke: "Stroke",
  PhysicalHealth: "Poor physical-health days", MentalHealth: "Poor mental-health days",
  DiffWalking: "Difficulty walking", Sex: "Sex", AgeCategory: "Age group", Race: "Race / ethnicity",
  Diabetic: "Diabetes", PhysicalActivity: "Exercise", GenHealth: "General health", SleepTime: "Sleep hours",
  Asthma: "Asthma", KidneyDisease: "Kidney disease", SkinCancer: "Skin cancer", HeartDisease: "Heart disease",
};
export const featureLabel = (name) =>
  FEATURE_LABEL[name] ?? (name.startsWith("Race_") ? `Race: ${name.slice(5)}` : name);

// Charts are designed 520 units wide. In a narrow column (phones, landscape phones, small
// laptops) they're drawn at their real pixel width instead, with a phone layout, so 12 px
// text stays 12 px rather than shrinking with the whole chart.
export function chartWidth(el) {
  const cs = getComputedStyle(el);
  const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  if (w >= 440) return { W: 520, narrow: false }; // the 520 design, scaled down 15% at most
  return { W: Math.max(280, Math.floor(w)), narrow: true };
}

export function svgIn(el, W, H, label) {
  return d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", label);
}

// HTML legend above a chart. kind: dot | ring | line | dash
export function legend(el, items) {
  const div = document.createElement("div");
  div.className = "legend";
  div.innerHTML = items.map(({ label, color, kind = "dot" }) =>
    `<span class="key"><i class="mark ${kind}" style="--c:${color}"></i>${label}</span>`).join("");
  el.appendChild(div);
  return div;
}

// Accessible table view of a chart's numbers.
export function dataTable(el, headers, rows) {
  const d = document.createElement("details");
  d.className = "data-table";
  d.innerHTML = `<summary>Show the numbers</summary><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  el.appendChild(d);
}

// Vertical grid + bottom axis labels for an x scale.
export function xGrid(svg, x, y0, y1, ticks, fmt) {
  const g = svg.append("g");
  g.append("g").attr("class", "grid").selectAll("line").data(ticks).join("line")
    .attr("x1", x).attr("x2", x).attr("y1", y0).attr("y2", y1);
  g.append("g").attr("class", "axis").selectAll("text").data(ticks).join("text")
    .attr("x", x).attr("y", y1 + 16).attr("text-anchor", "middle").text(fmt);
  return g;
}

export function yGrid(svg, y, x0, x1, ticks, fmt) {
  const g = svg.append("g");
  g.append("g").attr("class", "grid").selectAll("line").data(ticks).join("line")
    .attr("x1", x0).attr("x2", x1).attr("y1", y).attr("y2", y);
  g.append("g").attr("class", "axis").selectAll("text").data(ticks).join("text")
    .attr("x", x0 - 8).attr("y", y).attr("dy", "0.35em").attr("text-anchor", "end").text(fmt);
  return g;
}

// Draw a path in from left to right.
export function drawIn(path, ms = 1200, delay = 0) {
  const len = path.node().getTotalLength();
  path.attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len)
    .transition().delay(dur(delay)).duration(dur(ms)).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0)
    .on("end", () => path.attr("stroke-dasharray", null));
}

// Run once, the first time a chart's step becomes current.
export function once(fn) {
  let done = false;
  return (...args) => { if (!done) { done = true; fn(...args); } };
}
