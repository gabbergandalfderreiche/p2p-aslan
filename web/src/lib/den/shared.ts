/**
 * Löwensprung rules shared by the server (which runs the rounds) and the browser (which animates
 * them and lets players check the fairness proof). Amounts are in micro-tUSD (6 decimals).
 */

export const BETTING_MS = 6_000; // place bets
export const PAUSE_MS = 4_000; // show the crash before the next round
export const GROWTH = 0.00007; // multiplier = e^(GROWTH × ms in flight): 2x after ~9.9 s, 10x after ~33 s
export const MIN_STAKE = 100_000; // 0.1 tUSD
export const MAX_STAKE = 100_000_000; // 100 tUSD
export const MAX_PROFIT = 500_000_000; // 500 tUSD per bet, protects the pot
export const MAX_AUTO = 100_000; // 1000x, in hundredths

/** Multiplier in hundredths after `ms` in flight (floored, like the payout). */
export const multiplierAt = (ms: number) => Math.max(100, Math.floor(Math.exp(GROWTH * Math.max(ms, 0)) * 100));

/** Flight time in ms until the multiplier reaches `crash` (hundredths). */
export const flightMs = (crash: number) => Math.ceil(Math.log(crash / 100) / GROWTH);

/** Round timeline in ms from its start. */
export const timeline = (crash: number) => {
  const flight = flightMs(crash);
  return { flightStart: BETTING_MS, crashAt: BETTING_MS + flight, end: BETTING_MS + flight + PAUSE_MS };
};

/**
 * Crash point in hundredths from a 32-byte hex seed: 1 in 101 rounds bust at 1.00x, otherwise
 * P(crash ≥ x) = 1 / x. Same formula as the on-chain CrashGame, so anyone can recompute it.
 */
export function crashFromSeed(seedHex: string) {
  const n = BigInt(`0x${seedHex}`);
  if (n % 101n === 0n) return 100;
  const e = 2n ** 52n;
  const h = n >> 204n; // top 52 bits
  const crash = (100n * e - h) / (e - h);
  return Number(crash > 100_000_000n ? 100_000_000n : crash);
}

export type Phase = "betting" | "flying" | "crashed";

export type PublicBet = { player: string; stake: number; auto: number | null; cashout: number | null };

export type DenState = {
  serverNow: number;
  round: number;
  startAt: number;
  phase: Phase;
  /** sha256 of the round seed, shown before anyone bets. */
  commit: string;
  /** Only after the crash. */
  crash: number | null;
  seed: string | null;
  bets: PublicBet[];
  history: { round: number; crash: number }[];
};

/** Text the wallet signs to log in; the nonce makes every signature single-use. */
export const loginMessage = (address: string, nonce: string) =>
  `Löwensprung login\n\nAddress: ${address}\nNonce: ${nonce}\n\nOnly play money (tUSD). Signing costs nothing.`;
