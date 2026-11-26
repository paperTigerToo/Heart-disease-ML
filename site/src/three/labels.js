// HTML labels pinned to the dot formations (so text stays crisp and readable).
import * as THREE from "three";
import { format } from "d3";
import { F } from "./formations.js";
import { isMobile } from "./stage.js";

const int = format(",");
const pct = (v) => `${(v * 100).toFixed(1)}%`;

export function createLabels(stage, heart, ctx) {
  const root = document.getElementById("dot-labels");
  const a = heart.built.anchors; // read on every frame: the matrix's anchors move with the cut-off
  const per = isMobile() ? 40 : 10;
  const short = isMobile(); // narrow matrix: abbreviate quadrant labels
  const naive = ctx.m["logreg-22"].metrics;
  const sw = (cls, ring) => `<span class="swatch${ring ? " ring" : ""}" style="background:var(--${cls})"></span>`;
  const weight = (s, f) => (s.from === f ? 1 - s.mix : 0) + (s.to === f ? s.mix : 0);

  const keepOne = Math.round(1 / heart.uniforms.uKeep.value);
  const per100 = (r) => Math.round(r * 100);
  const cm = () => heart.cm; // the matrix's model: the best one, or the explorer's while it's in use
  const defs = [
    { f: F.WAFFLE, at: () => a.waffle.no, html: `${sw("no")}No · ${pct(ctx.d.no_share)}<small>each dot ≈ ${per} people</small>` },
    { f: F.WAFFLE, at: () => a.waffle.yes, html: `${sw("accent")}Yes · ${pct(1 - ctx.d.no_share)}` },
    { f: F.WAFFLE, at: () => a.waffle.missed, below: true, when: (s) => s.yesBoost > 0.6,
      html: `Each Yes weighs about ${ctx.r.weight_ratio.toFixed(1)}× more<small>class weights: same data, new rules</small>` },
    { f: F.FOCUS, at: () => a.focus.top,
      html: `${sw("accent")}Caught by the first model<small>${per100(naive.rec)} of every 100 sick people</small>` },
    { f: F.FOCUS, at: () => a.focus.bottom, below: true,
      html: `${sw("missed")}Missed<small>${100 - per100(naive.rec)} of every 100</small>` },
    { f: F.UNDER, at: () => a.under.kept, html: `${sw("no")}No · 1 in ${keepOne} kept<small>picked at random</small>` },
    { f: F.UNDER, at: () => a.under.yes, below: true, html: `${sw("accent")}Yes · all kept` },
    { f: F.BALANCED, at: () => a.balanced.no, html: `${sw("no")}No · ${int(heart.built.nReal - Math.round(ctx.d.classes.Yes / per))} dots` },
    { f: F.BALANCED, at: () => a.balanced.yes,
      html: `${sw("accent")}Yes · ${int(Math.round(ctx.d.classes.Yes / per))} real<small>${sw("accent", true)}+ ${int(heart.built.nSynth)} synthetic (SMOTE)</small>` },
    { f: F.CONFUSION, at: () => a.confusion.tp, html: () => short ? `${sw("accent")}TP<small>${int(cm().tp)}</small>` : `${sw("accent")}Sick, flagged · TP<small>${int(cm().tp)} test patients</small>` },
    { f: F.CONFUSION, at: () => a.confusion.fn, html: () => short ? `${sw("missed")}FN<small>${int(cm().fn)}</small>` : `${sw("missed")}Sick, missed · FN<small>${int(cm().fn)}</small>` },
    { f: F.CONFUSION, at: () => a.confusion.fp, below: true, html: () => short ? `${sw("no")}FP<small>${int(cm().fp)}</small>` : `${sw("no")}Healthy, flagged · FP<small>${int(cm().fp)}</small>` },
    { f: F.CONFUSION, at: () => a.confusion.tn, below: true, html: () => short ? `${sw("no")}TN<small>${int(cm().tn)}</small>` : `${sw("no")}Healthy, cleared · TN<small>${int(cm().tn)}</small>` },
  ].map((def) => {
    const el = document.createElement("div");
    el.className = `dot-label${def.below ? " below" : ""}`;
    root.appendChild(el);
    return { ...def, el, last: "" };
  });

  const v = new THREE.Vector3();
  return {
    update(state) {
      for (const d of defs) {
        const on = weight(state, d.f) > 0.85 && (!d.when || d.when(state));
        d.el.classList.toggle("on", on);
        if (!on) continue;
        const html = typeof d.html === "function" ? d.html() : d.html; // counts follow the cut-off
        if (html !== d.last) d.el.innerHTML = d.last = html;
        heart.toWorld(...d.at(), v).project(stage.camera);
        // keep labels on screen: shift left when they would run past the right edge
        const left = (v.x * 0.5 + 0.5) * innerWidth;
        const right = document.documentElement.clientWidth; // excludes a desktop scrollbar
        d.el.style.left = `${Math.max(8, Math.min(left, right - d.el.offsetWidth - 12))}px`;
        d.el.style.top = `${(-v.y * 0.5 + 0.5) * stage.h}px`;
      }
    },
  };
}
