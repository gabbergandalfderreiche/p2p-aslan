// Monte Carlo check of the Orakel slot: run with `node scripts/oracle-rtp.ts [spins]`.
import { randomBytes } from "node:crypto";
import { buildStrip, LINES, MAX_PROFIT, spinFromSeed, STRIPS } from "../src/lib/oracle/slot.ts";

const n = Number(process.argv[2] ?? 1_000_000);
// Optional: try other reel counts without editing the game, e.g. '[[9,9,9,8,6,4,4,2,1,2], ...]'.
if (process.argv[3]) (JSON.parse(process.argv[3]) as number[][]).forEach((c, r) => (STRIPS[r] = buildStrip(c)));
const stake = 1_000_000;
let paid = 0;
let base = 0;
let free = 0;
let triggers = 0;
let hits = 0;
let capped = 0;
let max = 0;
for (let i = 0; i < n; i++) {
  const s = spinFromSeed(randomBytes(32).toString("hex"));
  const raw = Math.floor((stake * s.pay) / LINES.length);
  const won = Math.min(raw, stake + MAX_PROFIT);
  if (won < raw) capped++;
  paid += won;
  base += Math.floor((stake * s.base.pay) / LINES.length);
  if (s.free) {
    triggers++;
    free += won - Math.floor((stake * s.base.pay) / LINES.length);
  }
  if (s.pay > 0) hits++;
  max = Math.max(max, s.pay / LINES.length);
}
const pct = (x: number) => ((100 * x) / (n * stake)).toFixed(2) + " %";
console.log({
  spins: n,
  rtp: pct(paid),
  base: pct(base),
  freeSpins: pct(free),
  hitRate: ((100 * hits) / n).toFixed(1) + " %",
  freeSpinsEvery: Math.round(n / Math.max(triggers, 1)) + " spins",
  maxWin: max.toFixed(1) + "x stake",
  capped,
});
