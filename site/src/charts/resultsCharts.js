// Chapter 7: leaderboard, before→after trade-off, ROC/PR curves, feature importance.
import * as d3 from "d3";
import { svgIn, legend, dataTable, xGrid, yGrid, drawIn, dur, pct1, featureLabel, once, chartWidth, EASE, DUR } from "./util.js";
import { showTip, hideTip } from "./tooltip.js";

const SORTS = [
  { key: "acc", label: "Accuracy" }, { key: "rec", label: "Recall" },
  { key: "f1", label: "F1" }, { key: "pr_auc", label: "PR-AUC" },
];
const kindOf = (mdl) => (mdl.id === "dummy" ? "baseline" : mdl.balancing === "none" ? "plain" : "balanced");
const KIND = {
  plain: { label: "No balancing", color: "var(--ink-3)", kind: "dot" },
  balanced: { label: "Balanced (resampling, weights or threshold)", color: "var(--model)", kind: "dot" },
  baseline: { label: "Always say No", color: "var(--ink-2)", kind: "ring" },
};

export function leaderboardChart(el, ctx) {
  const models = ctx.models;
  el.insertAdjacentHTML("beforeend", `<div class="sorter" role="group" aria-label="Sort models by">${SORTS.map((s, i) =>
    `<button class="chip" data-key="${s.key}" aria-pressed="${i === 0}">${s.label}</button>`).join("")}</div>`);
  legend(el, Object.values(KIND));
  const { W, narrow } = chartWidth(el);
  const rowH = narrow ? 34 : 17, m = { t: 6, r: 52, b: 26, l: narrow ? 8 : 230 };
  const dy = narrow ? 7 : 0, fs = narrow ? "12px" : "11px"; // phones: name above, dot below
  const H = m.t + m.b + rowH * models.length;
  const svg = svgIn(el, W, H, "All models ranked by the selected metric");
  const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
  const y = d3.scaleBand().range([m.t, H - m.b]).padding(0.2);
  xGrid(svg, x, m.t, H - m.b, [0, 0.25, 0.5, 0.75, 1], (d) => `${d * 100}%`);
  const rows = svg.append("g").selectAll("g").data(models, (d) => d.id).join("g");
  rows.append("text").attr("class", "label").attr("x", narrow ? 0 : -10).attr("y", narrow ? -6 : 0)
    .attr("dy", narrow ? 0 : "0.35em").attr("text-anchor", narrow ? "start" : "end")
    .style("font-size", fs).style("font-weight", (d) => (d.id === "dummy" ? 600 : 500))
    .style("fill", (d) => (d.id === "dummy" ? "var(--ink)" : null)).text((d) => d.label);
  rows.append("line").attr("class", "stem").attr("y1", dy).attr("y2", dy).attr("stroke", "var(--line)").attr("stroke-width", 1);
  rows.append("circle").attr("cy", dy).attr("r", 5).attr("stroke-width", 2)
    .attr("fill", (d) => (kindOf(d) === "baseline" ? "var(--surface)" : KIND[kindOf(d)].color))
    .attr("stroke", (d) => (kindOf(d) === "baseline" ? "var(--ink-2)" : "var(--surface)"));
  rows.append("text").attr("class", "val label").attr("y", dy).attr("dy", "0.35em").style("font-size", fs);
  rows.append("rect").attr("x", -m.l).attr("y", -rowH / 2).attr("width", W).attr("height", rowH).attr("fill", "transparent")
    .on("pointermove", (e, d) => showTip(e, `<b>${d.label}</b><br>${SORTS.map((s) => `${s.label} ${pct1(d.metrics[s.key])}`).join("<br>")}`))
    .on("pointerleave", hideTip);

  function sortBy(key, animate) {
    y.domain(models.slice().sort((a, b) => b.metrics[key] - a.metrics[key]).map((d) => d.id));
    const tr = (sel) => (animate ? sel.transition().duration(dur(DUR.slow)).ease(EASE) : sel);
    tr(rows).attr("transform", (d) => `translate(${m.l},${y(d.id) + y.bandwidth() / 2})`);
    tr(rows.select("circle")).attr("cx", (d) => x(d.metrics[key]) - m.l);
    tr(rows.select(".stem")).attr("x2", (d) => x(d.metrics[key]) - m.l);
    tr(rows.select(".val")).attr("x", (d) => x(d.metrics[key]) - m.l + 9).text((d) => pct1(d.metrics[key]));
    el.querySelectorAll(".sorter .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.key === key));
    svg.attr("aria-label", `All ${models.length} models ranked by ${SORTS.find((s) => s.key === key).label}`);
  }
  el.querySelector(".sorter").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) sortBy(b.dataset.key, true);
  });
  sortBy("acc", false);
  dataTable(el, ["Model", ...SORTS.map((s) => s.label)], models.map((d) => [d.label, ...SORTS.map((s) => pct1(d.metrics[s.key]))]));
  return {
    // the punchline: start sorted by accuracy, then flip to recall
    enter: once(() => setTimeout(() => sortBy("rec", true), dur(900))), // a beat to read the accuracy order first
  };
}

// Dumbbells: logistic regression before → after each balancing method
export function tradeoffChart(el, ctx) {
  const M = ctx.m;
  const rows = [
    { id: "logreg-classweight", before: "logreg-sample", label: "Class weights" },
    { id: "logreg-rus", before: "logreg-sample", label: "Undersampling" },
    { id: "logreg-smote", before: "logreg-sample", label: "SMOTE" },
    { id: "logreg-smoteenn", before: "logreg-sample", label: "SMOTEENN" },
    { id: "logreg-threshold", before: "logreg-22", label: `Threshold ${ctx.t.chosen_threshold.toFixed(2)}` },
  ];
  legend(el, [{ label: "Before (no balancing)", color: "var(--ink-3)", kind: "ring" }, { label: "After", color: "var(--model)" }]);
  const panels = [{ key: "acc", title: "Accuracy" }, { key: "rec", title: "Recall" }];
  const { W, narrow } = chartWidth(el);
  const m = { t: 22, b: 24, l: 108 }, rowH = 32, gapP = 44;
  const block = m.t + m.b + rowH * rows.length; // one panel's height
  const pw = narrow ? W - m.l - 18 : 170, H = narrow ? block * 2 + 14 : block; // phones: the panels stack
  const svg = svgIn(el, W, H, "Logistic regression before and after each balancing method: " +
    rows.map((r) => `${r.label}: accuracy ${pct1(M[r.before].metrics.acc)} to ${pct1(M[r.id].metrics.acc)}, recall ${pct1(M[r.before].metrics.rec)} to ${pct1(M[r.id].metrics.rec)}`).join("; "));
  const y = d3.scaleBand().domain(rows.map((r) => r.id)).range([m.t, block - m.b]).padding(0.3);
  const after = [];
  panels.forEach((p, i) => {
    const x0 = narrow ? m.l : m.l + i * (pw + gapP);
    const pg = svg.append("g").attr("transform", `translate(0,${narrow ? i * (block + 14) : 0})`);
    if (narrow || i === 0) {
      pg.append("g").selectAll("text").data(rows).join("text").attr("class", "label")
        .attr("x", m.l - 12).attr("y", (r) => y(r.id) + y.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "end").text((r) => r.label);
    }
    const x = d3.scaleLinear().domain([0, 1]).range([x0, x0 + pw]);
    pg.append("text").attr("class", "label").attr("x", x0).attr("y", 12).style("fill", "var(--ink)").text(p.title);
    xGrid(pg, x, m.t, block - m.b, [0, 0.5, 1], (d) => `${d * 100}%`);
    const g = pg.append("g").selectAll("g").data(rows).join("g").attr("transform", (r) => `translate(0,${y(r.id) + y.bandwidth() / 2})`);
    const b = (r) => M[r.before].metrics[p.key], a = (r) => M[r.id].metrics[p.key];
    const line = g.append("line").attr("x1", (r) => x(b(r))).attr("x2", (r) => x(b(r))).attr("stroke", "var(--ink-3)").attr("stroke-width", 2);
    g.append("circle").attr("cx", (r) => x(b(r))).attr("r", 5).attr("fill", "var(--surface)").attr("stroke", "var(--ink-3)").attr("stroke-width", 2);
    const dot = g.append("circle").attr("cx", (r) => x(b(r))).attr("r", 5.5).attr("fill", "var(--model)").attr("stroke", "var(--surface)").attr("stroke-width", 2)
      .on("pointermove", (e, r) => showTip(e, `<b>${r.label}</b><br>${p.title}: ${pct1(b(r))} → ${pct1(a(r))}`)).on("pointerleave", hideTip);
    after.push({ line, dot, x, a });
  });
  dataTable(el, ["Method", "Accuracy before", "Accuracy after", "Recall before", "Recall after"],
    rows.map((r) => [r.label, pct1(M[r.before].metrics.acc), pct1(M[r.id].metrics.acc), pct1(M[r.before].metrics.rec), pct1(M[r.id].metrics.rec)]));
  return {
    enter: once(() => after.forEach(({ line, dot, x, a }) => {
      line.transition().duration(dur(DUR.base)).delay((r, i) => dur(i * 80)).ease(EASE).attr("x2", (r) => x(a(r)));
      dot.transition().duration(dur(DUR.base)).delay((r, i) => dur(i * 80)).ease(EASE).attr("cx", (r) => x(a(r)));
    })),
  };
}

// ROC and precision-recall curves, small multiples sharing one legend
export function curvesChart(el, ctx) {
  const ids = ["logreg-22", "rf-22", "knn-22"];
  const series = ids.map((id, i) => ({ id, m: ctx.m[id], color: `var(--series-${i + 1})` }));
  const prBase = ctx.d.positive_rate;
  legend(el, [...series.map((s) => ({ label: `${s.m.family} · ROC ${s.m.metrics.roc_auc.toFixed(2)}, PR ${s.m.metrics.pr_auc.toFixed(2)}`, color: s.color, kind: "line" })),
    { label: "Coin flip / always No", color: "var(--ink-3)", kind: "dash" }]);
  const { W, narrow } = chartWidth(el);
  const m = { t: 22, l: 38, b: 34 }, gapP = 46;
  const pw = narrow ? W - m.l - 14 : 216, ph = pw, block = m.t + ph + m.b + (narrow ? 16 : 0);
  const svg = svgIn(el, W, narrow ? block * 2 : block, "ROC and precision-recall curves for logistic regression, random forest and KNN");
  const paths = [];
  const panels = [
    { key: "roc", title: "ROC curve", xl: "False-positive rate", yl: "Recall", base: [[0, 0], [1, 1]] },
    { key: "pr", title: "Precision–recall", xl: "Recall", yl: "Precision", base: [[0, prBase], [1, prBase]] },
  ];
  panels.forEach((p, i) => {
    const x0 = narrow ? m.l : m.l + i * (pw + gapP);
    const pg = svg.append("g").attr("transform", `translate(0,${narrow ? i * block : 0})`);
    const x = d3.scaleLinear().domain([0, 1]).range([x0, x0 + pw]);
    const y = d3.scaleLinear().domain([0, 1]).range([m.t + ph, m.t]);
    pg.append("text").attr("class", "label").attr("x", x0).attr("y", 12).style("fill", "var(--ink)").text(p.title);
    yGrid(pg, y, x0, x0 + pw, [0, 0.5, 1], (d) => (i === 0 || narrow ? `${d * 100}%` : ""));
    xGrid(pg, x, m.t + ph, m.t + ph, [0, 0.5, 1], (d) => `${d * 100}%`).select(".grid").remove();
    pg.append("text").attr("class", "label").attr("x", x0 + pw / 2).attr("y", m.t + ph + 32).attr("text-anchor", "middle").text(p.xl);
    const line = d3.line().x((d) => x(d[0])).y((d) => y(d[1]));
    pg.append("path").attr("d", line(p.base)).attr("stroke", "var(--ink-3)").attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4").attr("fill", "none");
    for (const s of series) {
      paths.push(pg.append("path").attr("d", line(s.m.curves[p.key])).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2));
    }
    // hover: read every series at the pointer's x
    const cross = pg.append("line").attr("y1", m.t).attr("y2", m.t + ph).attr("stroke", "var(--ink-3)").style("display", "none");
    pg.append("rect").attr("x", x0).attr("y", m.t).attr("width", pw).attr("height", ph).attr("fill", "transparent")
      .on("pointermove", function (e) {
        const k = Math.round(Math.max(0, Math.min(1, x.invert(d3.pointer(e, this)[0]))) * 100);
        cross.style("display", null).attr("x1", x(k / 100)).attr("x2", x(k / 100));
        showTip(e, `<b>${p.xl} ${k}%</b><br>${series.map((s) => `${s.m.family}: ${p.yl.toLowerCase()} ${pct1(s.m.curves[p.key][k][1])}`).join("<br>")}`);
      })
      .on("pointerleave", () => { cross.style("display", "none"); hideTip(); });
  });
  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = `Rebalancing barely moves these curves (logistic regression ROC-AUC ${ctx.m["logreg-22"].metrics.roc_auc.toFixed(3)} before, ${ctx.m["logreg-smoteenn"].metrics.roc_auc.toFixed(3)} with SMOTEENN): it changes where the model draws the line, not how well it ranks people.`;
  el.appendChild(note);
  return { enter: once(() => paths.forEach((p, i) => drawIn(p, 1200, (i % 3) * 150))) };
}

// Random-forest importance before vs. after SMOTEENN (top 10)
export function importanceChart(el, ctx) {
  const before = new Map(ctx.n.importance.map((d) => [d.feature, d.importance]));
  const after = new Map(ctx.r.importance_after_smoteenn.map((d) => [d.feature, d.importance]));
  const top = [...before.keys()].sort((a, b) => Math.max(after.get(b), before.get(b)) - Math.max(after.get(a), before.get(a))).slice(0, 10);
  legend(el, [{ label: "Before (original data)", color: "var(--ink-3)", kind: "ring" }, { label: "After SMOTEENN", color: "var(--model)" }]);
  const { W, narrow } = chartWidth(el);
  const rowH = 24, m = { t: 6, r: 20, b: 26, l: 170 };
  const H = m.t + m.b + rowH * top.length;
  const svg = svgIn(el, W, H, "Random-forest feature importance before and after SMOTEENN: " +
    top.map((f) => `${featureLabel(f)} ${before.get(f).toFixed(3)} to ${after.get(f).toFixed(3)}`).join(", "));
  const x = d3.scaleLinear().domain([0, d3.max(top, (f) => Math.max(before.get(f), after.get(f)))]).nice().range([m.l, W - m.r]);
  const y = d3.scaleBand().domain(top).range([m.t, H - m.b]).padding(0.3);
  xGrid(svg, x, m.t, H - m.b, x.ticks(narrow ? 2 : 4), d3.format(".2f"));
  svg.append("g").selectAll("text").data(top).join("text").attr("class", "label")
    .attr("x", m.l - 12).attr("y", (f) => y(f) + y.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "end").text(featureLabel);
  const g = svg.append("g").selectAll("g").data(top).join("g").attr("transform", (f) => `translate(0,${y(f) + y.bandwidth() / 2})`);
  const line = g.append("line").attr("x1", (f) => x(before.get(f))).attr("x2", (f) => x(before.get(f))).attr("stroke", "var(--ink-3)").attr("stroke-width", 2);
  g.append("circle").attr("cx", (f) => x(before.get(f))).attr("r", 5).attr("fill", "var(--surface)").attr("stroke", "var(--ink-3)").attr("stroke-width", 2);
  const dot = g.append("circle").attr("cx", (f) => x(before.get(f))).attr("r", 5.5).attr("fill", "var(--model)").attr("stroke", "var(--surface)").attr("stroke-width", 2)
    .on("pointermove", (e, f) => showTip(e, `<b>${featureLabel(f)}</b><br>Before ${before.get(f).toFixed(3)}<br>After ${after.get(f).toFixed(3)}`)).on("pointerleave", hideTip);
  dataTable(el, ["Feature", "Before", "After SMOTEENN"], top.map((f) => [featureLabel(f), before.get(f).toFixed(3), after.get(f).toFixed(3)]));
  return {
    enter: once(() => {
      line.transition().duration(dur(DUR.base)).delay((f, i) => dur(i * 50)).ease(EASE).attr("x2", (f) => x(after.get(f)));
      dot.transition().duration(dur(DUR.base)).delay((f, i) => dur(i * 50)).ease(EASE).attr("cx", (f) => x(after.get(f)));
    }),
  };
}
