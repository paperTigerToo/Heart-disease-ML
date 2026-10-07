// Taubin's implicit heart surface, sampled along rays from the center.
//   (x² + 9/4·y² + z² − 1)³ − x²·z³ − 9/80·y²·z³ = 0   (z up; mapped to three.js y up)
import { randomLcg, randomNormal } from "d3";

function heartF(X, Y, Z) {
  const x = X, y = Z, z = Y;
  const a = x * x + 2.25 * y * y + z * z - 1;
  return a * a * a - x * x * z * z * z - 0.1125 * y * y * z * z * z;
}

function radiusAlong(dx, dy, dz) {
  let r = 0;
  while (r < 2 && heartF(dx * r, dy * r, dz * r) <= 0) r += 0.02;
  let lo = Math.max(0, r - 0.02), hi = r;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    heartF(dx * mid, dy * mid, dz * mid) <= 0 ? (lo = mid) : (hi = mid);
  }
  return lo;
}

const Y_OFFSET = -0.08; // re-centers the shape vertically

// 78% of points on a thin shell (crisp silhouette), the rest filling the inside.
export function sampleHeartPoints(n, seed = 7) {
  const rand = randomLcg(seed);
  const gauss = randomNormal.source(rand)(0, 1);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = gauss(), y = gauss(), z = gauss();
    const len = Math.hypot(x, y, z);
    x /= len; y /= len; z /= len;
    const r = radiusAlong(x, y, z);
    const k = rand() < 0.78 ? 0.93 + 0.07 * rand() : Math.cbrt(rand()) * 0.9;
    out[i * 3] = x * r * k;
    out[i * 3 + 1] = y * r * k + Y_OFFSET;
    out[i * 3 + 2] = z * r * k;
  }
  return out;
}
