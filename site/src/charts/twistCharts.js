// Chapters 3–4: accuracy vs. number of features, the people the first model missed,
// and why (predicted risk scores by true class).
import * as d3 from "d3";
import { svgIn, legend, dataTable, xGrid, yGrid, drawIn, dur, pct1, int, featureLabel, once } from "./util.js";
import { showTip, hideTip } from "./tooltip.js";

export function accuracyFeaturesChart(el, ctx) {
  const data = ctx.n.accuracy_vs_features;
  const W = 520, H = 230, m = { t: 14, r: 16, b: 34, l: 46 };
  const svg = svgIn(el, W, H, `Random-forest accuracy with the top 1 to ${data.length} features: from ${pct1(data[0].acc)} to ${pct1(data[data.length - 1].acc)}, never far from 90%`);
  const x = d3.scaleLinear().domain([1, data.length]).range([m.l, W - m.r]);
  const [lo, hi] = d3.extent(data, (d) => d.acc);
  const y = d3.scaleLinear().domain([lo - 0.004, hi + 0.004]).nice().range([H - m.b, m.t]);
  yGrid(svg, y, m.l, W - m.r, y.ticks(4), (d) => pct1(d));
  xGrid(svg, x, H - m.b, H - m.b, [1, 5, 10, 15, 20, 22], (d) => d).select(".grid").remove();
  svg.append("text").attr("class", "label").attr("x", (m.l + W - m.r) / 2).attr("y", H - 2).attr("text-anchor", "middle")
    .text("Number of top features used");
  const line = svg.append("path").datum(data).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2)
    .attr("d", d3.line().x((d) => x(d.k)).y((d) => y(d.acc)));
  // hover: crosshair + tooltip
  const cross = svg.append("g").style("display", "none");
  cross.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "var(--ink-3)");
  const dot = cross.append("circle").attr("r", 5).attr("fill", "var(--accent)").attr("stroke", "var(--surface)").attr("stroke-width", 2);
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("pointermove", function (e) {
      const k = Math.round(x.invert(d3.pointer(e, this)[0]));
      const d = data[Math.max(1, Math.min(data.length, k)) - 1];
      cross.style("display", null).attr("transform", `translate(${x(d.k)},0)`);
      dot.attr("cy", y(d.acc));
      showTip(e, `<b>Top ${d.k} feature${d.k > 1 ? "s" : ""}</b> (added ${featureLabel(d.feature)})<br>Accuracy ${pct1(d.acc)}<br>Recall ${pct1(d.rec)}`);
    })
    .on("pointerleave", () => { cross.style("display", "none"); hideTip(); });
  dataTable(el, ["Features", "Added", "Accuracy", "Recall"], data.map((d) => [d.k, featureLabel(d.feature), pct1(d.acc), pct1(d.rec)]));
  return { enter: once(() => drawIn(line, 1400)) };
}

// 100 sick people: how many the first model caught
export function missedChart(el, ctx) {
  const naive = ctx.m["logreg-22"];
  const caught = Math.round(naive.metrics.rec * 100);
  const W = 520, cols = 20, s = 22, gap = 4, rows = 5;
  const H = rows * (s + gap) + 4;
  legend(el, [{ label: `Caught · ${caught}`, color: "var(--accent)" }, { label: `Missed · ${100 - caught}`, color: "var(--missed)", kind: "ring" }]);
  const svg = svgIn(el, W, H, `Of every 100 people with heart disease, the first model caught ${caught} and missed ${100 - caught}`);
  const x0 = (W - cols * (s + gap)) / 2;
  const cells = svg.append("g").selectAll("circle").data(d3.range(100)).join("circle")
    .attr("cx", (i) => x0 + (i % cols) * (s + gap) + s / 2).attr("cy", (i) => Math.floor(i / cols) * (s + gap) + s / 2 + 2)
    .attr("r", s / 2 - 1).attr("fill", "var(--surface-2)").attr("stroke", "none").attr("stroke-width", 2.5)
    .on("pointermove", (e, i) => showTip(e, i < caught ? "Caught: flagged as at risk" : "Missed: told they're fine"))
    .on("pointerleave", hideTip);
  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = `In the test set: ${int(naive.cm.tp)} caught and ${int(naive.cm.fn)} missed out of ${int(naive.cm.tp + naive.cm.fn)} people with heart disease.`;
  el.appendChild(note);
  return {
    enter: once(() => cells.transition().duration(dur(300)).delay((i) => dur(i * 18))
      .attr("fill", (i) => (i < caught ? "var(--accent)" : "transparent"))
      .attr("stroke", (i) => (i < caught ? "none" : "var(--missed)"))
      .attr("r", (i) => (i < caught ? s / 2 - 1 : s / 2 - 2.5))),
  };
}

// Predicted risk scores, as a share of each true class, with the 0.5 cut-off
export function probabilitiesChart(el, ctx) {
  const h = ctx.t.histogram;
  const share = (arr) => { const n = d3.sum(arr); return arr.map((v) => v / n); };
  const series = [
    { key: "No", label: "Healthy (No)", color: "var(--no)", v: share(h.no) },
    { key: "Yes", label: "Heart disease (Yes)", color: "var(--accent)", v: share(h.yes) },
  ];
  const yesBelow = d3.sum(h.yes.filter((_, i) => h.edges[i + 1] <= 0.5)) / d3.sum(h.yes);
  const W = 520, H = 220, m = { t: 14, r: 12, b: 34, l: 46 };
  legend(el, [...series.map((s) => ({ label: s.label, color: s.color, kind: "line" })),
    { label: "Cut-off 0.5", color: "var(--ink-2)", kind: "dash" }]);
  const svg = svgIn(el, W, H, `Predicted risk scores: ${pct1(yesBelow)} of people with heart disease score below the 0.5 cut-off`);
  const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
  const y = d3.scaleSqrt().domain([0, d3.max(series, (s) => d3.max(s.v))]).range([H - m.b, m.t]).nice();
  yGrid(svg, y, m.l, W - m.r, [0, 0.05, 0.2, 0.4].filter((t) => t <= y.domain()[1]), (d) => `${Math.round(d * 100)}%`);
  xGrid(svg, x, H - m.b, H - m.b, [0, 0.25, 0.5, 0.75, 1], (d) => d).select(".grid").remove();
  svg.append("text").attr("class", "label").attr("x", (m.l + W - m.r) / 2).attr("y", H - 2).attr("text-anchor", "middle")
    .text("Predicted risk score (logistic regression)");
  const mid = (i) => (h.edges[i] + h.edges[i + 1]) / 2;
  const area = d3.area().x((d, i) => x(mid(i))).y0(y(0)).y1((d) => y(d)).curve(d3.curveMonotoneX);
  const lineGen = d3.line().x((d, i) => x(mid(i))).y((d) => y(d)).curve(d3.curveMonotoneX);
  const paths = series.map((s) => {
    svg.append("path").datum(s.v).attr("d", area).attr("fill", s.color).attr("opacity", 0.12);
    return svg.append("path").datum(s.v).attr("d", lineGen).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2);
  });
  svg.append("line").attr("x1", x(0.5)).attr("x2", x(0.5)).attr("y1", m.t).attr("y2", H - m.b)
    .attr("stroke", "var(--ink-2)").attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
  svg.append("text").attr("class", "label").attr("x", x(0.5) + 8).attr("y", m.t + 12)
    .text(`${pct1(yesBelow)} of sick people score below 0.5`);
  const cross = svg.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "var(--ink-3)").style("display", "none");
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("pointermove", function (e) {
      const i = Math.max(0, Math.min(h.no.length - 1, Math.floor(x.invert(d3.pointer(e, this)[0]) * h.no.length)));
      cross.style("display", null).attr("x1", x(mid(i))).attr("x2", x(mid(i)));
      showTip(e, `<b>Score ${h.edges[i].toFixed(2)}–${h.edges[i + 1].toFixed(2)}</b><br>Healthy: ${pct1(series[0].v[i])}<br>Heart disease: ${pct1(series[1].v[i])}`);
    })
    .on("pointerleave", () => { cross.style("display", "none"); hideTip(); });
  dataTable(el, ["Score range", "Healthy (share)", "Heart disease (share)"],
    h.no.map((_, i) => [`${h.edges[i].toFixed(2)}–${h.edges[i + 1].toFixed(2)}`, pct1(series[0].v[i]), pct1(series[1].v[i])]));
  return { enter: once(() => paths.forEach((p, i) => drawIn(p, 1300, i * 250))) };
}
