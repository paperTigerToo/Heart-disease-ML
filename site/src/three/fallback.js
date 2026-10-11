// Static 2D dot heart for browsers without WebGL: same story, no 3D.
export function drawFallbackHeart() {
  const canvas = document.createElement("canvas");
  canvas.id = "fallback";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const dpr = Math.min(devicePixelRatio, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const g = canvas.getContext("2d");
  g.scale(dpr, dpr);
  const s = Math.min(w, h) / 40;
  g.fillStyle = "#e5383b";
  for (let i = 0; i < 2600; i++) {
    // classic parametric heart, filled toward the outline
    const t = Math.random() * Math.PI * 2, k = Math.sqrt(Math.random()) * 0.25 + 0.75 * Math.random() ** 0.2;
    const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    g.globalAlpha = 0.25 + Math.random() * 0.5;
    g.beginPath();
    g.arc(w / 2 + x * s * k, h / 2 - y * s * k, 1.2, 0, Math.PI * 2);
    g.fill();
  }
}
