import { zeroAddress, zeroHash, type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { matchBetsAbi } from "@/generated/contracts";
import { DEPLOYMENT } from "./bets";

/** MatchBets address on the active chain; undefined until it is deployed there. */
export const MATCH_BETS = DEPLOYMENT?.matchBets;

/** Same order as the enums in MatchBets.sol. */
export const Result = { None: 0, Home: 1, Draw: 2, Away: 3, Void: 4 } as const;
export const Pick = { None: 0, Home: 1, Draw: 2, Away: 3 } as const;
export const MatchStatus = { None: 0, Open: 1, Active: 2, Settled: 3, Cancelled: 4 } as const;
export const Payout = { None: 0, Creator: 1, Taker: 2, Refund: 3 } as const;
export type PickValue = (typeof Pick)[keyof typeof Pick];

export const RESULT_DELAY = 2 * 3600; // MatchBets.RESULT_DELAY
export const RESULT_TIMEOUT = 14 * 86_400; // MatchBets.RESULT_TIMEOUT

export type Match = {
  kickoff: number;
  result: number;
  asserted: number;
  assertedAt: number;
  assertionId: `0x${string}`;
  home: string;
  away: string;
  competition: string;
};

export type MatchBet = {
  creator: Address;
  creatorStake: bigint;
  taker: Address;
  takerStake: bigint;
  matchId: bigint;
  creatorPick: number;
  takerPick: number;
  status: number;
  payout: number;
  feeBps: number;
};

export const hasPendingResult = (m: Match) => m.assertionId !== zeroHash;
export const isInviteOnlyMatchBet = (b: MatchBet) => b.status === MatchStatus.Open && b.taker !== zeroAddress;

/** Every listed match, newest listing last. */
export function useMatches() {
  const address = MATCH_BETS;
  const count = useReadContract({
    address,
    abi: matchBetsAbi,
    functionName: "matchCount",
    query: { enabled: Boolean(address), refetchInterval: 60_000 },
  });
  const ids = useReadContract({
    address,
    abi: matchBetsAbi,
    functionName: "matchIds",
    args: [0n, count.data ?? 0n],
    query: { enabled: Boolean(address && count.data), refetchInterval: 60_000 },
  });
  const list = ids.data ?? [];
  const details = useReadContracts({
    contracts: list.map((id) => ({ address, abi: matchBetsAbi, functionName: "getMatch", args: [id] }) as const),
    query: { enabled: list.length > 0, refetchInterval: 60_000 },
  });
  const matches = list.flatMap((id, i) => {
    const m = details.data?.[i]?.result as Match | undefined;
    return m ? [{ id, ...m }] : [];
  });
  return { matches, isLoading: count.isLoading || ids.isLoading || details.isLoading };
}

export function useMatch(id: bigint | undefined) {
  return useReadContract({
    address: MATCH_BETS,
    abi: matchBetsAbi,
    functionName: "getMatch",
    args: [id ?? 0n],
    query: { enabled: Boolean(MATCH_BETS && id), refetchInterval: 15_000 },
  });
}

/** The three outcomes in the usual 1 / X / 2 order. */
export const PICKS = [Pick.Home, Pick.Draw, Pick.Away] as const;
export const PICK_SIGN: Record<number, string> = { [Pick.Home]: "1", [Pick.Draw]: "X", [Pick.Away]: "2" };

/** The two outcomes the creator left for the opponent. */
export const freePicks = (creatorPick: number) => PICKS.filter((p) => p !== creatorPick);

/** The outcome nobody picked; if it happens, both get their stake back. */
export const unpicked = (bet: { creatorPick: number; takerPick: number }) =>
  PICKS.find((p) => p !== bet.creatorPick && p !== bet.takerPick);

/** Dispute window of a result report in seconds (2 h on Base Sepolia, 60 s locally). */
export function useLiveness() {
  const q = useReadContract({
    address: MATCH_BETS,
    abi: matchBetsAbi,
    functionName: "liveness",
    query: { enabled: Boolean(MATCH_BETS), staleTime: Infinity },
  });
  return Number(q.data ?? 7200n);
}

// Most-followed competitions first; anything else follows alphabetically.
const LEAGUE_ORDER = ["UEFA Champions League", "Bundesliga", "Premier League", "Primera Division", "Serie A", "Ligue 1"];

/** Competitions in display order. */
export function leaguesOf(items: { competition: string }[]) {
  const names = [...new Set(items.map((m) => m.competition || "–"))];
  const rank = (n: string) => (LEAGUE_ORDER.includes(n) ? LEAGUE_ORDER.indexOf(n) : LEAGUE_ORDER.length);
  return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Items grouped by competition (in display order), each group sorted by kickoff. */
export function groupByLeague<T extends { competition: string; kickoff: number }>(items: T[]) {
  return leaguesOf(items).map((league) => ({
    league,
    items: items.filter((m) => (m.competition || "–") === league).sort((a, b) => a.kickoff - b.kickoff),
  }));
}

// Quotes are decimal odds in hundredths, like the contract: 200 = 2.00 = equal stakes.
export const QUOTE_PRESETS = [150, 200, 250, 300] as const;
export const MIN_QUOTE = 101;
export const MAX_QUOTE = 1000;

/** Opponent's stake for a creator stake at `quote` (same rounding as MatchBets.create). */
export const takerStakeFor = (stake: bigint, quote: number) => (stake * BigInt(quote - 100)) / 100n;

/** Effective quote of one side: what it gets back (the pot) per unit staked, in hundredths. */
export const quoteOf = (own: bigint, pot: bigint) => (own > 0n ? Number((pot * 100n) / own) : 0);

/** "2,5" / "2.50" -> 250; NaN if not a number. */
export const parseQuote = (input: string) => Math.round(Number(input.replace(",", ".")) * 100);

export const fmtQuote = (hundredths: number, locale: string) =>
  (hundredths / 100).toLocaleString(locale === "de" ? "de-CH" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
