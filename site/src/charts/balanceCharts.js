// Chapter 5: SMOTE + ENN on a real sample of training rows, and class counts per method.
import * as d3 from "d3";
import { svgIn, legend, dataTable, xGrid, dur, int, once, chartWidth, EASE, DUR } from "./util.js";
import { showTip, hideTip } from "./tooltip.js";

// mode "smote": synthetic points appear between their two real parents
// mode "enn":   points ENN would remove fade out
export function smoteChart(el, ctx, { mode = "smote" } = {}) {
  const ill = ctx.r.illustration;
  // the shared sample (points.json): [x, y, z, has disease, synthetic, kept by ENN, parentA, parentB]
  const pts = ctx.pts.points.map(([x, y, , cls, synthetic, kept, pa, pb]) => ({
    x, y, cls, kind: synthetic ? "synthetic" : "original", kept: !!kept, parents: synthetic ? [pa, pb] : null }));
  const { W } = chartWidth(el);
  const H = Math.round((W * 360) / 520), pad = 14;
  const x = d3.scaleLinear().domain(d3.extent(pts, (p) => p.x)).range([pad, W - pad]).nice();
  const y = d3.scaleLinear().domain(d3.extent(pts, (p) => p.y)).range([H - pad, pad]).nice();
  const originals = pts.filter((p) => p.kind === "original");
  const synth = pts.filter((p) => p.kind === "synthetic");
  const removed = pts.filter((p) => !p.kept).length;
  legend(el, [
    { label: `No · ${int(originals.filter((p) => !p.cls).length)}`, color: "var(--no)" },
    { label: `Yes, real · ${int(ill.n_original_yes)}`, color: "var(--accent)" },
    { label: `Yes, synthetic · ${int(ill.n_synthetic)}`, color: "var(--accent)", kind: "ring" },
  ]);
  const svg = svgIn(el, W, H, mode === "smote"
    ? `Scatter of ${int(ill.n_original)} real training rows; SMOTE adds ${int(ill.n_synthetic)} synthetic Yes rows between real Yes neighbors`
    : `ENN removes ${int(removed)} rows whose neighbors mostly disagree with them`);
  svg.append("rect").attr("width", W).attr("height", H).attr("rx", 8).attr("fill", "var(--surface)");
  const links = svg.append("g").attr("stroke", "var(--accent)").attr("stroke-width", 1);
  const base = svg.append("g");
  const nodes = base.selectAll("circle").data(originals.filter((p) => !p.cls).concat(originals.filter((p) => p.cls)))
    .join("circle").attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.y))
    .attr("r", (p) => (p.cls ? 3.2 : 2)).attr("fill", (p) => (p.cls ? "var(--accent)" : "var(--no)"))
    .attr("opacity", (p) => (p.cls ? 1 : 0.55));
  const syn = svg.append("g").selectAll("circle").data(synth).join("circle")
    .attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.y)).attr("r", 3)
    .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 1.2)
    .attr("opacity", mode === "smote" ? 0 : 0.8);
  const all = nodes.merge(syn);
  all.on("pointermove", (e, p) => showTip(e, `<b>${p.kind === "synthetic" ? "Synthetic Yes" : p.cls ? "Real Yes" : "Real No"}</b>` +
    `${p.kept ? "" : "<br>ENN removes it: its neighbors disagree"}`)).on("pointerleave", hideTip);
  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = `A real sample of ${int(ill.n_original)} training rows, flattened to 2D with PCA (${Math.round(d3.sum(ill.explained_variance_2d) * 100)}% of the variation shown). ` +
    (mode === "smote" ? "SMOTE works in all 22 dimensions; straight lines stay straight in this view." : `ENN removes ${int(removed)} of ${int(pts.length)} points.`);
  el.appendChild(note);

  return {
    enter: once(() => {
      if (mode === "smote") {
        const step = dur(3000) / synth.length;
        synth.forEach((p, i) => {
          const [a, b] = p.parents.map((k) => originals[k]);
          links.append("line").attr("x1", x(a.x)).attr("y1", y(a.y)).attr("x2", x(a.x)).attr("y2", y(a.y)).attr("opacity", 0.5)
            .transition().delay(i * step).duration(dur(DUR.fast)).attr("x2", x(b.x)).attr("y2", y(b.y))
            .transition().duration(dur(DUR.base)).attr("opacity", 0).remove();
        });
        syn.transition().delay((p, i) => i * step + dur(200)).duration(dur(DUR.fast)).attr("opacity", 0.8);
      } else {
        all.filter((p) => !p.kept).transition().delay(dur(300)).duration(dur(DUR.base)).ease(EASE)
          .attr("opacity", 0.07).attr("stroke", "var(--missed)");
      }
    }),
  };
}

// Training-set class counts for each balancing method
export function balanceCompareChart(el, ctx) {
  const methods = ctx.r.methods;
  const rows = methods.flatMap((m) => ["No", "Yes"].map((k) => ({ m, k, v: m.counts[k] })));
  const { W, narrow } = chartWidth(el);
  const rowH = narrow ? 60 : 44, m = { t: 6, r: 70, b: 26, l: narrow ? 8 : 150 };
  const above = narrow ? 18 : 0; // phones: each method's name sits above its bars
  const H = m.t + m.b + rowH * methods.length;
  legend(el, [{ label: "No", color: "var(--no)", kind: "square" }, { label: "Yes", color: "var(--accent)", kind: "square" }]);
  const svg = svgIn(el, W, H, "Training rows per class for each balancing method: " +
    methods.map((d) => `${d.label}: ${int(d.counts.No)} No, ${int(d.counts.Yes)} Yes`).join("; "));
  const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.v)]).range([m.l, W - m.r]).nice();
  const y = d3.scaleBand().domain(methods.map((d) => d.id)).range([m.t, H - m.b]).paddingInner(0.3);
  const sub = d3.scaleBand().domain(["No", "Yes"]).range([above, y.bandwidth()]).padding(0.12);
  xGrid(svg, x, m.t, H - m.b, x.ticks(4), d3.format("~s"));
  svg.append("g").selectAll("text").data(methods).join("text").attr("class", "label")
    .attr("x", narrow ? m.l : m.l - 12).attr("y", (d) => (narrow ? y(d.id) + 12 : y(d.id) + y.bandwidth() / 2))
    .attr("dy", narrow ? 0 : "0.35em").attr("text-anchor", narrow ? "start" : "end").style("fill", narrow ? "var(--ink)" : null)
    .text((d) => d.label);
  const bars = svg.append("g").selectAll("rect").data(rows).join("rect")
    .attr("x", m.l).attr("y", (d) => y(d.m.id) + sub(d.k)).attr("height", sub.bandwidth()).attr("rx", 3).attr("width", 0)
    .attr("fill", (d) => (d.k === "No" ? "var(--no)" : "var(--accent)"))
    .on("pointermove", (e, d) => showTip(e, `<b>${d.m.label}</b><br>${d.k}: ${int(d.v)} training rows`)).on("pointerleave", hideTip);
  // selective labels: the Yes count (what each method changes), plus the class-weight note
  const labels = svg.append("g").selectAll("text").data(rows.filter((d) => d.k === "Yes")).join("text").attr("class", "label")
    .attr("x", (d) => x(d.v) + 6).attr("y", (d) => y(d.m.id) + sub("Yes") + sub.bandwidth() / 2).attr("dy", "0.35em")
    .style("opacity", 0).text((d) => (d.m.weights ? `${int(d.v)} × ${(d.m.weights.Yes / d.m.weights.No).toFixed(1)} weight` : int(d.v)));
  dataTable(el, ["Method", "No rows", "Yes rows"], methods.map((d) => [d.label, int(d.counts.No), int(d.counts.Yes)]));
  return {
    enter: once(() => {
      bars.transition().duration(dur(DUR.base)).delay((d, i) => dur(i * 50)).ease(EASE).attr("width", (d) => x(d.v) - m.l);
      labels.transition().delay(dur(DUR.base)).duration(dur(DUR.fast)).style("opacity", 1);
    }),
  };
}
