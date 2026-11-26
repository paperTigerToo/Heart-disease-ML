// Logistic regression: a real test-set patient scored by the real model. Each answer
// pushes the score like a waterfall, the total drops onto the S-curve, the cut-off decides.
import { scaleLinear, range, sum } from "d3";
import { C, MONO, BODY, clamp, lerp, seg, smooth, easeOut, easeInOut, sigmoid, rng, layer, drawGlow, pill } from "./engine.js";

function answerLabel(name, a) {
  const yes = (k) => a[k] === "Yes";
  switch (name) {
    case "BMI": return `BMI ${a.BMI}`;
    case "Smoking": return yes("Smoking") ? "Smoker" : "Non-smoker";
    case "AlcoholDrinking": return yes("AlcoholDrinking") ? "Heavy drinker" : "Not a heavy drinker";
    case "Stroke": return yes("Stroke") ? "Had a stroke" : "No stroke";
    case "PhysicalHealth": return `${a.PhysicalHealth} poor physical-health days`;
    case "MentalHealth": return `${a.MentalHealth} poor mental-health days`;
    case "DiffWalking": return yes("DiffWalking") ? "Difficulty walking" : "Walks without difficulty";
    case "Sex": return a.Sex;
    case "AgeCategory": return `Age ${a.AgeCategory}`;
    case "Diabetic": return a.Diabetic === "Yes" ? "Diabetic" : a.Diabetic.startsWith("No, b") ? "Borderline diabetes" : "Not diabetic";
    case "PhysicalActivity": return yes("PhysicalActivity") ? "Exercises" : "No exercise";
    case "GenHealth": return `${a.GenHealth} health`;
    case "SleepTime": return `${a.SleepTime} h of sleep`;
    case "Asthma": return yes("Asthma") ? "Asthma" : "No asthma";
    case "KidneyDisease": return yes("KidneyDisease") ? "Kidney disease" : "No kidney disease";
    case "SkinCancer": return yes("SkinCancer") ? "Skin cancer" : "No skin cancer";
    default: return name;
  }
}

export function logisticExplainer(stage, ex) {
  const LR = ex.logreg;
  // z = (b + w·mean) + w·(x - mean): start from an average person, then each answer's difference
  const Z0 = LR.intercept + sum(LR.features, (f, j) => f.w * LR.x_mean[j]);
  function contributions(e) {
    const rows = [];
    let race = 0;
    LR.features.forEach((f, j) => {
      const c = f.w * (e.x[j] - LR.x_mean[j]);
      if (f.encoding === "race") race += c;
      else rows.push({ label: answerLabel(f.name, e.answers), c });
    });
    rows.push({ label: e.answers.Race, c: race });
    rows.sort((p, q) => Math.abs(q.c) - Math.abs(p.c));
    const top = rows.slice(0, 8), rest = rows.slice(8);
    top.push({ label: `${rest.length} smaller answers`, c: sum(rest, (r) => r.c) });
    let cum = Z0;
    top.forEach((r) => { r.from = cum; cum += r.c; r.to = cum; });
    return { rows: top, z: cum };
  }

  const chips = stage.querySelectorAll(".chip");
  const byKey = Object.fromEntries(ex.examples.map((e) => [e.key, e]));
  let key = "borderline", data = contributions(byKey[key]), switchedAt = -10;
  let L, box, xz, wf, sg;
  const rand = rng(9);
  const crowd = LR.sample.map(([z, y]) => ({ z, y, d: rand(), j: rand() - 0.5 }));
  const sick = crowd.filter((d) => d.y === 1);
  const sickBelow = sick.filter((d) => sigmoid(d.z) < 0.5).length / sick.length;

  chips.forEach((b) => b.addEventListener("click", () => {
    key = b.dataset.p;
    data = contributions(byKey[key]);
    switchedAt = performance.now() / 1000;
    chips.forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));

  function layout(x) {
    L.fit();
    const P = x.plot;
    const labelW = P.mobile ? 128 : 200;
    box = { x: P.x + labelW, w: P.w - labelW - 18 };
    xz = scaleLinear().domain([-4.6, 2.2]).range([box.x, box.x + box.w]);
    wf = { y: P.y + 44, h: P.h * 0.48 };
    sg = { y: wf.y + wf.h + 46, h: P.y + P.h - (wf.y + wf.h + 46) - 26 };
  }
  const yp = (p) => sg.y + sg.h - p * sg.h;

  return {
    init(x) { L = layer(stage); layout(x); },
    resize: layout,
    frame(p, dt, t, x) {
      const ctx = L.ctx;
      L.clear();
      const e = byKey[key];
      const rows = data.rows;
      const intro = smooth(seg(p, -0.6, -0.05));
      let bars = seg(p, 0.5, 1.6) * rows.length;
      if (t - switchedAt < 1.2) bars = Math.min(bars, (t - switchedAt) * rows.length);
      const curve = smooth(seg(p, 1.65, 2.05));
      const drop = easeInOut(seg(p, 2.0, 2.4));
      const cut = smooth(seg(p, 2.7, 3.0));
      const lower = easeInOut(seg(p, 3.05, 3.45));
      const rain = seg(p, 3.6, 4.15);
      const thr = lerp(0.5, 0.18, lower);
      const rowH = Math.min(26, wf.h / (rows.length + 1));
      const small = x.plot.mobile;

      // who this is
      const a = e.answers;
      ctx.globalAlpha = intro;
      ctx.font = BODY(small ? 11 : 13, 600); ctx.fillStyle = C.ink; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(`Patient · ${a.Sex.toLowerCase()}, ${a.AgeCategory}, ${a.GenHealth.toLowerCase()} health`, x.plot.x, x.plot.y + 8);
      ctx.font = MONO; ctx.fillStyle = e.has_disease ? "#ff8f91" : "#8fb5ea";
      ctx.fillText(e.has_disease ? "really had heart disease" : "really did not have heart disease", x.plot.x, x.plot.y + 26);

      // the score axis and the average person's starting point
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
      for (const v of range(-4, 3, 1)) {
        ctx.beginPath(); ctx.moveTo(xz(v), wf.y - 6); ctx.lineTo(xz(v), wf.y + wf.h); ctx.stroke();
        ctx.fillStyle = C.ink3; ctx.font = MONO; ctx.textAlign = "center";
        ctx.fillText(v > 0 ? `+${v}` : String(v), xz(v), wf.y + wf.h + 12);
      }
      ctx.fillText("score z (log-odds)", xz(-1.2), wf.y + wf.h + 28);
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(xz(Z0), wf.y - 10); ctx.lineTo(xz(Z0), wf.y + wf.h); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.ink2; ctx.textAlign = "left";
      ctx.fillText(`average person · ${Math.round(sigmoid(Z0) * 100)}%`, xz(Z0) + 6, wf.y - 8);
      ctx.globalAlpha = 1;

      // the waterfall of contributions
      rows.forEach((r, i) => {
        const g = clamp(bars - i);
        if (g <= 0) return;
        const y = wf.y + 8 + i * rowH;
        const to = lerp(r.from, r.to, easeOut(g));
        const x0 = xz(Math.min(r.from, to)), x1 = xz(Math.max(r.from, to));
        ctx.globalAlpha = intro * (0.3 + 0.7 * g);
        ctx.fillStyle = r.c > 0 ? C.yes : C.no;
        ctx.beginPath(); ctx.roundRect(x0, y - 6, Math.max(2, x1 - x0), 12, 3); ctx.fill();
        if (i > 0) { ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.moveTo(xz(r.from), y - rowH + 6); ctx.lineTo(xz(r.from), y - 6); ctx.stroke(); }
        ctx.font = BODY(small ? 10.5 : 12.5); ctx.fillStyle = C.ink2; ctx.textAlign = "right";
        ctx.fillText(r.label, box.x - 12, y);
        ctx.font = MONO; ctx.fillStyle = r.c > 0 ? "#ff9a9c" : "#8fb5ea"; ctx.textAlign = r.c > 0 ? "left" : "right";
        ctx.fillText(`${r.c > 0 ? "+" : "−"}${Math.abs(r.c).toFixed(2)}`, r.c > 0 ? x1 + 6 : x0 - 6, y);
        ctx.globalAlpha = 1;
      });
      // running total
      const shown = Math.min(rows.length, Math.ceil(bars));
      const zNow = shown === 0 ? Z0 : lerp(rows[shown - 1].from, rows[shown - 1].to, easeOut(clamp(bars - (shown - 1))));
      if (bars > 0) {
        const xm = xz(zNow);
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.moveTo(xm, wf.y + wf.h - 2); ctx.lineTo(xm - 6, wf.y + wf.h + 4); ctx.lineTo(xm + 6, wf.y + wf.h + 4); ctx.fill();
        ctx.font = "600 12px ui-monospace, SFMono-Regular, Consolas, monospace"; ctx.textAlign = "center";
        ctx.fillText(`z = ${zNow.toFixed(2)}`, xm, wf.y + wf.h - 16);
      }

      // the S-curve
      if (curve > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.globalAlpha = curve;
        for (const v of [0, 0.25, 0.5, 0.75, 1]) {
          ctx.beginPath(); ctx.moveTo(box.x, yp(v)); ctx.lineTo(box.x + box.w, yp(v)); ctx.stroke();
          ctx.fillStyle = C.ink3; ctx.font = MONO; ctx.textAlign = "right";
          ctx.fillText(v.toFixed(2), box.x - 10, yp(v));
        }
        ctx.textAlign = "left";
        ctx.fillText("probability p", x.plot.x + (small ? 0 : 60), sg.y - 16);
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.beginPath(); ctx.rect(box.x, sg.y - 10, box.w * curve, sg.h + 20); ctx.clip();
        ctx.beginPath();
        for (let i = 0; i <= 200; i++) { const z = lerp(-4.6, 2.2, i / 200); i ? ctx.lineTo(xz(z), yp(sigmoid(z))) : ctx.moveTo(xz(z), yp(sigmoid(z))); }
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.2; ctx.shadowColor = "rgba(255,255,255,0.5)"; ctx.shadowBlur = 8; ctx.stroke();
        ctx.restore();
      }
      // the cut-off
      if (cut > 0) {
        ctx.globalAlpha = cut;
        ctx.strokeStyle = C.ink; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(box.x, yp(thr)); ctx.lineTo(box.x + box.w, yp(thr)); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = MONO; ctx.fillStyle = C.ink; ctx.textAlign = "left";
        ctx.fillText(`cut-off ${thr.toFixed(2)}`, box.x + 8, yp(thr) - 10);
        ctx.globalAlpha = 1;
      }
      // the patient's score drops onto the curve
      if (drop > 0 && rain < 0.5) {
        const pz = sigmoid(data.z), px = xz(data.z);
        const yTop = wf.y + wf.h + 4, yCurve = yp(pz), y = lerp(yTop, yCurve, drop);
        ctx.globalAlpha = 1 - seg(rain, 0, 0.5);
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(px, yTop); ctx.lineTo(px, y); ctx.stroke();
        if (drop >= 1) { ctx.beginPath(); ctx.moveTo(px, yCurve); ctx.lineTo(box.x, yCurve); ctx.stroke(); }
        ctx.setLineDash([]);
        const flagged = pz > thr;
        drawGlow(ctx, cut > 0 ? (!e.has_disease ? C.no : flagged ? C.yes : C.missed) : "#ffffff", px, y, 24);
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px, y, 4.5, 0, 7); ctx.fill();
        if (drop >= 1) {
          ctx.font = "600 13px ui-monospace, SFMono-Regular, Consolas, monospace"; ctx.fillStyle = C.ink; ctx.textAlign = "left";
          ctx.fillText(`p = ${pz.toFixed(2)}`, px + 12, y - 12);
          if (cut > 0.5) {
            const verdict = flagged ? (e.has_disease ? "flagged · caught" : "flagged · false alarm") : (e.has_disease ? "cleared · missed" : "cleared · correct");
            pill(ctx, px + 92, y + 14, verdict, { color: !e.has_disease ? "#cfe0ff" : flagged ? "#ffd3d4" : "#ffd27a", alpha: ctx.globalAlpha });
          }
        }
        ctx.globalAlpha = 1;
      }
      // 1,200 real test-set people at once
      if (rain > 0) {
        for (const cls of [0, 1]) {
          ctx.beginPath();
          for (const d of crowd) {
            if (d.y !== cls) continue;
            const g = easeOut(seg(rain, d.d * 0.7, d.d * 0.7 + 0.3));
            if (g <= 0) continue;
            const px = xz(clamp(d.z, -4.55, 2.15)) + d.j * 3;
            const py = lerp(sg.y - 30, yp(sigmoid(d.z)) + d.j * 6, g);
            const r = cls ? 2.4 : 1.6;
            ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, 7);
          }
          ctx.fillStyle = cls ? C.yes : C.noLight;
          ctx.globalAlpha = cls ? 0.95 : 0.45;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        pill(ctx, box.x + box.w - 150, yp(0.82), `${Math.round(sickBelow * 100)}% of sick people below 0.5`,
          { font: MONO, color: "#ffd3d4", fill: "rgba(7,8,11,0.85)", alpha: seg(rain, 0.6, 1) });
      }
    },
  };
}
