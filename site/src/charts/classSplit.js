// One stacked bar: share of respondents answering No vs Yes.
import * as d3 from "d3";
import { showTip, hideTip } from "./tooltip.js";
import { reducedMotion } from "../scroll/story.js";
import { chartWidth } from "./util.js";

export function classSplitChart(el, ctx) {
  const { No, Yes } = ctx.d.classes;
  const pNo = No / (No + Yes);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const { W, narrow } = chartWidth(el);
  const H = narrow ? 86 : 76; // phones: the two legend entries stack
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
    .attr("aria-label", `${pct(pNo)} answered No (${d3.format(",")(No)}), ${pct(1 - pNo)} answered Yes (${d3.format(",")(Yes)})`);
  const x = d3.scaleLinear().domain([0, 1]).range([0, W]);
  const segs = [
    { k: "No", n: No, v: pNo, x0: 0, c: "var(--no)" },
    { k: "Yes", n: Yes, v: 1 - pNo, x0: pNo, c: "var(--accent)" },
  ];
  const bars = svg.selectAll("rect.seg").data(segs).join("rect").attr("class", "seg")
    .attr("y", 0).attr("height", 30).attr("rx", 4).attr("fill", (d) => d.c)
    .attr("x", (d) => x(d.x0) + (d.k === "Yes" ? 2 : 0)).attr("width", 0)
    .on("pointermove", (e, d) => showTip(e, `<b>${d.k}</b> · ${d3.format(",")(d.n)} people · ${pct(d.v)}`))
    .on("pointerleave", hideTip);
  const lg = svg.append("g").attr("transform", "translate(0,62)");
  segs.forEach((d, i) => {
    const gx = i && !narrow ? W * 0.55 : 0, gy = narrow ? i * 20 - 4 : 0;
    lg.append("rect").attr("x", gx).attr("y", gy - 9).attr("width", 10).attr("height", 10).attr("rx", 3).attr("fill", d.c);
    lg.append("text").attr("class", "label").attr("x", gx + 16).attr("y", gy).text(`${d.k} · ${d3.format(",")(d.n)} · ${pct(d.v)}`);
  });
  return {
    enter() {
      bars.transition().duration(reducedMotion ? 0 : 900).ease(d3.easeCubicOut)
        .attr("width", (d) => Math.max(0, x(d.v) - 2));
    },
  };
}
