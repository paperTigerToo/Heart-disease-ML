// AdaBoost: 200 real people on the 2D map, drawn bigger as their weight grows. Each stump
// slices the map once; whoever it gets wrong swells; then all the stumps vote.
// The boosting runs live in the browser on this sample.
import { min, max, shuffle, range } from "d3";
import { C, clamp, lerp, seg, smooth, rgba, rng, layer, drawGlow, equalScale } from "./engine.js";

// AdaBoost with decision stumps (one cut each), recording every round
function adaboost(X, y, rounds) {
  const n = X.length, nf = X[0].length;
  const yy = Int8Array.from(y, (v) => (v ? 1 : -1));
  const w = new Float64Array(n).fill(1 / n);
  const sorted = range(nf).map((f) => Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => X[a][f] - X[b][f]));
  const out = [];
  for (let t = 0; t < rounds; t++) {
    let best = null, totalNeg = 0;
    for (let i = 0; i < n; i++) if (yy[i] < 0) totalNeg += w[i];
    for (let f = 0; f < nf; f++) {
      const s = sorted[f];
      let leftPos = 0, leftNeg = 0;
      for (let k = 0; k < n - 1; k++) {
        const i = s[k];
        yy[i] > 0 ? (leftPos += w[i]) : (leftNeg += w[i]);
        if (X[s[k + 1]][f] === X[i][f]) continue;
        const thr = (X[i][f] + X[s[k + 1]][f]) / 2;
        const err = leftPos + (totalNeg - leftNeg); // "Yes when x > thr": wrong on left Yes and right No
        if (!best || err < best.err) best = { f, thr, pol: 1, err };
        if (1 - err < best.err) best = { f, thr, pol: -1, err: 1 - err };
      }
    }
    const eps = clamp(best.err, 1e-6, 1 - 1e-6);
    const alpha = 0.5 * Math.log((1 - eps) / eps);
    const before = w.slice(), wrong = new Uint8Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const h = X[i][best.f] > best.thr ? best.pol : -best.pol;
      wrong[i] = h !== yy[i] ? 1 : 0;
      w[i] *= Math.exp(-alpha * yy[i] * h);
      total += w[i];
    }
    for (let i = 0; i < n; i++) w[i] /= total;
    out.push({ ...best, eps, alpha, before, after: w.slice(), wrong });
  }
  const score = (x, upTo) => {
    let s = 0;
    for (let t = 0; t < Math.min(out.length, Math.floor(upTo)); t++) s += out[t].alpha * (x[out[t].f] > out[t].thr ? out[t].pol : -out[t].pol);
    return s;
  };
  return { rounds: out, score };
}

export function boostingExplainer(stage, ex) {
  const rt = stage.querySelector(".r-t"), re = stage.querySelector(".r-e"), ra = stage.querySelector(".r-a"), racc = stage.querySelector(".r-acc");
  const P = ex.pca.points;
  const rand = rng(17);
  const pick = (cls) => shuffle(range(P.length).filter((i) => !P[i][4] && P[i][3] === cls &&
    P[i][0] > -5.2 && P[i][0] < 2.4 && P[i][1] > -3.3 && P[i][1] < 2.5), rand).slice(0, 100);
  const ids = [...pick(1), ...pick(0)];
  const X = ids.map((i) => [P[i][0], P[i][1]]), Y = ids.map((i) => P[i][3]);
  const n = X.length;
  const ROUNDS = 30, FIRST = 8;
  const boost = adaboost(X, Y, ROUNDS);
  const DOM = { x: [min(X, (d) => d[0]) - 0.3, max(X, (d) => d[0]) + 0.3], y: [min(X, (d) => d[1]) - 0.3, max(X, (d) => d[1]) + 0.3] };
  const nx = 220, ny = Math.round((nx * (DOM.y[1] - DOM.y[0])) / (DOM.x[1] - DOM.x[0]));
  const maps = new Map();
  const maxAlpha = max(boost.rounds, (d) => d.alpha);
  let L, sc, base;

  // the team's verdict for every spot after `rounds` stumps (cached per round count)
  function mapFor(rounds) {
    const key = Math.round(rounds);
    if (maps.has(key)) return maps.get(key);
    const cv = Object.assign(document.createElement("canvas"), { width: nx, height: ny });
    const g = cv.getContext("2d"), img = g.createImageData(nx, ny);
    const vals = new Float32Array(nx * ny);
    let mx = 1e-6;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = boost.score([lerp(DOM.x[0], DOM.x[1], (i + 0.5) / nx), lerp(DOM.y[1], DOM.y[0], (j + 0.5) / ny)], key);
      vals[j * nx + i] = v;
      mx = Math.max(mx, Math.abs(v));
    }
    for (let k = 0; k < nx * ny; k++) {
      const t = Math.tanh((vals[k] / mx) * 2.2), to = t < 0 ? [26, 58, 108] : [138, 28, 38], f = Math.abs(t) ** 0.7;
      img.data[k * 4] = 17 + (to[0] - 17) * f; img.data[k * 4 + 1] = 19 + (to[1] - 19) * f; img.data[k * 4 + 2] = 26 + (to[2] - 26) * f; img.data[k * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    maps.set(key, cv);
    return cv;
  }
  function layout(x) { L.fit(); sc = equalScale(DOM.x, DOM.y, { ...x.plot, h: x.plot.h - 34 }, 8); base = x.plot.mobile ? 2.4 : 3.2; }
  // which round the story is on, and how far through its cut / mistake rings / reweighting
  function timeline(p) {
    if (p < 2.4) return { k: 0, line: smooth(seg(p, 0.45, 1.0)), ring: smooth(seg(p, 0.85, 1.2)), upd: smooth(seg(p, 1.5, 2.1)) };
    const rp = seg(p, 2.4, 3.55) * (FIRST - 1); // rounds 2..FIRST
    if (rp >= FIRST - 1) return { k: FIRST - 1, line: 1, ring: 1, upd: 1 };
    const k = 1 + Math.floor(rp), f = rp - Math.floor(rp);
    return { k, line: smooth(seg(f, 0, 0.45)), ring: smooth(seg(f, 0.3, 0.6)), upd: smooth(seg(f, 0.55, 1)) };
  }

  return {
    init(x) { L = layer(stage); layout(x); },
    resize: layout,
    frame(p, dt, t, x) {
      const ctx = L.ctx;
      L.clear();
      const B = sc.box;
      const appear = smooth(seg(p, -0.6, 0.0));
      const vote = smooth(seg(p, 3.6, 3.95));
      const ff = lerp(FIRST, ROUNDS, smooth(seg(p, 3.7, 4.1)));
      const tl = timeline(p);
      const r = boost.rounds[tl.k];

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.strokeRect(B.x + 0.5, B.y + 0.5, B.w - 1, B.h - 1);
      if (vote > 0) {
        ctx.globalAlpha = vote;
        ctx.drawImage(mapFor(ff), B.x, B.y, B.w, B.h);
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(B.x, B.y, B.w, B.h); ctx.clip();
      // the current stump tints its two halves
      if (tl.line > 0 && vote < 1) {
        const cut = r.f === 0 ? sc.x(r.thr) : sc.y(r.thr);
        const yesHigh = r.pol === 1; // "Yes when x > thr"
        ctx.globalAlpha = 0.14 * tl.line * (1 - vote);
        if (r.f === 0) {
          ctx.fillStyle = yesHigh ? C.no : C.yes; ctx.fillRect(B.x, B.y, cut - B.x, B.h);
          ctx.fillStyle = yesHigh ? C.yes : C.no; ctx.fillRect(cut, B.y, B.x + B.w - cut, B.h);
        } else {
          ctx.fillStyle = yesHigh ? C.yes : C.no; ctx.fillRect(B.x, B.y, B.w, cut - B.y);
          ctx.fillStyle = yesHigh ? C.no : C.yes; ctx.fillRect(B.x, cut, B.w, B.y + B.h - cut);
        }
        ctx.globalAlpha = 1;
      }
      // every cut so far: the newest slices in, older ones fade back
      const shownCuts = vote > 0 ? Math.floor(ff) : tl.k + (tl.line > 0 ? 1 : 0);
      for (let k = 0; k < shownCuts; k++) {
        const s = boost.rounds[k];
        const current = k === tl.k && vote <= 0;
        const g = current ? tl.line : 1;
        ctx.strokeStyle = current ? "rgba(255,244,236,0.95)" : `rgba(255,236,226,${(0.12 + 0.25 * (s.alpha / maxAlpha)) * (1 - vote * 0.5)})`;
        ctx.lineWidth = current ? 2 : 1;
        ctx.beginPath();
        let tip;
        if (s.f === 0) { const cx = sc.x(s.thr); tip = [cx, lerp(B.y + B.h, B.y, g)]; ctx.moveTo(cx, B.y + B.h); }
        else { const cy = sc.y(s.thr); tip = [lerp(B.x, B.x + B.w, g), cy]; ctx.moveTo(B.x, cy); }
        ctx.lineTo(...tip);
        ctx.stroke();
        if (current && g < 1) drawGlow(ctx, "#ffd9c9", tip[0], tip[1], 18);
      }
      ctx.restore();

      // people, sized by weight
      const w = tl.upd === 0 ? r.before : Float64Array.from(r.before, (v, i) => lerp(v, r.after[i], tl.upd));
      const radiusOf = (i) => base * clamp(Math.sqrt(w[i] * n), 0.45, 4.2);
      for (const cls of [0, 1]) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (Y[i] !== cls) continue;
          const rr = radiusOf(i) * appear, px = sc.x(X[i][0]), py = sc.y(X[i][1]);
          ctx.moveTo(px + rr, py); ctx.arc(px, py, rr, 0, 7);
        }
        ctx.fillStyle = cls ? "rgba(229,56,59,0.82)" : "rgba(91,147,220,0.75)";
        ctx.fill();
      }
      // the current stump's mistakes
      if (tl.ring > 0 && vote < 1) {
        ctx.strokeStyle = rgba("#ffffff", 0.95 * tl.ring * (1 - vote));
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (!r.wrong[i]) continue;
          const rr = radiusOf(i) + 3, px = sc.x(X[i][0]), py = sc.y(X[i][1]);
          ctx.moveTo(px + rr, py); ctx.arc(px, py, rr, 0, 7);
        }
        ctx.stroke();
      }
      // each stump's say, as a strip of bars
      if (vote > 0) {
        const m = Math.floor(ff), bw = Math.min(14, B.w / ROUNDS - 2);
        ctx.fillStyle = rgba(C.ember, 0.4 + 0.6 * vote);
        for (let k = 0; k < m; k++) {
          const h = (boost.rounds[k].alpha / maxAlpha) * 22;
          ctx.fillRect(B.x + k * (bw + 2), B.y + B.h + 28 - h, bw, h);
        }
      }

      const shown = vote > 0 ? Math.floor(ff) : tl.line > 0 ? tl.k + 1 : 0;
      rt.textContent = shown;
      re.textContent = shown && vote <= 0 ? r.eps.toFixed(3) : "—";
      ra.textContent = shown && vote <= 0 ? r.alpha.toFixed(2) : "—";
      if (shown) {
        let ok = 0;
        for (let i = 0; i < n; i++) ok += (boost.score(X[i], shown) > 0 ? 1 : 0) === Y[i] ? 1 : 0;
        racc.innerHTML = `team accuracy <b>${Math.round((ok / n) * 100)}%</b>`;
      } else racc.textContent = "";
    },
  };
}
