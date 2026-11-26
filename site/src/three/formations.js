// Target layouts for the dots. Index order: real No, real Yes, then synthetic Yes (SMOTE).
// Within each group a dot's "rank" decides its fate the same way everywhere:
//   Yes rank < recall      -> caught by the model (true positive)
//   No  rank < false-alarm -> flagged by mistake (false positive)
import { randomLcg, randomNormal, shuffler } from "d3";
import { sampleHeartPoints } from "./heartShape.js";

export const F = { HEART: 0, CLOUD: 1, WAFFLE: 2, BALANCED: 3, CONFUSION: 4, FOCUS: 5, UNDER: 6 };

export function buildFormations({ nNo, nYes, recNaive, recBest, fprBest, keep, mobile }) {
  const nReal = nNo + nYes;
  const nSynth = nNo - nYes;            // SMOTE adds Yes's until the groups are equal
  const N = nReal + nSynth;
  const rand = randomLcg(42);
  const gauss = randomNormal.source(rand)(0, 1);
  const parent = (i) => nNo + ((i - nReal) % nYes);
  const anchors = {};

  // per-dot meta: yes, synthetic, random (stagger), rank within group
  const meta = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const yes = i >= nNo, synth = i >= nReal;
    meta[i * 4] = yes ? 1 : 0;
    meta[i * 4 + 1] = synth ? 1 : 0;
    meta[i * 4 + 2] = rand();
    meta[i * 4 + 3] = synth ? 0 : yes ? (i - nNo) / nYes : i / nNo;
  }

  const make = () => new Float32Array(N * 3);
  const set = (arr, i, x, y, z = 0) => { arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z; };
  const copyParents = (arr) => {
    for (let i = nReal; i < N; i++) {
      const p = parent(i);
      set(arr, i, arr[p * 3], arr[p * 3 + 1], arr[p * 3 + 2]);
    }
  };

  // 0 · heart
  const heart = make();
  heart.set(sampleHeartPoints(nReal));
  copyParents(heart);

  // 1 · cloud: a slow, flattened galaxy of people
  const cloud = make();
  for (let i = 0; i < nReal; i++) {
    const r = Math.abs(gauss()) * 0.9 + 0.15, a = rand() * Math.PI * 2 + r * 1.4;
    set(cloud, i, Math.cos(a) * r * 1.5, gauss() * 0.28 + Math.sin(a) * r * 0.35, Math.sin(a) * r * 0.9);
  }
  copyParents(cloud);

  // 2 · waffle: No's first, then Yes's, filled column by column
  const waffle = make();
  const rows = mobile ? 60 : 150, W = 3.1, cell = W / Math.ceil(nReal / rows), H = rows * cell;
  {
    for (let i = 0; i < nReal; i++) {
      const c = Math.floor(i / rows), r = i % rows;
      set(waffle, i, -W / 2 + (c + 0.5) * cell, H / 2 - (r + 0.5) * cell);
    }
    const colOf = (i) => -W / 2 + Math.floor(i / rows) * cell;
    const caughtEnd = nNo + Math.round(nYes * recNaive);
    anchors.waffle = {
      no: [-W / 2, H / 2], yes: [colOf(nNo), H / 2],
      missed: [colOf(caughtEnd), -H / 2], cell,
    };
  }
  copyParents(waffle);

  // 3 · balanced: No block | Yes block (real + synthetic, mixed together)
  const balanced = make();
  {
    const rows = mobile ? 85 : 170, cols = Math.ceil(nNo / rows), BW = 1.45, gap = 0.2, cell = BW / cols, H = rows * cell;
    const slot = (k, left) => [left + (Math.floor(k / rows) + 0.5) * cell, H / 2 - ((k % rows) + 0.5) * cell];
    for (let i = 0; i < nNo; i++) set(balanced, i, ...slot(i, -BW - gap / 2));
    const yesIdx = shuffler(rand)(Array.from({ length: nYes + nSynth }, (_, k) => nNo + k));
    yesIdx.forEach((idx, k) => set(balanced, idx, ...slot(k, gap / 2)));
    anchors.balanced = { no: [-BW - gap / 2, H / 2], yes: [gap / 2, H / 2] };
  }

  // 4 · confusion matrix as a unit chart: rows = actual, columns = predicted (equal cell size).
  // The shader places each dot from its rank, so a moving cut-off can send people across live.
  // Every block grows outward from the center lines, and the missed and cleared blocks fill in
  // reverse rank order: moving the cut-off only moves the people at the far edge of a block.
  const confusion = (() => {
    const c = mobile ? 0.022 : 0.0125, cols = Math.floor((mobile ? 1.0 : 1.55) / c), g = 0.07;
    const hOf = (n) => Math.ceil(n / cols) * c;
    // nTP, nFP in dots (fractional while the layout eases); k scales tall matrices back into view
    const layout = (nTP, nFP) => {
      const L = { tpH: hOf(nTP), fnH: hOf(nYes - nTP), fpH: hOf(nFP), tnH: hOf(nNo - nFP) };
      const top = g + Math.max(L.tpH, L.fnH), bottom = g + Math.max(L.fpH, L.tnH);
      return { ...L, shift: (bottom - top) / 2, height: top + bottom };
    };
    const anchorsOf = (L, k) => ({
      tp: [(-g - cols * c) * k, (g + L.tpH + L.shift) * k], fn: [g * k, (g + L.fnH + L.shift) * k],
      fp: [(-g - cols * c) * k, (-g - L.fpH + L.shift) * k], tn: [g * k, (-g - L.tnH + L.shift) * k],
    });
    const best = layout(Math.round(nYes * recBest), Math.round(nNo * fprBest));
    anchors.confusion = anchorsOf(best, 1);
    return { c, cols, g, layout, anchorsOf, best };
  })();

  // 5 · focus: the sick step forward as one magnified block (caught first, then missed)
  // while everyone else steps back into the dark
  const focus = make();
  {
    const S = 2, fc = Math.ceil(Math.sqrt(nYes)), fcell = S / fc, top = (Math.ceil(nYes / fc) * fcell) / 2;
    for (let i = 0; i < nNo; i++) set(focus, i, waffle[i * 3], waffle[i * 3 + 1], -3);
    for (let j = 0; j < nYes; j++) set(focus, nNo + j, -S / 2 + ((j % fc) + 0.5) * fcell, top - (Math.floor(j / fc) + 0.5) * fcell);
    anchors.focus = { top: [-S / 2, top], bottom: [-S / 2, -top], zoom: fcell / cell };
  }
  copyParents(focus);

  // 6 · undersampled: a random 1 in 11 of the No's walk over to stand beside the Yes's;
  // the rest keep their waffle spots, and the shader drops them out of the frame
  const under = make();
  {
    const gap = 0.12, kf = Math.fround(keep); // compare at the shader's float precision
    const at = (k, side) => [side * (gap / 2 + (Math.floor(k / rows) + 0.5) * cell), H / 2 - ((k % rows) + 0.5) * cell];
    let kept = 0;
    for (let i = 0; i < nNo; i++) {
      if (meta[i * 4 + 2] < kf) set(under, i, ...at(kept++, -1));
      else set(under, i, waffle[i * 3], waffle[i * 3 + 1]);
    }
    for (let j = 0; j < nYes; j++) set(under, nNo + j, ...at(j, 1));
    anchors.under = { kept: [-gap / 2 - Math.ceil(kept / rows) * cell, H / 2], yes: [gap / 2, -H / 2] };
  }
  copyParents(under);

  return { N, nNo, nYes, nReal, nSynth, meta, formations: { heart, cloud, waffle, balanced, focus, under }, confusion, anchors };
}
