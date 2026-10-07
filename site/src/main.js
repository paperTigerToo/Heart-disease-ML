import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/sections.css";
import * as d3 from "d3";
import { loadData, bindAll, get } from "./data.js";
import { initStory, initReveals, initDrag, reducedMotion } from "./scroll/story.js";
import { createStage } from "./three/stage.js";
import { createHeart } from "./three/heart.js";
import { createLabels } from "./three/labels.js";
import { accuracyChart } from "./charts/accuracy.js";
import { classSplitChart } from "./charts/classSplit.js";

const CHARTS = {
  "accuracy-first": (el, ctx) => accuracyChart(el, ctx),
  "accuracy-baseline": (el, ctx) => accuracyChart(el, ctx, { baseline: true }),
  "class-split": classSplitChart,
};

async function main() {
  const ctx = await loadData();
  bindAll(ctx);
  initReveals();

  // charts live inside steps and animate in when their step becomes current
  const charts = new Map();
  document.querySelectorAll(".chart-card[data-chart]").forEach((el) => {
    const make = CHARTS[el.dataset.chart];
    if (make) charts.set(el, make(el, ctx));
  });

  const story = initStory();
  story.onStop((name, stepEl) => {
    stepEl.querySelectorAll(".chart-card[data-chart]").forEach((el) => charts.get(el)?.enter());
    const counter = stepEl.querySelector("[data-count]");
    if (counter && !counter.dataset.done) {
      counter.dataset.done = "1";
      const to = get(ctx, counter.dataset.count);
      d3.select(counter).transition().duration(reducedMotion ? 0 : 1400).ease(d3.easeCubicOut)
        .tween("text", () => (t) => (counter.innerHTML = `${(to * 100 * t).toFixed(1)}<small>%</small>`));
    }
  });

  const stage = createStage(document.getElementById("gl"));
  if (!stage) {
    document.documentElement.classList.add("no-webgl");
    const tick = () => { story.update(); requestAnimationFrame(tick); };
    tick();
    return;
  }
  const heart = createHeart(stage, ctx);
  const labels = createLabels(stage, heart, ctx);
  const drag = initDrag();

  stage.loop((dt, t) => {
    const state = story.update();
    heart.update(state, t, drag.value);
    labels.update(state);
    // gentle parallax in the hero only
    const k = Math.max(0, 1 - scrollY / innerHeight);
    stage.camera.position.x += (drag.mx * 0.18 * k - stage.camera.position.x) * 0.05;
    stage.camera.position.y += (-drag.my * 0.12 * k - stage.camera.position.y) * 0.05;
    stage.camera.lookAt(0, 0, 0);
  });
}

main().catch((err) => {
  console.error(err);
  document.querySelector("main").insertAdjacentHTML("afterbegin",
    `<p class="todo" style="position:fixed;top:12px;left:12px;z-index:60">Couldn't load the data: ${err.message}</p>`);
});
