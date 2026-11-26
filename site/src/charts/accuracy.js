// Dot plot: accuracy of the first models, optionally against the always-No baseline.
import * as d3 from "d3";
import { showTip, hideTip } from "./tooltip.js";
import { chartWidth, EASE, DUR, dur } from "./util.js";

const IDS = ["logreg-22", "rf-22", "knn-22", "adaboost", "mlp-100"];
const pct = (v) => `${(v * 100).toFixed(1)}%`;

export function accuracyChart(el, ctx, { baseline = false } = {}) {
  const rows = IDS.map((id) => ({ id, label: ctx.m[id].family, acc: ctx.m[id].metrics.acc, rec: ctx.m[id].metrics.rec }));
  const base = ctx.n.baseline_accuracy;
  const { W, narrow } = chartWidth(el);
  const rowH = 34, m = { t: 28, r: narrow ? 50 : 64, b: 30, l: narrow ? 126 : 150 };
  const H = m.t + m.b + rowH * rows.length;
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
    .attr("aria-label", `Accuracy of five models${baseline ? ` compared with always guessing No (${pct(base)})` : ""}: ` +
      rows.map((r) => `${r.label} ${pct(r.acc)}`).join(", "));
  const accs = rows.map((r) => r.acc).concat(base);
  const x = d3.scaleLinear().domain([d3.min(accs) - 0.01, d3.max(accs) + 0.008]).range([m.l, W - m.r]);
  const y = d3.scaleBand().domain(IDS).range([m.t, H - m.b]).padding(0.4);
  const ticks = x.ticks(5).filter((d) => Math.abs(d * 100 - Math.round(d * 100)) < 1e-6); // whole percents only
  svg.append("g").attr("class", "grid").selectAll("line").data(ticks).join("line")
    .attr("x1", x).attr("x2", x).attr("y1", m.t - 6).attr("y2", H - m.b);
  svg.append("g").attr("class", "axis").selectAll("text").data(ticks).join("text")
    .attr("x", x).attr("y", H - m.b + 18).attr("text-anchor", "middle").text((d) => `${Math.round(d * 100)}%`);
  svg.append("g").selectAll("text").data(rows).join("text").attr("class", "label")
    .attr("x", m.l - 14).attr("y", (d) => y(d.id) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end").text((d) => d.label);

  const bx = x(base);
  const baseG = svg.append("g").style("opacity", 0);
  const baseLine = baseG.append("line").attr("x1", bx).attr("x2", bx).attr("y1", m.t - 14).attr("y2", m.t - 14)
    .attr("stroke", "var(--no)").attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
  const baseLabel = baseG.append("text").attr("class", "label").attr("x", bx + 6).attr("y", m.t - 10).text(`Always say No · ${pct(base)}`);
  // too close to the right edge (narrow screens): put the label on the line's left
  if (bx + 6 + baseLabel.node().getComputedTextLength() > W) baseLabel.attr("x", bx - 6).attr("text-anchor", "end");

  const dots = svg.append("g").selectAll("g").data(rows).join("g")
    .attr("transform", (d) => `translate(${m.l},${y(d.id) + y.bandwidth() / 2})`).style("opacity", 0);
  dots.append("circle").attr("r", 7).attr("fill", "var(--model)").attr("stroke", "var(--surface)").attr("stroke-width", 2);
  dots.append("text").attr("class", "label").attr("x", 14).attr("dy", "0.35em").text((d) => pct(d.acc));
  dots.append("rect").attr("x", -16).attr("y", -16).attr("width", 84).attr("height", 32).attr("fill", "transparent")
    .on("pointermove", (e, d) => showTip(e, `<b>${d.label}</b><br>Accuracy ${pct(d.acc)}<br>Caught ${Math.round(d.rec * 100)} of 100 sick people`))
    .on("pointerleave", hideTip);

  let shown = false;
  return {
    enter() {
      if (shown) return;
      shown = true;
      dots.transition().duration(dur(DUR.base)).delay((d, i) => dur(i * 70)).ease(EASE)
        .style("opacity", 1).attr("transform", (d) => `translate(${x(d.acc)},${y(d.id) + y.bandwidth() / 2})`);
      if (baseline) {
        baseG.transition().delay(dur(700)).duration(dur(DUR.fast)).style("opacity", 1);
        baseLine.transition().delay(dur(700)).duration(dur(DUR.base)).ease(EASE).attr("y2", H - m.b);
      }
    },
  };
}
