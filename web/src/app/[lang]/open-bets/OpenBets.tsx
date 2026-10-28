"use client";

import { useState } from "react";
import Link from "next/link";
import { zeroAddress } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { LeagueFilter } from "@/components/LeagueFilter";
import { TeamBadge } from "../match-bet/MatchBetParts";
import { betEscrowAbi, matchBetsAbi } from "@/generated/contracts";
import { DEPLOYMENT, fmtUsd, Status, TOKEN_SYMBOL, type Bet } from "@/lib/bets";
import { freePicks, groupByLeague, MATCH_BETS, MatchStatus, Pick, useMatches, type MatchBet } from "@/lib/matches";
import { fmtDate, useNow } from "@/lib/time";
import { useT } from "@/i18n/client";

const SCAN = 200n; // newest bets read per contract; older open ones have usually kicked off anyway
const POLL = { refetchInterval: 20_000 } as const;

function newest(count: bigint | undefined) {
  const ids: bigint[] = [];
  const n = count ?? 0n;
  for (let id = n; id > 0n && id > n - SCAN; id--) ids.push(id);
  return ids;
}

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** Bets that anyone with the link can take: football first (by league), then custom claims. */
export function OpenBets() {
  const { t, locale, path } = useT();
  const o = t.open;
  const mt = t.matches;
  const now = useNow();
  const { address } = useConnection();
  const { matches, isLoading: matchesLoading } = useMatches();
  const [league, setLeague] = useState<string | null>(null);

  // Football bets
  const matchCount = useReadContract({
    address: MATCH_BETS,
    abi: matchBetsAbi,
    functionName: "betCount",
    query: { enabled: Boolean(MATCH_BETS), ...POLL },
  });
  const matchIds = newest(matchCount.data);
  const matchBets = useReadContracts({
    contracts: matchIds.map((id) => ({ address: MATCH_BETS, abi: matchBetsAbi, functionName: "getBet", args: [id] }) as const),
    query: { enabled: matchIds.length > 0, ...POLL },
  });
  const football = matchIds.flatMap((id, i) => {
    const b = matchBets.data?.[i]?.result as MatchBet | undefined;
    const m = b && matches.find((x) => x.id === b.matchId);
    if (!b || !m || b.status !== MatchStatus.Open || b.taker !== zeroAddress || m.kickoff <= now + 60) return [];
    return [{ id, bet: b, match: m, competition: m.competition, kickoff: m.kickoff, mine: same(b.creator, address) }];
  });
  const groups = groupByLeague(football);
  const counts = Object.fromEntries(groups.map((g) => [g.league, g.items.length]));
  const shown = groups.filter((g) => league === null || g.league === league);

  // Custom bets
  const escrow = DEPLOYMENT!.escrow;
  const customCount = useReadContract({ address: escrow, abi: betEscrowAbi, functionName: "betCount", query: POLL });
  const customIds = newest(customCount.data);
  const customBets = useReadContracts({
    contracts: customIds.map((id) => ({ address: escrow, abi: betEscrowAbi, functionName: "getBet", args: [id] }) as const),
    query: { enabled: customIds.length > 0, ...POLL },
  });
  const custom = customIds.flatMap((id, i) => {
    const b = customBets.data?.[i]?.result as Bet | undefined;
    if (!b || b.status !== Status.Open || b.taker !== zeroAddress || b.joinBy <= now) return [];
    return [{ id, bet: b, mine: same(b.creator, address) }];
  });

  const loading = matchesLoading || matchBets.isLoading || customBets.isLoading;
  const pickLabel = (p: number, home: string, away: string) =>
    p === Pick.Home ? mt.wins(home) : p === Pick.Away ? mt.wins(away) : mt.draw;

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">{o.title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{o.lead}</p>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold">{o.football}</h2>
          <Link href={path("/app")} className="text-sm font-semibold underline">
            {o.createOwn}
          </Link>
        </div>
        <div className="mt-3">
          <LeagueFilter leagues={groups.map((g) => g.league)} counts={counts} value={league} onChange={setLeague} />
        </div>
        {loading && football.length === 0 && <p className="mt-3 text-sm text-muted">{t.app.lists.loading}</p>}
        {!loading && football.length === 0 && <p className="mt-3 text-sm text-muted">{o.empty}</p>}
        <div className="mt-3 space-y-6">
          {shown.map((g) => (
            <div key={g.league}>
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-accent-ink">{g.league}</h3>
              <ul className="mt-2 grid gap-3 md:grid-cols-2">
                {g.items.map(({ id, bet, match, mine }) => (
                  <li key={String(id)}>
                    <Link href={path(`/match-bet?id=${id}`)} className="card block p-4 hover:border-accent">
                      <div className="flex justify-between gap-3 text-xs text-muted">
                        <span className="num">{fmtDate(match.kickoff, locale)}</span>
                        {mine && <span className="font-bold text-accent-ink">{o.yours}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-2 font-display text-lg font-extrabold">
                        <TeamBadge name={match.home} size={24} />
                        {match.home} – {match.away}
                        <TeamBadge name={match.away} size={24} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-surface-2 p-2.5">
                          <div className="text-[11px] text-muted">{o.theyBet}</div>
                          <div className="font-bold">{pickLabel(bet.creatorPick, match.home, match.away)}</div>
                          <div className="num text-xs text-muted">
                            {fmtUsd(bet.creatorStake)} {TOKEN_SYMBOL}
                          </div>
                        </div>
                        <div className="rounded-xl border border-accent/60 p-2.5">
                          <div className="text-[11px] text-muted">{o.youBet}</div>
                          <div className="font-bold">
                            {freePicks(bet.creatorPick)
                              .map((p) => pickLabel(p, match.home, match.away))
                              .join(` ${o.or} `)}
                          </div>
                          <div className="num text-xs text-muted">
                            {fmtUsd(bet.takerStake)} {TOKEN_SYMBOL}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="num text-muted">{o.win(fmtUsd(bet.creatorStake + bet.takerStake))}</span>
                        <span className="font-bold text-accent-ink">{mine ? o.view : o.take} →</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {custom.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">{o.custom}</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {custom.map(({ id, bet, mine }) => (
              <li key={String(id)}>
                <Link href={path(`/bet?id=${id}`)} className="card block p-4 hover:border-accent">
                  <div className="flex justify-between gap-3 text-xs text-muted">
                    <span className="num">
                      {t.bet.joinBy}: {fmtDate(bet.joinBy, locale)}
                    </span>
                    {mine && <span className="font-bold text-accent-ink">{o.yours}</span>}
                  </div>
                  <p className="mt-1 font-semibold">{bet.claim}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="num text-muted">
                      {fmtUsd(bet.stake)} {TOKEN_SYMBOL} · {o.win(fmtUsd(bet.stake * 2n))}
                    </span>
                    <span className="font-bold text-accent-ink">{mine ? o.view : o.take} →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
