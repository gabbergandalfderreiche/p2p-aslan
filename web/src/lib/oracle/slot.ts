/**
 * "Das Orakel": a book slot played with tUSD from the Löwensprung game account. Pure rules, shared by
 * the server (which spins) and the browser (which animates and re-checks every spin from its seed).
 * Amounts are in micro-tUSD (6 decimals); pays are in line bets, the stake covers all 10 lines.
 */

export const REELS = 5;
export const ROWS = 3;
export const MIN_STAKE = 100_000; // 0.1 tUSD
export const MAX_STAKE = 10_000_000; // 10 tUSD
export const MAX_PROFIT = 500_000_000; // 500 tUSD per spin incl. its free spins, protects the pot
export const FREE_SPINS = 10;
export const MAX_FREE_SPINS = 50;
export const STAKES = [100_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];

/** Symbol ids are their position in /oracle-symbols.webp. */
export const SYMBOLS = ["gas", "block", "key", "sat", "wallet", "hamster", "lion", "whale", "owl", "book"] as const;
export const BOOK = 9;

/** Line pays in line bets, by symbol and number of symbols in a row from the left (index = count). */
export const PAYS: Record<number, number[]> = {
  0: [0, 0, 0, 5, 25, 100],
  1: [0, 0, 0, 5, 25, 100],
  2: [0, 0, 0, 5, 25, 100],
  3: [0, 0, 0, 5, 25, 100],
  4: [0, 0, 0, 5, 40, 150],
  5: [0, 0, 5, 40, 125, 750],
  6: [0, 0, 5, 40, 125, 750],
  7: [0, 0, 5, 40, 400, 2000],
  8: [0, 0, 10, 100, 1000, 5000],
};
/** Whitepaper anywhere on the screen, pays in total stakes (×10 line bets). */
export const BOOK_PAYS = [0, 0, 0, 2, 20, 200];

/** Rows (0 top, 2 bottom) that each of the 10 lines crosses on the five reels. */
export const LINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 2, 1, 0, 1],
];

// Reel strips: how often each symbol appears per reel sets the odds; tuned by script/oracle-rtp.ts.
const STRIP_COUNTS: number[][] = [
  // gas block key sat wallet hamster lion whale owl book
  [9, 9, 9, 8, 6, 4, 4, 2, 1, 2],
  [9, 9, 9, 8, 6, 4, 4, 2, 1, 1],
  [9, 9, 9, 8, 6, 4, 4, 2, 1, 2],
  [9, 9, 9, 8, 6, 4, 4, 2, 1, 1],
  [9, 9, 9, 8, 6, 4, 4, 2, 1, 1],
];

/** Spreads the symbols of one reel evenly, so equal symbols rarely sit next to each other. */
export function buildStrip(counts: number[]) {
  const slots: { s: number; at: number }[] = [];
  counts.forEach((n, s) => {
    for (let i = 0; i < n; i++) slots.push({ s, at: (i + 0.5) / n + s * 0.013 });
  });
  slots.sort((a, b) => a.at - b.at);
  return slots.map((x) => x.s);
}
export const STRIPS = STRIP_COUNTS.map(buildStrip);

/** Hype symbol for the free spins: everything but the whitepaper, the rarer the less likely. */
const HYPE_WEIGHTS = [10, 10, 10, 10, 7, 3, 3, 1, 1];

// ---------------------------------------------------------------- randomness from the seed

/** Deterministic generator (sfc32) seeded with the first 16 bytes of a 32-byte hex seed. */
export function rngFrom(seedHex: string) {
  let a = parseInt(seedHex.slice(0, 8), 16) >>> 0;
  let b = parseInt(seedHex.slice(8, 16), 16) >>> 0;
  let c = parseInt(seedHex.slice(16, 24), 16) >>> 0;
  let d = parseInt(seedHex.slice(24, 32), 16) >>> 0;
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next(); // warm up
  return next;
}

// ---------------------------------------------------------------- one screen

export type Grid = number[][]; // [reel][row]
export type LineWin = { line: number; symbol: number; count: number; pay: number };
export type Expansion = { symbol: number; reels: number[]; pay: number };
export type Screen = {
  stops: number[];
  grid: Grid;
  lines: LineWin[];
  books: number;
  bookPay: number;
  expansion: Expansion | null;
  /** Everything this screen pays, in line bets. */
  pay: number;
};

function gridAt(stops: number[]): Grid {
  return stops.map((stop, r) => {
    const strip = STRIPS[r];
    return [0, 1, 2].map((row) => strip[(stop + row) % strip.length]);
  });
}

/** Best pay of one line; the whitepaper stands in for any symbol. */
function lineWin(symbols: number[], line: number): LineWin | null {
  let best: LineWin | null = null;
  for (let s = 0; s < BOOK; s++) {
    let count = 0;
    while (count < REELS && (symbols[count] === s || symbols[count] === BOOK)) count++;
    const pay = PAYS[s][count] ?? 0;
    if (pay > 0 && (!best || pay > best.pay)) best = { line, symbol: s, count, pay };
  }
  return best;
}

/** In free spins the hype symbol pays on every line once it shows on enough reels, anywhere. */
function expansionOf(grid: Grid, hype: number): Expansion | null {
  const reels = grid.flatMap((col, r) => (col.includes(hype) ? [r] : []));
  const pay = (PAYS[hype][reels.length] ?? 0) * LINES.length;
  return pay > 0 ? { symbol: hype, reels, pay } : null;
}

function screen(next: () => number, hype: number | null): Screen {
  const stops = STRIPS.map((strip) => Math.floor(next() * strip.length));
  const grid = gridAt(stops);
  const lines = LINES.map((rows, i) => lineWin(rows.map((row, r) => grid[r][row]), i)).filter((w) => w !== null);
  const books = grid.flat().filter((s) => s === BOOK).length;
  const bookPay = BOOK_PAYS[Math.min(books, 5)] * LINES.length;
  let expansion = hype === null ? null : expansionOf(grid, hype);
  // The expanded symbol replaces its normal line wins instead of adding to them.
  let lineSum = lines.reduce((a, w) => a + w.pay, 0);
  if (expansion) {
    const own = lines.filter((w) => w.symbol === hype).reduce((a, w) => a + w.pay, 0);
    if (expansion.pay > own) lineSum -= own;
    else expansion = null;
  }
  return { stops, grid, lines, books, bookPay, expansion, pay: lineSum + bookPay + (expansion?.pay ?? 0) };
}

// ---------------------------------------------------------------- a whole spin

export type Spin = {
  base: Screen;
  /** Set when three or more whitepapers started free spins. */
  free: { hype: number; screens: Screen[] } | null;
  /** Total win in line bets, before the per-spin cap. */
  pay: number;
};

/** The complete outcome of a spin, free spins included, from its seed alone. */
export function spinFromSeed(seedHex: string): Spin {
  const next = rngFrom(seedHex);
  const base = screen(next, null);
  if (base.books < 3) return { base, free: null, pay: base.pay };

  let r = next() * HYPE_WEIGHTS.reduce((a, b) => a + b, 0);
  let hype = 0;
  while (r >= HYPE_WEIGHTS[hype]) r -= HYPE_WEIGHTS[hype++];

  const screens: Screen[] = [];
  let left = FREE_SPINS;
  while (left > 0 && screens.length < MAX_FREE_SPINS) {
    const s = screen(next, hype);
    screens.push(s);
    left--;
    if (s.books >= 3) left += FREE_SPINS;
  }
  return { base, free: { hype, screens }, pay: base.pay + screens.reduce((a, s) => a + s.pay, 0) };
}

/** Payout in micro-tUSD for a stake (covering all lines) and a win in line bets. */
export const payoutFor = (stake: number, pay: number) => Math.min(Math.floor((stake * pay) / LINES.length), stake + MAX_PROFIT);

export type SpinResult = {
  seed: string;
  spin: Spin;
  stake: number;
  payout: number;
  balance: number;
  /** sha256 of the seed for the next spin. */
  nextCommit: string;
};
