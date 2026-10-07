// Target layouts for the dots. Index order: real No, real Yes, then synthetic Yes (SMOTE).
// Within each group a dot's "rank" decides its fate the same way everywhere:
//   Yes rank < recall      -> caught by the model (true positive)
//   No  rank < false-alarm -> flagged by mistake (false positive)
import { randomLcg, randomNormal, shuffler } from "d3";
import { sampleHeartPoints } from "./heartShape.js";

export const F = { HEART: 0, CLOUD: 1, WAFFLE: 2, BALANCED: 3, CONFUSION: 4 };

export function buildFormations({ nNo, nYes, recNaive, recBest, fprBest, mobile }) {
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
  {
    const rows = mobile ? 60 : 150, cols = Math.ceil(nReal / rows), W = 3.1, cell = W / cols, H = rows * cell;
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

  // 4 · confusion matrix as a unit chart: rows = actual, columns = predicted (equal cell size)
  const confusion = make();
  {
    const c = mobile ? 0.022 : 0.0125, Q = mobile ? 1.0 : 1.55, cols = Math.floor(Q / c), g = 0.07;
    const nTP = Math.round(nYes * recBest), nFP = Math.round(nNo * fprBest);
    const hOf = (n) => Math.ceil(n / cols) * c;
    const tpH = hOf(nTP), tnH = hOf(nNo - nFP), fpH = hOf(nFP);
    const shift = -((g + tpH) + (-(g + tnH))) / 2; // center the whole matrix vertically
    // dx, dy: direction the block grows away from the center lines
    const place = (k, dx, dy) => {
      const col = k % cols, row = Math.floor(k / cols);
      return [dx * (g + (col + 0.5) * c), dy * (g + (row + 0.5) * c) + shift];
    };
    let tp = 0, fn = 0, fp = 0, tn = 0;
    for (let i = 0; i < nReal; i++) {
      const yes = i >= nNo, rank = meta[i * 4 + 3];
      if (yes) set(confusion, i, ...(rank < recBest ? place(tp++, -1, 1) : place(fn++, 1, 1)));
      else set(confusion, i, ...(rank < fprBest ? place(fp++, -1, -1) : place(tn++, 1, -1)));
    }
    anchors.confusion = {
      tp: [-g - cols * c, g + tpH + shift], fn: [g, g + tpH + shift],
      fp: [-g - cols * c, -g - fpH + shift], tn: [g, -g - tnH + shift], width: cols * c, g, shift,
    };
  }
  copyParents(confusion);

  return { N, nReal, nSynth, meta, formations: [heart, cloud, waffle, balanced, confusion], anchors };
}
