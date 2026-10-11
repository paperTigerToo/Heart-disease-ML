// "Inside the models": loads explainers.json (written by analysis/export_explainers.py)
// and wires each explainer section in index.html to its animation.
import { explainer } from "./engine.js";
import { logisticExplainer } from "./logistic.js";
import { treeExplainer } from "./tree.js";
import { knnExplainer } from "./knn.js";
import { boostingExplainer } from "./boosting.js";
import { neuralExplainer } from "./neural.js";

const EXPLAINERS = {
  "xp-logistic": logisticExplainer,
  "xp-tree": treeExplainer,
  "xp-knn": knnExplainer,
  "xp-boosting": boostingExplainer,
  "xp-neural": neuralExplainer,
};

export async function initExplainers() {
  const res = await fetch(`${import.meta.env.BASE_URL}data/explainers.json`);
  if (!res.ok) throw new Error(`data/explainers.json: ${res.status}`);
  const ex = await res.json();
  for (const [id, make] of Object.entries(EXPLAINERS)) {
    const section = document.getElementById(id);
    if (section) explainer(section, make(section.querySelector(".xp-stage"), ex));
  }
}
