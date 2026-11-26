// Renderer, camera and bloom. Returns null when WebGL is unavailable.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// phones, and tablets held upright: the heart sits on top and the text scrolls beneath it
// (must match the phone media queries in sections.css)
export const isMobile = () => innerWidth < 760 || (innerWidth < 1100 && innerHeight > innerWidth);

export function createStage(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.toneMapping = THREE.NoToneMapping; // keep data colors true to the chart palette
  const scene = new THREE.Scene();
  // a scene background, not setClearColor: the composer clears its linear render target with
  // the clear color already converted to sRGB, which renders #07080b as a washed-out grey
  scene.background = new THREE.Color(0x07080b);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 8);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.5, 0.1));
  composer.addPass(new OutputPass());

  const stage = { renderer, scene, camera, composer, halfW: 1, halfH: 1, w: 0, h: 0 };
  function resize() {
    // the canvas's own CSS size (100lvh) stays put while Safari's toolbar slides in and out,
    // so scrolling on a phone never reallocates the bloom buffers
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === stage.w && h === stage.h) return;
    stage.w = w; stage.h = h;
    const dpr = Math.min(devicePixelRatio, isMobile() ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // visible half-size of the z = 0 plane, used to lay out formations
    stage.halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    stage.halfW = stage.halfH * camera.aspect;
  }
  resize();
  addEventListener("resize", resize);

  const timer = new THREE.Timer();
  let drew = true;
  stage.loop = (fn) => renderer.setAnimationLoop((time) => {
    timer.update(time);
    // fn returns false when nothing on the stage is visible (the explainers cover it): draw one
    // last, empty frame, then stop paying for the dots and bloom until it shows again
    const draw = fn(Math.min(timer.getDelta(), 0.05), timer.getElapsed()) !== false;
    if (draw || drew) composer.render();
    drew = draw;
  });
  return stage;
}
