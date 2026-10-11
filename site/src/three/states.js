// What the dots do at each story stop (keyed by data-stop in index.html).
// ox/oy are layout units: ox 0 = screen center, ox 1 = center of the area right of the text.
import { F } from "./formations.js";

const DEFAULTS = {
  f: F.HEART, ox: 1, oy: 0, s: 1, beat: 1, loosen: 0, reveal: 0,
  missedNaive: 0, missedBest: 0, synth: 0, under: 0, yesBoost: 0,
  quadOn: 0, quad: [1, 1, 1, 1], dim: 1,
};

// quadrant brightness order: TP, FN, FP, TN
const LOW = 0.12;
const CAUGHT = [3, 3, 0.14, 0.14]; // results: spotlight sick people, caught (crimson) vs missed (amber)
const RAW = {
  hero: { ox: 0.62, oy: 0.05, s: 1.05 },
  topic: { s: 0.85, loosen: 0.25 },
  "data-intro": { f: F.CLOUD },
  "data-features": { f: F.CLOUD },
  "data-rates": { f: F.CLOUD, reveal: 1 },
  "data-encoding": { f: F.CLOUD, reveal: 1 },
  "first-models": { s: 0.9 },
  "first-accuracy": { s: 0.95 },
  "first-features": { s: 0.9 },
  "twist-split": { f: F.WAFFLE, reveal: 1 },
  "twist-baseline": { f: F.WAFFLE, reveal: 1 },
  "twist-missed": { f: F.WAFFLE, reveal: 1, missedNaive: 1 },
  "twist-why": { f: F.WAFFLE, reveal: 1, missedNaive: 1 },
  "balance-rule": { f: F.WAFFLE, reveal: 1 },
  "balance-under": { f: F.WAFFLE, reveal: 1, under: 1 },
  "balance-smote": { f: F.BALANCED, reveal: 1, synth: 1 },
  "balance-enn": { f: F.BALANCED, reveal: 1, synth: 1 },
  "balance-weights": { f: F.WAFFLE, reveal: 1, yesBoost: 1 },
  "score-matrix": { f: F.CONFUSION, reveal: 1, missedBest: 1, quadOn: 1 },
  "score-accuracy": { f: F.CONFUSION, reveal: 1, missedBest: 1, quadOn: 1, quad: [1, LOW, LOW, 1] },
  "score-precision": { f: F.CONFUSION, reveal: 1, missedBest: 1, quadOn: 1, quad: [1, LOW, 1, LOW] },
  "score-recall": { f: F.CONFUSION, reveal: 1, missedBest: 1, quadOn: 1, quad: [1, 1, LOW, LOW] },
  "score-f1": { f: F.CONFUSION, reveal: 1, missedBest: 1, quadOn: 1, quad: [1, 1, 1, LOW] },
  "score-auc": { f: F.CONFUSION, reveal: 1, missedBest: 1, quadOn: 1 },
  "score-threshold": { f: F.CONFUSION, reveal: 1, missedBest: 1, quadOn: 1, dim: 0.3 }, // the explorer is a different model: let it lead
  "models-intro": { s: 0.85, loosen: 0.2 },
  models: { s: 0.85, dim: 0 }, // the explainers have their own stages; the heart steps back
  "results-leaderboard": { reveal: 1, missedBest: 1, quadOn: 1, quad: CAUGHT, s: 0.95 },
  "results-tradeoff": { reveal: 1, missedBest: 1, quadOn: 1, quad: CAUGHT, s: 0.95 },
  "results-curves": { reveal: 1, missedBest: 1, quadOn: 1, quad: CAUGHT, s: 0.9 },
  "results-importance": { reveal: 1, missedBest: 1, quadOn: 1, quad: CAUGHT, s: 0.9 },
  takeaways: { reveal: 0.35, s: 0.9 },
  about: { s: 0.6, oy: 0.25, dim: 0.45 },
};

export const STATES = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, { ...DEFAULTS, ...v }]));
export const NUMERIC = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === "number" && k !== "f");
