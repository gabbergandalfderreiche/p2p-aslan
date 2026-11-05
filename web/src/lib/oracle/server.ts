import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Address } from "viem";
import { balanceKey, DenError } from "@/lib/den/game";
import { store } from "@/lib/den/store";
import { MAX_STAKE, MIN_STAKE, payoutFor, spinFromSeed, STAKES, type SpinResult } from "./slot";

/**
 * Orakel slot server. Each player has the seed of their next spin waiting, of which they only see
 * the sha256 beforehand; a spin uses it, reveals it and draws the next one. Stake and payout move on
 * the same game-account balance as Löwensprung.
 */

const K = {
  next: (a: string) => `oracle:next:${a}`,
  lock: (a: string) => `oracle:lock:${a}`,
  stats: (a: string) => `oracle:stats:${a}`,
};

const commitOf = (seed: string) => createHash("sha256").update(seed).digest("hex");

/** The waiting seed, drawn on first use. Stored as an object so the store never reads it as a number. */
async function nextSeed(player: string) {
  const stored = await store.get<{ seed: string }>(K.next(player));
  if (stored?.seed) return stored.seed;
  const seed = randomBytes(32).toString("hex");
  await store.set(K.next(player), { seed });
  return seed;
}

export async function commit(player: Address) {
  return { commit: commitOf(await nextSeed(player)) };
}

export async function stats(player: Address) {
  const s = await store.hgetall<number>(K.stats(player));
  const n = (k: string) => Number(s[k] ?? 0);
  return { spins: n("spins"), wagered: n("wagered"), won: n("won"), best: n("best") };
}

export async function spin(player: Address, stake: number): Promise<SpinResult> {
  if (!Number.isInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE || !STAKES.includes(stake)) throw new DenError("bad-stake");
  // One spin at a time per player, so a seed is never used twice.
  if (!(await store.set(K.lock(player), 1, { nx: true, px: 10_000 }))) throw new DenError("busy");
  try {
    if ((await store.incrby(balanceKey(player), -stake)) < 0) {
      await store.incrby(balanceKey(player), stake);
      throw new DenError("balance");
    }
    const seed = await nextSeed(player);
    const fresh = randomBytes(32).toString("hex");
    await store.set(K.next(player), { seed: fresh });

    const result = spinFromSeed(seed);
    const payout = payoutFor(stake, result.pay);
    const balance = payout > 0 ? await store.incrby(balanceKey(player), payout) : Number((await store.get<number>(balanceKey(player))) ?? 0);

    await store.hincrby(K.stats(player), "spins", 1);
    await store.hincrby(K.stats(player), "wagered", stake);
    if (payout > 0) await store.hincrby(K.stats(player), "won", payout);
    const best = Number((await store.hgetall<number>(K.stats(player))).best ?? 0);
    if (payout > best) await store.hincrby(K.stats(player), "best", payout - best);

    return { seed, spin: result, stake, payout, balance, nextCommit: commitOf(fresh) };
  } finally {
    await store.del(K.lock(player));
  }
}
