import { erc20Abi, formatUnits, parseUnits, zeroAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { deployments } from "@/generated/contracts";
import { activeChain } from "./network";

/** Addresses on the active chain; undefined until the contracts are deployed there. */
export const DEPLOYMENT = deployments[activeChain.id];

export const TOKEN_DECIMALS = 6;
export const TOKEN_SYMBOL = "tUSD";
export const MAX_CLAIM_BYTES = 280;
export const ARBITER_WINDOW_DAYS = 7;

/** Same order as the enums in BetEscrow.sol. */
export const Status = { None: 0, Open: 1, Active: 2, Disputed: 3, Settled: 4, Cancelled: 5 } as const;
export const Outcome = { None: 0, Creator: 1, Taker: 2, Draw: 3 } as const;
export type OutcomeValue = (typeof Outcome)[keyof typeof Outcome];

export type Bet = {
  creator: Address;
  joinBy: number;
  decideBy: number;
  status: number;
  outcome: number;
  taker: Address;
  creatorReport: number;
  takerReport: number;
  disputedAt: number;
  feeBps: number;
  arbiter: Address;
  stake: bigint;
  claim: string;
};

export type Role = "creator" | "taker" | "arbiter" | "invited" | "visitor";

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** How the connected wallet relates to a bet. */
export function roleOf(bet: Bet, user?: Address): Role {
  if (!user) return "visitor";
  if (same(bet.creator, user)) return "creator";
  if (same(bet.arbiter, user)) return "arbiter";
  if (same(bet.taker, user)) return bet.status === Status.Open ? "invited" : "taker";
  return "visitor";
}

export const hasArbiter = (bet: Bet) => bet.arbiter !== zeroAddress;
export const isInviteOnly = (bet: Bet) => bet.status === Status.Open && bet.taker !== zeroAddress;

/** What the wallet can do right now (mirrors the checks in BetEscrow.sol). */
export function actionsFor(bet: Bet, role: Role, now: number) {
  const open = bet.status === Status.Open;
  const active = bet.status === Status.Active;
  const disputed = bet.status === Status.Disputed;
  const arbiterUntil = bet.disputedAt + ARBITER_WINDOW_DAYS * 86_400;
  const myReport = role === "creator" ? bet.creatorReport : role === "taker" ? bet.takerReport : Outcome.None;
  return {
    join:
      open &&
      now <= bet.joinBy &&
      (role === "invited" || (role === "visitor" && bet.taker === zeroAddress)),
    cancel: open && (role === "creator" || now > bet.joinBy),
    report: active && now <= bet.decideBy && (role === "creator" || role === "taker") && myReport === Outcome.None,
    myReport,
    arbitrate: disputed && role === "arbiter" && now <= arbiterUntil,
    finalize: (active && now > bet.decideBy) || (disputed && now > arbiterUntil),
    arbiterUntil,
  };
}

export const fmtUsd = (value: bigint) =>
  Number(formatUnits(value, TOKEN_DECIMALS)).toLocaleString("de-CH", { maximumFractionDigits: 2 });

export function parseUsd(input: string) {
  try {
    return input ? parseUnits(input.replace(",", "."), TOKEN_DECIMALS) : 0n;
  } catch {
    return 0n;
  }
}

export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Test-dollar balance; one shared query, so a refetch anywhere updates every view of it. */
export function useTokenBalance(user?: Address) {
  return useReadContract({
    address: DEPLOYMENT?.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [user!],
    query: { enabled: Boolean(user && DEPLOYMENT) },
  });
}
