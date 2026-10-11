// Decision tree: the real depth-3 tree scikit-learn grew from 240,000 people. Test-set
// people drop through its questions like a Plinko board and pile up in the leaf that decides.
import { C, MONO, BODY, clamp, lerp, seg, smooth, rgba, mix, layer, drawGlow, pill } from "./engine.js";

export function treeExplainer(stage, ex) {
  const stats = stage.querySelector(".xp-tree-stats");
  stats.querySelectorAll("[data-tree]").forEach((el) => (el.textContent = `${Math.round(ex.tree.test_metrics[el.dataset.tree] * 100)}%`));
  const nodes = ex.tree.nodes;
  const parent = new Map();
  nodes.forEach((n) => n.children?.forEach((c) => parent.set(c, n.id)));
  // lay out so "yes" always branches right
  const kids = (n) => (n.children ? (n.yes_side === "left" ? [n.children[1], n.children[0]] : n.children) : null);
  const leaves = [];
  (function order(id) { const k = kids(nodes[id]); if (k) { order(k[0]); order(k[1]); } else leaves.push(id); })(0);
  const answer = (from, to) => { const n = nodes[from]; return (n.yes_side === "left" ? n.children[0] : n.children[1]) === to ? "yes" : "no"; };
  const pathTo = (leaf) => { const p = [leaf]; while (parent.has(p[0])) p.unshift(parent.get(p[0])); return p; };
  const people = ex.tree.plinko; // [leaf, has heart disease]
  const N = people.length;
  const paths = people.map(([leaf]) => pathTo(leaf));
  const release = people.map((_, i) => (i / N) * 0.72);
  // pile slots: sick people at the bottom of each pile, so every pile reads like a stacked bar
  const slotOf = new Int32Array(N);
  const pileCount = new Map();
  for (const cls of [1, 0]) people.forEach(([leaf, y], i) => { if (y !== cls) return; const k = pileCount.get(leaf) || 0; slotOf[i] = k; pileCount.set(leaf, k + 1); });
  const hero = ex.examples.find((e) => e.key === "caught");
  const heroPath = pathTo(hero.tree_leaf);
  let L, pos, bin;

  function layout(x) {
    L.fit();
    const P = x.plot;
    const binH = Math.min(150, P.h * 0.26);
    bin = { y: P.y + P.h - binH - 6, h: binH, w: P.w / leaves.length };
    pos = new Map();
    leaves.forEach((id, i) => pos.set(id, { x: P.x + (i + 0.5) * bin.w, y: bin.y - 22 }));
    const top = P.y + 40, gap = (bin.y - 70 - top) / 3;
    (function place(id) {
      const k = kids(nodes[id]);
      if (!k) return;
      k.forEach(place);
      pos.set(id, { x: (pos.get(k[0]).x + pos.get(k[1]).x) / 2, y: top + nodes[id].depth * gap });
    })(0);
    bin.cols = Math.max(4, Math.floor((bin.w - 14) / (P.mobile ? 4 : 5.6)));
    bin.sp = (bin.w - 14) / bin.cols;
  }
  function slotXY(leaf, s) {
    const p = pos.get(leaf);
    const col = s % bin.cols, row = Math.floor(s / bin.cols);
    return [p.x - (bin.w - 14) / 2 + (col + 0.5) * bin.sp, bin.y + bin.h - 8 - (row + 0.5) * bin.sp];
  }
  // where someone is after travelling s (0..1) of their path: fall, then swing toward the branch
  function along(path, s, end, startX) {
    const pts = [[startX, pos.get(path[0]).y - 60], ...path.map((id) => [pos.get(id).x, pos.get(id).y]), end];
    const u = clamp(s) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(u)), f = u - i;
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const e = f * f * (3 - 2 * f), q = 1 - e, cy = lerp(y1, y2, 0.6);
    return [q * q * x1 + 2 * q * e * x1 + e * e * x2, q * q * y1 + 2 * q * e * cy + e * e * y2];
  }

  return {
    init(x) { L = layer(stage); layout(x); },
    resize: layout,
    frame(p, dt, t, x) {
      const ctx = L.ctx;
      L.clear();
      const build = seg(p, -0.6, 0.2);
      const heroT = seg(p, 0.55, 1.5);
      const rain = seg(p, 1.6, 2.75);
      const labels = smooth(seg(p, 2.7, 3.05));
      const small = x.plot.mobile || x.plot.w < 620;

      // branches, with the followed patient's path glowing
      for (const n of nodes) {
        const k = kids(n);
        if (!k) continue;
        const a = pos.get(n.id);
        for (const cid of k) {
          const b = pos.get(cid);
          const g = smooth(seg(build, n.depth * 0.25 + 0.1, n.depth * 0.25 + 0.35));
          if (g <= 0) continue;
          const onHero = heroT > 0 && rain < 0.12 && heroPath.includes(cid) && heroPath.indexOf(cid) <= Math.floor(heroT * (heroPath.length + 1));
          ctx.strokeStyle = onHero ? "rgba(255,236,226,0.95)" : "rgba(255,255,255,0.2)";
          ctx.lineWidth = onHero ? 2.5 : 1.3;
          if (onHero) { ctx.shadowColor = "rgba(255,120,100,0.9)"; ctx.shadowBlur = 12; }
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.bezierCurveTo(a.x, lerp(a.y, b.y, 0.6), b.x, lerp(a.y, b.y, 0.4), lerp(a.x, b.x, g), lerp(a.y, b.y, g));
          ctx.stroke();
          ctx.shadowBlur = 0;
          if (g > 0.9 && !small) {
            ctx.font = MONO; ctx.fillStyle = rgba(C.ink3, g); ctx.textAlign = "center";
            ctx.fillText(answer(n.id, cid), lerp(a.x, b.x, 0.32) + (b.x > a.x ? 10 : -10), lerp(a.y, b.y, 0.32));
          }
        }
      }
      // leaf bins, outlined by their verdict once labeled
      const binA = smooth(seg(build, 0.75, 1));
      if (binA > 0) {
        for (const id of leaves) {
          const q = pos.get(id);
          ctx.globalAlpha = binA;
          ctx.beginPath();
          ctx.roundRect(q.x - (bin.w - 8) / 2, bin.y, bin.w - 8, bin.h, 8);
          ctx.fillStyle = "rgba(255,255,255,0.025)"; ctx.fill();
          ctx.strokeStyle = labels > 0 ? mix(C.ink3, nodes[id].predict ? C.yes : C.no, labels, 0.35 + 0.5 * labels) : "rgba(255,255,255,0.1)";
          ctx.lineWidth = 1 + labels;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // the questions
      for (const n of nodes) {
        if (!n.children) continue;
        const a = smooth(seg(build, n.depth * 0.25, n.depth * 0.25 + 0.2));
        const q = pos.get(n.id);
        if (a > 0) pill(ctx, q.x, q.y, n.question, { font: BODY(small ? 9.5 : 12), h: small ? 20 : 26, pad: small ? 6 : 10, alpha: a });
      }
      // people falling
      const r = x.plot.mobile ? 1.6 : 2.2;
      for (const cls of [0, 1]) {
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          if (people[i][1] !== cls) continue;
          const s = (rain - release[i]) / 0.28;
          if (s <= 0) continue;
          const [px, py] = along(paths[i], s, slotXY(people[i][0], slotOf[i]), pos.get(0).x + ((i * 37) % 41 - 20));
          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, 7);
        }
        ctx.fillStyle = cls ? C.yes : C.noLight;
        ctx.fill();
      }
      // the one patient we follow
      if (heroT > 0 && rain < 0.15) {
        const end = pos.get(hero.tree_leaf);
        const [px, py] = along(heroPath, heroT, [end.x, bin.y + bin.h / 2], pos.get(0).x);
        ctx.globalAlpha = 1 - seg(rain, 0, 0.15);
        drawGlow(ctx, "#ffffff", px, py, 30);
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // leaf verdicts
      if (labels > 0) {
        ctx.globalAlpha = labels;
        ctx.textAlign = "center";
        for (const id of leaves) {
          const n = nodes[id], q = pos.get(id);
          ctx.font = small ? "500 10px ui-monospace, SFMono-Regular, Consolas, monospace" : MONO;
          ctx.fillStyle = C.ink;
          ctx.fillText(`${Math.round((n.yes / n.n) * 100)}% sick`, q.x, bin.y - (small ? 22 : 30));
          ctx.fillStyle = n.predict ? "#ff8f91" : "#8fb5ea";
          ctx.fillText(n.predict ? "flag" : "clear", q.x, bin.y - (small ? 10 : 14));
        }
        ctx.globalAlpha = 1;
      }
      stats.classList.toggle("on", labels > 0.5);
    },
  };
}
