// Neural network: the actual trained pipeline (scaler -> PCA to 18 -> 100 ReLU -> 1). A real
// patient's answers travel through it as pulses of light; neurons glow when they fire.
import { max } from "d3";
import { C, MONO, clamp, lerp, seg, smooth, rgba, mix, sigmoid, layer, drawGlow } from "./engine.js";

export function neuralExplainer(stage, ex) {
  const M = ex.mlp, FEAT = ex.features;
  function forward(x) {
    const s = x.map((v, i) => (v - M.scaler_mean[i]) / M.scaler_scale[i]);
    const c = M.pca.map((row) => row.reduce((acc, w, i) => acc + w * (s[i] - M.pca_mean[i]), 0));
    const h = M.b1.map((b, j) => Math.max(0, b + c.reduce((acc, ci, k) => acc + ci * M.W1[k][j], 0)));
    const o = M.b2 + h.reduce((acc, hj, j) => acc + hj * M.W2[j], 0);
    return { s, c, h, p: sigmoid(o) };
  }
  const chips = stage.querySelectorAll(".chip");
  const rf = stage.querySelector(".r-f"), rp = stage.querySelector(".r-p"), rv = stage.querySelector(".r-v");
  const byKey = Object.fromEntries(ex.examples.map((e) => [e.key, e]));
  let key = "borderline", F = forward(byKey[key].x), flows;
  let L, nodes, web;

  // the strongest signals in each layer for this patient
  function buildFlows() {
    const l1 = [], l2 = [], l3 = [];
    F.s.forEach((s, i) => M.pca.forEach((row, k) => l1.push({ a: i, b: k, v: (s - M.pca_mean[i]) * row[i] })));
    F.c.forEach((c, k) => M.W1[k].forEach((w, j) => { if (F.h[j] > 0) l2.push({ a: k, b: j, v: c * w }); }));
    F.h.forEach((h, j) => { if (h > 0) l3.push({ a: j, b: 0, v: h * M.W2[j] }); });
    const top = (arr, n) => arr.sort((p, q) => Math.abs(q.v) - Math.abs(p.v)).slice(0, n);
    flows = [top(l1, 140), top(l2, 320), top(l3, 100)];
    for (const fl of flows) {
      const m = max(fl, (d) => Math.abs(d.v)) || 1;
      fl.forEach((d, i) => { d.n = Math.abs(d.v) / m; d.ph = (i * 0.618) % 1; });
    }
  }
  buildFlows();
  chips.forEach((b) => b.addEventListener("click", () => {
    key = b.dataset.p;
    F = forward(byKey[key].x);
    buildFlows();
    chips.forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));

  function layout(x) {
    L.fit();
    const P = x.plot;
    const labelW = P.mobile ? 24 : 150;
    const X = [P.x + labelW + 10, P.x + labelW + (P.w - labelW) * 0.36, P.x + labelW + (P.w - labelW) * 0.7, P.x + P.w - 30];
    const colY = (n, i, pad) => P.y + pad + ((P.h - 60 - pad * 2) * (i + 0.5)) / n;
    nodes = [
      FEAT.map((_, i) => ({ x: X[0], y: colY(FEAT.length, i, 6) })),
      M.pca.map((_, i) => ({ x: X[1], y: colY(M.components, i, 40) })),
      M.b1.map((_, i) => ({ x: X[2], y: colY(M.hidden, i, 0) })),
      [{ x: X[3], y: P.y + (P.h - 60) / 2 }],
    ];
    // every connection, drawn once into a static layer
    web = Object.assign(document.createElement("canvas"), { width: L.cv.width, height: L.cv.height });
    const g = web.getContext("2d");
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    g.lineWidth = 0.6;
    const layers = [[0, 1, (a, b) => M.pca[b][a]], [1, 2, (a, b) => M.W1[a][b]], [2, 3, (a) => M.W2[a]]];
    for (const [from, to, wt] of layers) {
      let mx = 0;
      nodes[from].forEach((_, a) => nodes[to].forEach((_, b) => (mx = Math.max(mx, Math.abs(wt(a, b))))));
      nodes[from].forEach((na, a) => nodes[to].forEach((nb, b) => {
        const w = wt(a, b) / mx;
        g.strokeStyle = w > 0 ? `rgba(255,140,130,${0.03 + 0.16 * Math.abs(w)})` : `rgba(120,160,230,${0.03 + 0.16 * Math.abs(w)})`;
        g.beginPath(); g.moveTo(na.x, na.y); g.lineTo(nb.x, nb.y); g.stroke();
      }));
    }
  }

  return {
    init(x) { L = layer(stage); layout(x); },
    resize: layout,
    frame(p, dt, t, x) {
      const ctx = L.ctx, P = x.plot;
      L.clear();
      const appear = smooth(seg(p, -0.6, 0.0));
      const fl = [seg(p, 0.5, 1.5), seg(p, 1.5, 2.5), seg(p, 2.5, 3.3)];
      const lit = [appear, smooth(seg(p, 0.7, 1.3)), smooth(seg(p, 1.7, 2.3)), smooth(seg(p, 2.75, 3.2))];
      const back = smooth(seg(p, 3.5, 3.95));

      ctx.globalAlpha = appear * (0.55 + 0.45 * back);
      ctx.drawImage(web, 0, 0, L.W, L.H);
      ctx.globalAlpha = 1;

      // forward pulses along the strongest connections of the layer being computed
      fl.forEach((f, li) => {
        const env = Math.sin(Math.PI * clamp(f)) ** 0.6;
        if (env <= 0.01) return;
        for (const d of flows[li]) {
          const a = nodes[li][d.a], b = nodes[li + 1][d.b];
          for (let rep = 0; rep < 2; rep++) {
            const u = (t * 0.55 + d.ph + rep * 0.5) % 1;
            ctx.globalAlpha = env * (0.25 + 0.75 * d.n);
            drawGlow(ctx, d.v > 0 ? C.yes : "#6aa0ea", lerp(a.x, b.x, u), lerp(a.y, b.y, u), 4 + 7 * d.n);
          }
          ctx.strokeStyle = d.v > 0 ? `rgba(255,120,110,${0.25 * env * d.n})` : `rgba(110,160,240,${0.25 * env * d.n})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
      // backpropagation: amber pulses running right to left
      if (back > 0) {
        const all = [...flows[2].map((d) => [2, d]), ...flows[1].slice(0, 160).map((d) => [1, d]), ...flows[0].slice(0, 80).map((d) => [0, d])];
        for (const [li, d] of all) {
          const a = nodes[li][d.a], b = nodes[li + 1][d.b];
          const u = 1 - ((t * 0.45 + d.ph + li * 0.33) % 1);
          ctx.globalAlpha = back * (0.2 + 0.6 * d.n);
          drawGlow(ctx, C.missed, lerp(a.x, b.x, u), lerp(a.y, b.y, u), 3 + 6 * d.n);
        }
        ctx.globalAlpha = 1;
      }

      // inputs: brighter = further from average for this patient
      const sMax = max(F.s, Math.abs) || 1, cMax = max(F.c, Math.abs) || 1, hMax = max(F.h) || 1;
      ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.font = "500 11px Inter, system-ui, sans-serif";
      nodes[0].forEach((nd, i) => {
        const v = F.s[i] - M.pca_mean[i], m = clamp(Math.abs(v) / sMax);
        ctx.globalAlpha = lit[0];
        if (m > 0.15) drawGlow(ctx, v > 0 ? C.yes : C.no, nd.x, nd.y, 6 + 10 * m);
        ctx.fillStyle = mix("#2a2e3a", v > 0 ? "#ff9a9c" : "#9cc0f0", m);
        ctx.beginPath(); ctx.arc(nd.x, nd.y, 3.6, 0, 7); ctx.fill();
        if (!P.mobile) { ctx.fillStyle = rgba(C.ink2, 0.5 + 0.5 * m); ctx.fillText(ex.labels[FEAT[i]], nd.x - 10, nd.y); }
      });
      // principal components
      nodes[1].forEach((nd, k) => {
        const v = F.c[k], m = clamp(Math.abs(v) / cMax);
        ctx.globalAlpha = appear;
        ctx.fillStyle = "#2a2e3a"; ctx.beginPath(); ctx.arc(nd.x, nd.y, 4.2, 0, 7); ctx.fill();
        ctx.globalAlpha = lit[1];
        if (m > 0.1) drawGlow(ctx, v > 0 ? C.yes : C.no, nd.x, nd.y, 6 + 12 * m);
        ctx.fillStyle = mix("#2a2e3a", v > 0 ? "#ff9a9c" : "#9cc0f0", m);
        ctx.beginPath(); ctx.arc(nd.x, nd.y, 4.2, 0, 7); ctx.fill();
      });
      // hidden neurons: only the ones with a positive total fire
      let firing = 0;
      nodes[2].forEach((nd, j) => {
        const h = F.h[j];
        if (h > 0) firing++;
        ctx.globalAlpha = appear;
        ctx.fillStyle = "#22252f"; ctx.beginPath(); ctx.arc(nd.x, nd.y, 2.2, 0, 7); ctx.fill();
        if (h > 0 && lit[2] > 0) {
          ctx.globalAlpha = lit[2];
          drawGlow(ctx, "#ffd9a8", nd.x, nd.y, 4 + 10 * clamp(h / hMax));
          ctx.fillStyle = "#fff1dc"; ctx.beginPath(); ctx.arc(nd.x, nd.y, 2.4, 0, 7); ctx.fill();
        }
      });
      // the output neuron as a filling ring
      const o = nodes[3][0], R = P.mobile ? 16 : 22;
      ctx.globalAlpha = appear;
      ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(o.x, o.y, R, 0, 7); ctx.stroke();
      if (lit[3] > 0) {
        const pv = F.p * lit[3], col = F.p > 0.5 ? C.yes : C.missed;
        ctx.strokeStyle = col; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(o.x, o.y, R, -Math.PI / 2, -Math.PI / 2 + pv * Math.PI * 2); ctx.stroke(); ctx.lineCap = "butt";
        drawGlow(ctx, col, o.x, o.y, R * 2.2 * lit[3]);
        ctx.font = "600 13px ui-monospace, SFMono-Regular, Consolas, monospace"; ctx.fillStyle = C.ink; ctx.textAlign = "center";
        ctx.fillText(pv.toFixed(2), o.x, o.y + 1);
      }
      ctx.font = MONO; ctx.fillStyle = C.ink3; ctx.textAlign = "center";
      const lab = P.y + P.h - 40;
      [["22 answers", nodes[0][0].x], ["18 components", nodes[1][0].x], ["100 neurons", nodes[2][0].x], ["output", o.x]]
        .forEach(([s, lx]) => ctx.fillText(s, lx, lab));
      ctx.globalAlpha = 1;

      rf.textContent = lit[2] > 0.5 ? `${firing} of 100` : "—";
      rp.textContent = lit[3] > 0.5 ? `p = ${F.p.toFixed(2)}` : "—";
      const e = byKey[key];
      rv.innerHTML = lit[3] > 0.5 ? `really <b class="${e.has_disease ? "y" : "n"}">${e.has_disease ? "had" : "did not have"}</b> heart disease` : "";
    },
  };
}
