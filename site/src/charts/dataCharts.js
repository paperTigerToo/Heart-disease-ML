// Chapter 2: the survey questions, heart-disease rates, and how answers become numbers.
import * as d3 from "d3";
import { svgIn, legend, dataTable, yGrid, dur, pct1, int, featureLabel, once, chartWidth, EASE, DUR } from "./util.js";
import { showTip, hideTip } from "./tooltip.js";

// Feature cards, grouped by kind of question
export function featuresChart(el, ctx) {
  const order = ["Demographics", "Conditions", "Behaviors", "Health status"];
  const groups = d3.group(ctx.d.features, (f) => f.group);
  let i = 0;
  el.insertAdjacentHTML("beforeend", `<div class="feature-groups">${order.map((g) => `
    <div class="fgroup"><h5>${g}</h5><ul>${groups.get(g).map((f) =>
      `<li tabindex="0" style="--i:${i++}"><b>${featureLabel(f.name)}</b><small>${f.description}</small></li>`).join("")}</ul></div>`).join("")}</div>`);
  return { enter: once(() => el.classList.add("in")) };
}

// Heart-disease rate by age group and by self-rated health (same y scale, so they compare)
export function ratesChart(el, ctx) {
  const byName = Object.fromEntries(ctx.d.features.map((f) => [f.name, f]));
  const overall = ctx.d.positive_rate;
  const panels = [
    { title: "By age group", data: byName.AgeCategory.categories,
      short: (v) => (v === "80 or older" ? "80+" : v.split("-")[0]) },
    { title: "By self-rated general health", data: byName.GenHealth.categories, short: (v) => v },
  ];
  const maxRate = d3.max(panels.flatMap((p) => p.data.map((d) => d.rate)));
  const { W, narrow } = chartWidth(el);
  const m = { t: 26, r: 8, b: narrow ? 38 : 26, l: 40 }, H = 144 + m.b; // phones: room for two-line labels
  legend(el, [{ label: "Heart-disease rate", color: "var(--accent)", kind: "square" },
    { label: `All respondents · ${pct1(overall)}`, color: "var(--ink-3)", kind: "dash" }]);
  const bars = [];
  for (const p of panels) {
    const svg = svgIn(el, W, H, `Heart-disease rate ${p.title.toLowerCase()}: ` +
      p.data.map((d) => `${d.value} ${pct1(d.rate)}`).join(", "));
    svg.append("text").attr("class", "label").attr("x", m.l).attr("y", 12).style("fill", "var(--ink)").text(p.title);
    const x = d3.scaleBand().domain(p.data.map((d) => d.value)).range([m.l, W - m.r]).padding(0.18);
    const y = d3.scaleLinear().domain([0, maxRate * 1.08]).range([H - m.b, m.t]);
    yGrid(svg, y, m.l, W - m.r, [0, 0.1, 0.2, 0.3].filter((t) => t <= maxRate * 1.08), (d) => `${Math.round(d * 100)}%`);
    // narrow bands: label every other one (always the last), and break two-word labels over two lines
    const every = x.step() < 26 ? 2 : 1;
    svg.append("g").attr("class", "axis").selectAll("text").data(p.data.filter((d, i) => i % every === 0 || i === p.data.length - 1))
      .join("text").attr("y", H - m.b + 16).attr("text-anchor", "middle")
      .selectAll("tspan").data((d) => (narrow ? p.short(d.value).split(" ") : [p.short(d.value)]).map((w) => [d, w])).join("tspan")
      .attr("x", ([d]) => x(d.value) + x.bandwidth() / 2).attr("dy", (_, i) => (i ? "1.15em" : 0)).text(([, w]) => w);
    const b = svg.append("g").selectAll("rect").data(p.data).join("rect")
      .attr("x", (d) => x(d.value)).attr("width", x.bandwidth()).attr("rx", 3)
      .attr("y", y(0)).attr("height", 0).attr("fill", "var(--accent)")
      .on("pointermove", (e, d) => showTip(e, `<b>${d.value}</b><br>${pct1(d.rate)} have heart disease<br>${int(d.yes)} of ${int(d.n)} people`))
      .on("pointerleave", hideTip);
    // selective direct labels: the extremes
    const ends = [p.data[0], p.data[p.data.length - 1]];
    const lab = svg.append("g").selectAll("text").data(ends).join("text").attr("class", "label")
      .attr("x", (d) => x(d.value) + x.bandwidth() / 2).attr("y", (d) => y(d.rate) - 6)
      .attr("text-anchor", "middle").style("opacity", 0).text((d) => pct1(d.rate));
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(overall)).attr("y2", y(overall))
      .attr("stroke", "var(--ink-3)").attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
    bars.push({ b, y, lab });
  }
  dataTable(el, ["Group", "People", "With heart disease", "Rate"],
    panels.flatMap((p) => p.data.map((d) => [d.value, int(d.n), int(d.yes), pct1(d.rate)])));
  return {
    enter: once(() => bars.forEach(({ b, y, lab }) => {
      b.transition().duration(dur(DUR.base)).delay((d, i) => dur(i * 40)).ease(EASE)
        .attr("y", (d) => y(d.rate)).attr("height", (d) => y(0) - y(d.rate));
      lab.transition().delay(dur(DUR.base)).duration(dur(DUR.fast)).style("opacity", 1);
    })),
  };
}

// One real survey row, before and after encoding
export function encodingChart(el, ctx) {
  const { raw, encoded } = ctx.d.encoding_example;
  const race = Object.keys(encoded).filter((k) => k.startsWith("Race_"));
  const scaled = new Set(["BMI", "PhysicalHealth", "MentalHealth", "SleepTime"]);
  const rows = Object.keys(raw).map((k) => {
    let enc = encoded[k];
    if (k === "Race") enc = `<span class="bits" title="${race.map((r) => r.slice(5)).join(", ")}">${race.map((r) => encoded[r]).join("")}</span>`;
    else if (scaled.has(k)) enc = `${encoded[k]} <small style="color:var(--ink-3);font-weight:400">rescaled</small>`;
    return { k, raw: raw[k], enc };
  });
  el.insertAdjacentHTML("beforeend", `<table class="encode">
    <thead><tr><th>Question</th><th>Answer</th><th></th><th>Model input</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr><td class="q">${featureLabel(r.k)}</td><td>${r.raw}</td><td class="arrow">→</td>
      <td class="enc${r.k === "HeartDisease" ? " target" : ""}" style="--i:${i}">${r.enc}</td></tr>`).join("")}</tbody></table>
    <p class="chart-note">The six race digits are one yes/no column each (${race.map((r) => r.slice(5)).join(", ")}). Heart disease is the answer the model must predict.</p>`);
  return { enter: once(() => el.classList.add("in")) };
}
