// Loads the JSON written by analysis/export_results.py and fills data-bind spans.
import { format } from "d3";

const FILES = ["dataset", "naive", "models", "resampling", "threshold", "meta", "points"];

export async function loadData() {
  const base = import.meta.env.BASE_URL;
  const [d, n, models, r, t, meta, pts] = await Promise.all(
    FILES.map((f) => fetch(`${base}data/${f}.json`).then((res) => {
      if (!res.ok) throw new Error(`data/${f}.json: ${res.status}`);
      return res.json();
    })),
  );
  d.no_share = d.classes.No / d.rows;
  const w = r.methods.find((x) => x.id === "class weights").weights;
  r.weight_ratio = w.Yes / w.No;
  const m = Object.fromEntries(models.models.map((x) => [x.id, x]));
  return { d, n, m, models: models.models, r, t, meta, pts };
}

export function get(ctx, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx);
}

const FORMATS = {
  int: format(","),
  pct0: (v) => `${Math.round(v * 100)}%`,
  pct1: (v) => `${(v * 100).toFixed(1)}%`,
  per100: (v) => `${Math.round(v * 100)}`,
  dec2: (v) => v.toFixed(2),
  x1: (v) => v.toFixed(1),
  date: (v) => new Date(v).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  ptsdrop: (a, b) => `${Math.round((a - b) * 100)}`,
};

export function bindAll(ctx, root = document) {
  root.querySelectorAll("[data-bind]").forEach((el) => {
    const values = el.dataset.bind.split("|").map((p) => get(ctx, p));
    if (values.some((v) => v === undefined)) {
      console.warn("missing data for", el.dataset.bind);
      return;
    }
    const fmt = FORMATS[el.dataset.fmt] ?? String;
    el.textContent = fmt(...values);
  });
}
