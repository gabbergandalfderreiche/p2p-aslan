import "server-only";
import { createHash, createHmac } from "node:crypto";
import { createPublicClient, createWalletClient, defineChain, erc20Abi, getAddress, http, parseEventLogs, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { deployments } from "@/generated/contracts";
import {
  crashFromSeed,
  MAX_AUTO,
  MAX_PROFIT,
  MAX_STAKE,
  MIN_STAKE,
  multiplierAt,
  timeline,
  type DenState,
  type PublicBet,
} from "./shared";
import { store } from "./store";

/**
 * Löwensprung game server. Rounds follow each other back to back; the current round is worked out
 * from the clock whenever someone asks, so no background process is needed. Balances live in the
 * store; tUSD only moves on-chain when players deposit or withdraw.
 */

const LOCAL = process.env.NEXT_PUBLIC_NETWORK === "local";
const IDLE_JUMP_MS = 30_000; // nobody asked for a while: start the next round now instead of replaying the gap

// ---------------------------------------------------------------- fairness

function seedSecret() {
  const s = process.env.DEN_SEED_SECRET || process.env.DEN_SECRET;
  if (s) return s;
  if (process.env.VERCEL) throw new Error("DEN_SEED_SECRET is not set");
  return "local-dev-seed";
}

/** Round seed: fixed by the secret and the round number, so it cannot be picked after the bets. */
const seedOf = (round: number) => createHmac("sha256", seedSecret()).update(`round:${round}`).digest("hex");
const commitOf = (seed: string) => createHash("sha256").update(seed).digest("hex");

// ---------------------------------------------------------------- rounds

type Round = { id: number; startAt: number };
type StoredBet = { stake: number; auto: number | null };

const K = {
  round: "den:round",
  lock: "den:lock",
  bets: (id: number) => `den:bets:${id}`,
  cash: (id: number) => `den:cash:${id}`,
  settled: (id: number) => `den:settled:${id}`,
  history: "den:history",
  balance: (a: string) => `den:bal:${a}`,
  stats: (a: string) => `den:stats:${a}`,
  hist: (a: string) => `den:hist:${a}`,
  deposit: (h: string) => `den:dep:${h}`,
  nonce: (n: string) => `den:nonce:${n}`,
};

const crashOf = (id: number) => crashFromSeed(seedOf(id));
const endOf = (r: Round) => r.startAt + timeline(crashOf(r.id)).end;

/** The round running now, settling every round that finished since the last request. */
async function currentRound(now: number): Promise<Round> {
  let round = await store.get<Round>(K.round);
  if (round && now < endOf(round)) return round;

  if (!(await store.set(K.lock, now, { nx: true, px: 5_000 }))) {
    // Someone else is advancing; their result is ready in a moment.
    await new Promise((r) => setTimeout(r, 150));
    return (await store.get<Round>(K.round)) ?? { id: 1, startAt: now };
  }
  try {
    round = (await store.get<Round>(K.round)) ?? null;
    if (!round) round = { id: 1, startAt: now };
    while (now >= endOf(round)) {
      await settle(round.id);
      const end = endOf(round);
      round = { id: round.id + 1, startAt: now - end > IDLE_JUMP_MS ? now : end };
    }
    await store.set(K.round, round);
    return round;
  } finally {
    await store.del(K.lock);
  }
}

/** Pays the auto cash-outs that the crash point reached and records everyone's result. */
async function settle(id: number) {
  if (!(await store.set(K.settled(id), 1, { nx: true }))) return;
  const crash = crashOf(id);
  const bets = await store.hgetall<StoredBet>(K.bets(id));
  for (const [player, bet] of Object.entries(bets)) {
    if (bet.auto && bet.auto <= crash) await pay(id, player, bet, bet.auto);
    const cashed = (await store.hgetall<number>(K.cash(id)))[player] ?? null;
    const payout = cashed ? payoutFor(bet.stake, cashed) : 0;
    await store.lpush(K.hist(player), { round: id, stake: bet.stake, cashout: cashed, crash, profit: payout - bet.stake }, 50);
  }
  await store.lpush(K.history, { round: id, crash }, 20);
}

const payoutFor = (stake: number, at: number) => Math.min(Math.floor((stake * at) / 100), stake + MAX_PROFIT);

/** Cash out once (the store makes the second attempt fail) and credit the payout. */
async function pay(id: number, player: string, bet: StoredBet, at: number) {
  if (!(await store.hsetnx(K.cash(id), player, at))) return null;
  const payout = payoutFor(bet.stake, at);
  await store.incrby(K.balance(player), payout);
  await store.hincrby(K.stats(player), "won", payout);
  await store.hincrby(K.stats(player), "wins", 1);
  const best = (await store.hgetall<number>(K.stats(player))).best ?? 0;
  if (at > Number(best)) await store.hincrby(K.stats(player), "best", at - Number(best));
  return payout;
}

function phaseOf(round: Round, now: number) {
  const crash = crashOf(round.id);
  const t = timeline(crash);
  const into = now - round.startAt;
  return { crash, t, into, phase: into < t.flightStart ? "betting" : into < t.crashAt ? "flying" : "crashed" } as const;
}

// ---------------------------------------------------------------- public API

export async function state(now = Date.now()): Promise<DenState> {
  const round = await currentRound(now);
  const { crash, phase, into, t } = phaseOf(round, now);
  const bets = await store.hgetall<StoredBet>(K.bets(round.id));
  const cash = await store.hgetall<number>(K.cash(round.id));
  const current = phase === "flying" ? multiplierAt(into - t.flightStart) : phase === "crashed" ? crash : 100;
  const seed = seedOf(round.id);
  const list: PublicBet[] = Object.entries(bets).map(([player, b]) => {
    // Auto cash-outs that the climb already passed show as cashed, before settlement pays them.
    const autoHit = b.auto && b.auto <= current && (phase !== "crashed" || b.auto <= crash) ? b.auto : null;
    return { player, stake: b.stake, auto: b.auto, cashout: cash[player] ?? autoHit };
  });
  return {
    serverNow: now,
    round: round.id,
    startAt: round.startAt,
    phase,
    commit: commitOf(seed),
    crash: phase === "crashed" ? crash : null,
    seed: phase === "crashed" ? seed : null,
    bets: list,
    history: await store.lrange<{ round: number; crash: number }>(K.history, 20),
  };
}

export class DenError extends Error {}

export async function placeBet(player: Address, stake: number, auto: number | null) {
  const now = Date.now();
  const round = await currentRound(now);
  if (phaseOf(round, now).phase !== "betting") throw new DenError("not-betting");
  if (!Number.isInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) throw new DenError("bad-stake");
  if (auto !== null && (!Number.isInteger(auto) || auto < 101 || auto > MAX_AUTO)) throw new DenError("bad-auto");

  if ((await store.incrby(K.balance(player), -stake)) < 0) {
    await store.incrby(K.balance(player), stake);
    throw new DenError("balance");
  }
  if (!(await store.hsetnx(K.bets(round.id), player, { stake, auto } satisfies StoredBet))) {
    await store.incrby(K.balance(player), stake);
    throw new DenError("already");
  }
  await store.hincrby(K.stats(player), "wagered", stake);
  await store.hincrby(K.stats(player), "rounds", 1);
  return { round: round.id };
}

export async function cashOut(player: Address) {
  const now = Date.now();
  const round = await currentRound(now);
  const { phase, into, t, crash } = phaseOf(round, now);
  if (phase !== "flying") throw new DenError(phase === "crashed" ? "crashed" : "not-flying");
  const bet = (await store.hgetall<StoredBet>(K.bets(round.id)))[player];
  if (!bet) throw new DenError("no-bet");
  let at = multiplierAt(into - t.flightStart);
  if (at >= crash) throw new DenError("crashed");
  if (bet.auto && bet.auto < at) at = bet.auto; // the auto cash-out came first
  const payout = await pay(round.id, player, bet, at);
  if (payout === null) throw new DenError("already");
  return { at, payout };
}

export async function account(player: Address) {
  const [balance, stats, hist] = await Promise.all([
    store.get<number>(K.balance(player)),
    store.hgetall<number>(K.stats(player)),
    store.lrange<{ round: number; stake: number; cashout: number | null; crash: number; profit: number }>(K.hist(player), 50),
  ]);
  const n = (k: string) => Number(stats[k] ?? 0);
  return {
    balance: Number(balance ?? 0),
    stats: { wagered: n("wagered"), won: n("won"), rounds: n("rounds"), wins: n("wins"), best: n("best") },
    history: hist,
  };
}

// ---------------------------------------------------------------- login nonces

export async function issueNonce(nonce: string) {
  await store.set(K.nonce(nonce), 1, { px: 10 * 60_000 });
}

export async function consumeNonce(nonce: string) {
  const ok = (await store.get(K.nonce(nonce))) !== null;
  await store.del(K.nonce(nonce));
  return ok;
}

// ---------------------------------------------------------------- deposits and withdrawals (on-chain)

const chain = LOCAL
  ? defineChain({
      id: 31337,
      name: "local",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8545"] } },
    })
  : baseSepolia;
const transport = http(LOCAL ? undefined : process.env.DRIP_RPC_URL || "https://sepolia.base.org", { retryCount: 3 });
export const publicClient = createPublicClient({ chain, transport });
const token = deployments[chain.id]?.token;

/** House wallet: holds the pot and pays withdrawals (the drip / bot key; anvil #3 locally). */
function houseKey() {
  const key = process.env.DRIP_PRIVATE_KEY || (LOCAL ? "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" : "");
  if (!key) throw new DenError("house-off");
  return key as `0x${string}`;
}
export const houseAddress = () => privateKeyToAccount(houseKey()).address;

/** Credits a tUSD transfer from `player` to the house wallet, once per transaction. */
export async function deposit(player: Address, hash: Hash) {
  if (!token) throw new DenError("house-off");
  const house = houseAddress();
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
  if (receipt.status !== "success") throw new DenError("tx-failed");
  const amount = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: "Transfer" })
    .filter((l) => getAddress(l.address) === getAddress(token) && getAddress(l.args.from) === player && getAddress(l.args.to) === house)
    .reduce((sum, l) => sum + l.args.value, 0n);
  if (amount === 0n) throw new DenError("no-transfer");
  if (!(await store.set(K.deposit(hash), player, { nx: true }))) throw new DenError("already");
  return { balance: await store.incrby(K.balance(player), Number(amount)), amount: Number(amount) };
}

/** Sends `amount` from the player's balance to their wallet. */
export async function withdraw(player: Address, amount: number) {
  if (!token) throw new DenError("house-off");
  if (!Number.isInteger(amount) || amount <= 0) throw new DenError("bad-amount");
  if ((await store.incrby(K.balance(player), -amount)) < 0) {
    await store.incrby(K.balance(player), amount);
    throw new DenError("balance");
  }
  try {
    const wallet = createWalletClient({ account: privateKeyToAccount(houseKey()), chain, transport });
    const hash = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [player, BigInt(amount)] });
    return { hash };
  } catch (e) {
    await store.incrby(K.balance(player), amount);
    console.error("den withdraw failed", e);
    throw new DenError("house-empty");
  }
}

export async function pot() {
  if (!token) return 0;
  return Number(await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [houseAddress()] }));
}
