// Deterministic RNG + small numeric helpers used to make the synthetic extracts
// land on exact monthly metric values (so the SLA engine reproduces the demo story).

export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const round = (v, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Pick an integer in [lo, hi]. */
export const randInt = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

/** Pick a float in [lo, hi]. */
export const randFloat = (r, lo, hi) => lo + r() * (hi - lo);

export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

/** Shift a set of values so their simple mean is exactly `target`. */
export function fitMean(values, target, dp = 1, floor = 0.1) {
  const n = values.length;
  const shift = target - sum(values) / n;
  const out = values.map((v) => round(Math.max(floor, v + shift), dp));
  const residual = round(target * n - sum(out), dp + 2);
  // Push the rounding residual onto whichever row can absorb it without going odd.
  const idx = out.indexOf(Math.max(...out));
  out[idx] = round(out[idx] + residual, dp);
  return out;
}

/** Shift a set of values so their weight-weighted mean is exactly `target`. */
export function fitWeightedMean(values, weights, target, dp = 1, floor = 0.1) {
  const W = sum(weights);
  const shift = target - sum(values.map((v, i) => v * weights[i])) / W;
  const out = values.map((v) => round(Math.max(floor, v + shift), dp));
  const achieved = sum(out.map((v, i) => v * weights[i])) / W;
  const idx = weights.indexOf(Math.max(...weights));
  out[idx] = round(out[idx] + ((target - achieved) * W) / weights[idx], dp);
  return out;
}
