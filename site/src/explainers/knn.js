// KNN in 3D: the particle heart bursts into 1,500 real respondents placed by a 3D summary
// of their answers, then a glowing sphere grows around one patient as k rises.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { median, ascending } from "d3";
import { sampleHeartPoints } from "../three/heartShape.js";
import { lubDub } from "../three/heart.js";
import { C, clamp, lerp, seg, smooth, mixRgb, rng } from "./engine.js";
import { reducedMotion } from "../scroll/story.js";

const MOTION = reducedMotion ? 0 : 1; // ambient orbit, bob, swirl and pulses; scroll-driven changes stay

const K_MAX = 251;
const FOV = 34;
const logK = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));

// everyone in a pool, sorted by distance to q, with running Yes counts
function sortedFrom(pool, q) {
  const n = pool.length;
  const d = new Float64Array(n);
  for (let j = 0; j < n; j++) d[j] = Math.hypot(pool[j][0] - q[0], pool[j][1] - q[1], pool[j][2] - q[2]);
  const idx = Uint32Array.from({ length: n }, (_, j) => j).sort((a, b) => d[a] - d[b]);
  const cum = new Uint16Array(n + 1);
  for (let r = 0; r < n; r++) cum[r + 1] = cum[r] + pool[idx[r]][3];
  return { pool, idx, dist: Float64Array.from(idx, (j) => d[j]), cum };
}
const shareK = (nb, k) => nb.cum[k] / k;
// the radius that holds exactly k people, blended for fractional k
function radiusK(nb, k) {
  const r = (kk) => (nb.dist[kk - 1] + nb.dist[Math.min(nb.dist.length - 1, kk)]) / 2;
  const k0 = clamp(Math.floor(k), 1, nb.dist.length - 1);
  return lerp(r(k0), r(k0 + 1), k - k0);
}

function voteReadout(el) {
  const kval = el.querySelector(".kval"), ballot = el.querySelector(".ballot");
  const bar = el.querySelector(".sharebar span"), tally = el.querySelector(".tally"), verdict = el.querySelector(".verdict");
  const balls = Array.from({ length: 60 }, () => ballot.appendChild(document.createElement("i")));
  let last = "";
  return {
    show(on) { el.classList.toggle("on", on); },
    set(k, yes) {
      if (`${k}|${yes}` === last) return;
      last = `${k}|${yes}`;
      kval.textContent = k;
      el.classList.toggle("many", k > 60);
      balls.forEach((b, i) => { b.className = i < k ? (i < yes ? "y" : "n") : ""; b.hidden = i >= k; });
      bar.style.width = `${(yes / k) * 100}%`;
      tally.innerHTML = `<span class="y">Yes ${yes}</span> · <span class="n">No ${k - yes}</span> · ${Math.round((yes / k) * 100)}% say Yes`;
      const atRisk = yes / k > 0.5;
      verdict.textContent = atRisk ? "Verdict: at risk" : "Verdict: not at risk";
      verdict.classList.toggle("yes", atRisk);
    },
  };
}

export function knnExplainer(stage, ex) {
  const P = ex.pca.points; // [x, y, z, has disease, synthetic, kept by ENN, parentA, parentB]
  const ORIG = [], BAL = [];
  P.forEach((p, i) => { if (!p[4]) ORIG.push(i); if (p[5]) BAL.push(i); });
  const pool = (ids, skip) => ids.filter((i) => i !== skip).map((i) => P[i]);

  // A real person with heart disease whose 5 nearest neighbors vote Yes, whose big neighborhood
  // votes No, and who is flagged again after balancing: the whole KNN story in one patient.
  let best = null;
  for (const i of ORIG) {
    if (!P[i][3]) continue;
    const nbO = sortedFrom(pool(ORIG, i), P[i]), nbB = sortedFrom(pool(BAL, i), P[i]);
    const s5 = shareK(nbO, 5), s51 = shareK(nbO, 51), b25 = shareK(nbB, 25);
    if (s5 <= 0.5 || s51 > 0.35 || b25 <= 0.6) continue;
    if (!best || s5 - s51 + b25 > best.score) best = { i, score: s5 - s51 + b25, nbO, nbB };
  }
  const QI = best?.i ?? ORIG.find((i) => P[i][3]);
  const nbO = best?.nbO ?? sortedFrom(pool(ORIG, QI), P[QI]);
  const nbB = best?.nbB ?? sortedFrom(pool(BAL, QI), P[QI]);

  // scale the 3D summary so ~98% of people sit inside radius 1.6
  const o = ORIG.map((i) => P[i]);
  const center = [0, 1, 2].map((d) => median(o, (p) => p[d]));
  const dists = o.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])).sort(ascending);
  const scale = 1.6 / dists[Math.floor(dists.length * 0.98)];
  const to3 = (p) => [(p[0] - center[0]) * scale, (p[1] - center[1]) * scale, (p[2] - center[2]) * scale];
  const qPos = to3(P[QI]);

  const readout = voteReadout(stage.querySelector(".xp-vote"));
  const FILL = 5200; // extra dust that only gives the heart its shape
  let renderer, scene, camera, composer, plot, W = 1, H = 1;
  let uniforms, lines, linePos, lineCol, sphere, sphereMat, qMesh, lastLineKey = "", orbit = 0, frameR = 0;

  const distanceFor = (R) => (R * H) / (2 * Math.min(plot.w, plot.h) * 0.5 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  function fit(x) {
    plot = x.plot;
    W = stage.clientWidth; H = stage.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, plot.mobile ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(dpr);
    composer.setSize(W, H);
    camera.aspect = W / H;
    // shift the projection so the scene's origin lands in the middle of the free area, not under the cards
    camera.setViewOffset(W, H, W / 2 - (plot.x + plot.w / 2), H / 2 - (plot.y + plot.h / 2), W, H);
    camera.updateProjectionMatrix();
  }

  return {
    init(x) {
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      stage.prepend(canvas);
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x07080b); // not setClearColor: see three/stage.js
      camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.35, 0.35));
      composer.addPass(new OutputPass());
      fit(x);

      const N = P.length + FILL;
      const heart = sampleHeartPoints(N, 7);
      const data = new Float32Array(N * 3), parent = new Float32Array(N * 3);
      const cls = new Float32Array(N), syn = new Float32Array(N), kept = new Float32Array(N), fill = new Float32Array(N), rnd = new Float32Array(N);
      const rand = rng(5);
      for (let i = 0; i < N; i++) {
        rnd[i] = rand();
        if (i < P.length) {
          const v = to3(P[i]);
          data.set(v, i * 3);
          parent.set(P[i][4] ? to3(P[P[i][6]]) : v, i * 3); // synthetic people are born at a real parent
          cls[i] = P[i][3]; syn[i] = P[i][4]; kept[i] = i === QI ? -1 : P[i][5];
        } else {
          const s = 2.4 + rand() * 2.5; // dust drifts outward and fades in the burst
          const v = [heart[i * 3] * s, heart[i * 3 + 1] * s, heart[i * 3 + 2] * s];
          data.set(v, i * 3);
          parent.set(v, i * 3);
          fill[i] = 1;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(heart, 3));
      for (const [name, arr, size] of [["aData", data, 3], ["aParent", parent, 3], ["aCls", cls, 1], ["aSyn", syn, 1],
        ["aKept", kept, 1], ["aFill", fill, 1], ["aRand", rnd, 1]]) geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
      uniforms = {
        uMorph: { value: 0 }, uReveal: { value: 0 }, uBal: { value: 0 }, uFocus: { value: 0 }, uRadius: { value: 0 },
        uBeat: { value: 0 }, uTime: { value: 0 }, uQuery: { value: new THREE.Vector3(...qPos) },
        uSize: { value: x.plot.mobile ? 30 : 24 }, uPixelRatio: { value: renderer.getPixelRatio() },
        uYes: { value: new THREE.Color(C.yes) }, uNo: { value: new THREE.Color(C.no) }, uHeart: { value: new THREE.Color("#ff4d55") },
      };
      scene.add(new THREE.Points(geo, new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`
          attribute vec3 aData, aParent; attribute float aCls, aSyn, aKept, aFill, aRand;
          uniform float uMorph, uReveal, uBal, uFocus, uRadius, uBeat, uTime, uSize, uPixelRatio;
          uniform vec3 uQuery, uYes, uNo, uHeart;
          varying vec3 vColor; varying float vAlpha;
          void main() {
            float m = smoothstep(aRand * 0.45, aRand * 0.45 + 0.55, uMorph);
            vec3 heart = position * (1.0 + uBeat * 0.05);
            float born = smoothstep(aRand * 0.6, aRand * 0.6 + 0.4, uBal);
            vec3 data = aSyn > 0.5 ? mix(aParent, aData, born) : aData;
            vec3 swirl = vec3(sin(aRand * 40.0 + uTime * 0.7), cos(aRand * 31.0 + uTime * 0.6), sin(aRand * 17.0 + uTime * 0.5));
            vec3 p = mix(heart, data, m) + swirl * (0.012 + 0.45 * sin(m * 3.14159));
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float inside = uFocus * step(distance(data, uQuery), uRadius);
            float alpha = mix(0.3, 0.7, m);
            if (aFill > 0.5) alpha *= 0.8 * (1.0 - smoothstep(0.05, 0.7, uMorph));
            if (aSyn > 0.5) alpha *= born * step(0.5, aKept);
            else if (aKept < -0.5) alpha = 0.0;
            else if (aKept < 0.5) alpha *= mix(1.0, 0.12, uBal);
            alpha *= mix(1.0, mix(0.35, 1.4, inside), uFocus);
            vColor = mix(uHeart, aCls > 0.5 ? uYes : uNo, uReveal * (1.0 - aFill));
            vAlpha = alpha;
            gl_PointSize = uSize * (1.0 + 0.9 * inside + 0.25 * aCls * uReveal) * uPixelRatio / -mv.z;
          }`,
        fragmentShader: /* glsl */`
          varying vec3 vColor; varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float a = smoothstep(0.5, 0.05, d);
            gl_FragColor = vec4(vColor * (0.7 + 0.6 * a), a * vAlpha);
          }`,
      })));

      // spokes from the patient to its neighbors
      linePos = new Float32Array(400 * 6);
      lineCol = new Float32Array(400 * 6);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
      lg.setAttribute("color", new THREE.BufferAttribute(lineCol, 3));
      lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(lines);

      // the neighborhood: a sphere with a fresnel rim and faint latitude lines
      sphereMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(C.yes) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
        vertexShader: /* glsl */`
          varying vec3 vN; varying vec3 vV; varying vec2 vUv;
          void main() {
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vV = normalize(-mv.xyz); vUv = uv;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 uColor; uniform float uOpacity, uTime;
          varying vec3 vN; varying vec3 vV; varying vec2 vUv;
          void main() {
            float fres = pow(1.0 - abs(dot(vN, vV)), 2.2);
            float lat = smoothstep(0.93, 1.0, abs(sin((vUv.y + uTime * 0.02) * 3.14159 * 10.0)));
            float lon = smoothstep(0.95, 1.0, abs(sin((vUv.x + uTime * 0.01) * 3.14159 * 16.0)));
            gl_FragColor = vec4(uColor * (0.55 + fres * 0.9), (fres * 0.9 + (lat + lon) * 0.09 + 0.03) * uOpacity);
          }`,
      });
      sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), sphereMat);
      sphere.position.set(...qPos);
      scene.add(sphere);
      qMesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      qMesh.position.set(...qPos);
      scene.add(qMesh);
    },
    resize: fit,
    frame(p, dt, t) {
      const morph = smooth(seg(p, 0.35, 1.2));
      const reveal = smooth(seg(p, 0.75, 1.25));
      const qIn = smooth(seg(p, 1.45, 1.9));
      const grow = smooth(seg(p, 2.4, 3.5));
      const bal = smooth(seg(p, 3.5, 4.1));
      let k = logK(5, K_MAX, grow);
      if (bal > 0) k = logK(k, 25, bal);
      const kInt = Math.max(1, Math.round(k));
      const radius = lerp(radiusK(nbO, k), radiusK(nbB, k), bal) * scale * qIn;
      const share = lerp(shareK(nbO, kInt), shareK(nbB, kInt), bal);

      // camera: faces the heart, orbits once the data is out, then follows the patient,
      // pulling back as the sphere grows so it always fills about half the frame
      orbit += dt * 0.07 * morph * MOTION;
      const want = lerp(lerp(1.55, 1.7, morph), Math.max(0.55, radius * 1.6), qIn);
      frameR = frameR ? lerp(frameR, want, 1 - Math.exp(-dt * 4)) : want;
      const d = distanceFor(frameR);
      const th = (orbit + 0.5 + p * 0.3) * morph, ph = (0.22 + 0.08 * Math.sin(t * 0.21) * MOTION) * morph;
      const look = qPos.map((v) => v * qIn);
      camera.position.set(look[0] + d * Math.cos(ph) * Math.sin(th), look[1] + d * Math.sin(ph), look[2] + d * Math.cos(ph) * Math.cos(th));
      camera.lookAt(look[0], look[1], look[2]);

      uniforms.uMorph.value = morph;
      uniforms.uReveal.value = reveal;
      uniforms.uBal.value = bal;
      uniforms.uFocus.value = qIn;
      uniforms.uRadius.value = radius;
      uniforms.uTime.value = t * MOTION;
      uniforms.uBeat.value = lubDub(t) * (1 - morph) * MOTION;
      sphere.scale.setScalar(Math.max(0.001, radius));
      sphereMat.uniforms.uOpacity.value = qIn;
      sphereMat.uniforms.uTime.value = t * MOTION;
      const [cr, cg, cb] = mixRgb(C.no, C.yes, smooth(clamp((share - 0.3) / 0.4)));
      sphereMat.uniforms.uColor.value.setRGB(cr / 255, cg / 255, cb / 255, THREE.SRGBColorSpace);
      qMesh.scale.setScalar(Math.max(0.001, qIn * (frameR / 1.7) * (1 + 0.25 * Math.sin(t * 4) * MOTION)));

      // spokes, rebuilt only when the neighbor set changes
      const nb = bal < 0.5 ? nbO : nbB;
      const m = Math.min(kInt, 400);
      const key = `${m}|${bal < 0.5}`;
      if (key !== lastLineKey) {
        lastLineKey = key;
        const yes = new THREE.Color(C.yes), no = new THREE.Color(C.no);
        for (let r = 0; r < m; r++) {
          const q = nb.pool[nb.idx[r]];
          linePos.set(qPos, r * 6);
          linePos.set(to3(q), r * 6 + 3);
          const col = q[3] ? yes : no;
          lineCol.set([col.r, col.g, col.b, col.r, col.g, col.b], r * 6);
        }
        lines.geometry.attributes.position.needsUpdate = true;
        lines.geometry.attributes.color.needsUpdate = true;
        lines.geometry.setDrawRange(0, m * 2);
      }
      lines.material.opacity = qIn * clamp(1.6 / Math.sqrt(kInt), 0.08, 0.7);
      composer.render();

      readout.show(qIn > 0.6);
      readout.set(kInt, Math.round(share * kInt));
    },
  };
}
