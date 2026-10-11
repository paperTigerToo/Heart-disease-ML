import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/sections.css";
import "./styles/charts.css";
import "./styles/explainers.css";
import * as d3 from "d3";
import { loadData, bindAll, get } from "./data.js";
import { initStory, initReveals, initDrag, reducedMotion } from "./scroll/story.js";
import { initNav } from "./scroll/nav.js";
import { createStage } from "./three/stage.js";
import { createHeart } from "./three/heart.js";
import { createLabels } from "./three/labels.js";
import { drawFallbackHeart } from "./three/fallback.js";

// ?debug: phone review overlay (frame rate, viewport, errors, an on-page console)
if (new URLSearchParams(location.search).has("debug")) import("./debug.js");

const loader = document.getElementById("loader");
const hideLoader = () => {
  loader.classList.add("done");
  loader.setAttribute("aria-busy", "false");
};

async function main() {
  // the charts chunk downloads while the data loads and the heart starts
  const chartsModule = import("./charts/registry.js");
  const ctx = await loadData();
  bindAll(ctx);
  initReveals();

  const story = initStory();
  initNav(story.scrollTo);

  const charts = new Map();
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

  // ?no3d previews the fallback a browser without WebGL would get
  const stage = new URLSearchParams(location.search).has("no3d") ? null : createStage(document.getElementById("gl"));
  if (stage) {
    const heart = createHeart(stage, ctx);
    const labels = createLabels(stage, heart, ctx);
    const drag = initDrag();
    let first = true;
    setTimeout(hideLoader, 2500); // background tabs pause animation frames; never strand the loader
    stage.loop((dt, t) => {
      const state = story.update();
      heart.update(state, t, drag.value);
      labels.update(state);
      // gentle parallax in the hero only
      const k = reducedMotion ? 0 : Math.max(0, 1 - scrollY / innerHeight);
      stage.camera.position.x += (drag.mx * 0.18 * k - stage.camera.position.x) * 0.05;
      stage.camera.position.y += (-drag.my * 0.12 * k - stage.camera.position.y) * 0.05;
      stage.camera.lookAt(0, 0, 0);
      if (first) { first = false; requestAnimationFrame(hideLoader); }
    });
  } else {
    document.documentElement.classList.add("no-webgl");
    drawFallbackHeart();
    const tick = () => { story.update(); requestAnimationFrame(tick); };
    tick();
    hideLoader();
  }

  // charts live inside steps and animate in when their step becomes current
  const { CHARTS } = await chartsModule;
  document.querySelectorAll(".chart-card[data-chart]").forEach((el) => {
    const make = CHARTS[el.dataset.chart];
    if (!make) return console.warn("no chart registered for", el.dataset.chart);
    try {
      charts.set(el, make(el, ctx));
    } catch (err) {
      console.error(`chart "${el.dataset.chart}" failed`, err);
    }
  });
  // a step may already be current (e.g. after a reload mid-page)
  document.querySelectorAll("[data-stop].active .chart-card[data-chart]").forEach((el) => charts.get(el)?.enter());
  story.refresh();

  // "Inside the models": its own chunk and data file, fetched once the rest is ready
  try {
    const { initExplainers } = await import("./explainers/index.js");
    await initExplainers(ctx);
    story.refresh();
  } catch (err) {
    console.error("model explainers failed", err); // the rest of the story still works
  }
}

main().catch((err) => {
  console.error(err);
  loader.classList.remove("done");
  document.getElementById("loader-text").textContent = `Couldn't load the data (${err.message}). Try refreshing.`;
});
