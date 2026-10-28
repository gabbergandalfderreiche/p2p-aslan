"use client";

import Link from "next/link";
import { zeroAddress, type Address } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { betEscrowAbi, matchBetsAbi } from "@/generated/contracts";
import { DEPLOYMENT, fmtUsd, roleOf, Status, TOKEN_SYMBOL, type Bet } from "@/lib/bets";
import { MATCH_BETS, MatchStatus, useMatches, type MatchBet } from "@/lib/matches";
import { useNow } from "@/lib/time";
import { useT } from "@/i18n/client";

const OPEN_LOOKBACK = 30n; // newest bets scanned for the public list
const POLL = { refetchInterval: 20_000 } as const;

type Item = {
  key: string;
  href: string;
  number: string;
  title: string;
  stake: string;
  status: string;
  tone: "open" | "active" | "disputed" | "done";
  role: string | null;
  open: boolean; // can still be taken by anyone with the link
};

const newestIds = (count: bigint | undefined) => {
  const ids: bigint[] = [];
  const n = count ?? 0n;
  for (let id = n; id > 0n && id > n - OPEN_LOOKBACK; id--) ids.push(id);
  return ids;
};

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** Custom bets (BetEscrow) as list items. */
function useCustomItems(user?: Address) {
  const { t } = useT();
  const escrow = DEPLOYMENT!.escrow;
  const now = useNow();
  const mine = useReadContract({
    address: escrow,
    abi: betEscrowAbi,
    functionName: "betsOf",
    args: [user!],
    query: { enabled: Boolean(user), ...POLL },
  });
  const count = useReadContract({ address: escrow, abi: betEscrowAbi, functionName: "betCount", query: POLL });
  const myIds = [...new Set(mine.data ?? [])];
  const ids = [...new Set([...myIds, ...newestIds(count.data)])];
  const res = useReadContracts({
    contracts: ids.map((id) => ({ address: escrow, abi: betEscrowAbi, functionName: "getBet", args: [id] }) as const),
    query: { enabled: ids.length > 0, ...POLL },
  });

  const items = ids.flatMap((id, i) => {
    const b = res.data?.[i]?.result as Bet | undefined;
    if (!b) return [];
    const role = roleOf(b, user);
    const item: Item = {
      key: `c${id}`,
      href: `/bet?id=${id}`,
      number: t.bet.number(String(id)),
      title: b.claim,
      stake: `${fmtUsd(b.stake)} ${TOKEN_SYMBOL}`,
      status: t.bet.status[b.status],
      tone: b.status === Status.Open ? "open" : b.status === Status.Active ? "active" : b.status === Status.Disputed ? "disputed" : "done",
      role: role === "creator" ? t.bet.creator : role === "taker" || role === "invited" ? t.bet.taker : role === "arbiter" ? t.bet.arbiter : null,
      open: b.status === Status.Open && b.taker === zeroAddress && b.joinBy > now,
    };
    return [{ id, mine: myIds.includes(id), item }];
  });
  return { items, isLoading: res.isLoading || count.isLoading };
}

/** Football bets (MatchBets) as list items. */
function useMatchItems(user?: Address) {
  const { t } = useT();
  const now = useNow();
  const { matches } = useMatches();
  const enabled = Boolean(MATCH_BETS);
  const mine = useReadContract({
    address: MATCH_BETS,
    abi: matchBetsAbi,
    functionName: "betsOf",
    args: [user!],
    query: { enabled: enabled && Boolean(user), ...POLL },
  });
  const count = useReadContract({ address: MATCH_BETS, abi: matchBetsAbi, functionName: "betCount", query: { enabled, ...POLL } });
  const myIds = [...new Set(mine.data ?? [])];
  const ids = [...new Set([...myIds, ...newestIds(count.data)])];
  const res = useReadContracts({
    contracts: ids.map((id) => ({ address: MATCH_BETS, abi: matchBetsAbi, functionName: "getBet", args: [id] }) as const),
    query: { enabled: enabled && ids.length > 0, ...POLL },
  });

  const items = ids.flatMap((id, i) => {
    const b = res.data?.[i]?.result as MatchBet | undefined;
    const m = b && matches.find((x) => x.id === b.matchId);
    if (!b || !m) return [];
    const role = same(b.creator, user) ? t.matches.creator : same(b.taker, user) ? t.matches.taker : null;
    const item: Item = {
      key: `m${id}`,
      href: `/match-bet?id=${id}`,
      number: t.matches.number(String(id)),
      title: `${m.home} – ${m.away}`,
      stake: `${fmtUsd(b.creatorStake)} ${TOKEN_SYMBOL} ${t.bet.stake.toLowerCase()}`,
      status: t.matches.status[b.status],
      tone: b.status === MatchStatus.Open ? "open" : b.status === MatchStatus.Active ? "active" : "done",
      role,
      open: b.status === MatchStatus.Open && b.taker === zeroAddress && m.kickoff > now && !role,
    };
    return [{ id, mine: myIds.includes(id), item }];
  });
  return { items, isLoading: res.isLoading || count.isLoading };
}

export function BetLists() {
  const { t } = useT();
  const { address } = useConnection();
  const custom = useCustomItems(address);
  const football = useMatchItems(address);
  const all = [...football.items, ...custom.items];
  const loading = custom.isLoading || football.isLoading;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      {address && (
        <List
          title={t.app.lists.mine}
          empty={t.app.lists.mineEmpty}
          loading={loading}
          items={all.filter((x) => x.mine).map((x) => x.item)}
        />
      )}
      <List
        title={t.app.lists.open}
        more={{ href: "/open-bets", label: t.app.lists.allOpen }}
        empty={t.app.lists.openEmpty}
        loading={loading}
        items={all
          .filter((x) => x.item.open && !x.item.role)
          .slice(0, 5)
          .map((x) => x.item)}
      />
    </div>
  );
}

const TONES = {
  open: "bg-accent/25 text-accent-ink",
  active: "bg-good/20 text-good",
  disputed: "bg-accent-2/20 text-accent-2",
  done: "bg-surface-2 text-muted",
};

function List({
  title,
  empty,
  loading,
  items,
  more,
}: {
  title: string;
  empty: string;
  loading: boolean;
  items: Item[];
  more?: { href: string; label: string };
}) {
  const { t, path } = useT();
  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold">{title}</h2>
        {more && (
          <Link href={path(more.href)} className="text-sm font-semibold underline">
            {more.label}
          </Link>
        )}
      </div>
      <div className="mt-3 space-y-3">
        {loading && items.length === 0 && <p className="text-sm text-muted">{t.app.lists.loading}</p>}
        {!loading && items.length === 0 && <p className="text-sm text-muted">{empty}</p>}
        {items.map((x) => (
          <Link key={x.key} href={path(x.href)} className="card block p-4 hover:border-accent">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
              <span>{x.number}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TONES[x.tone]}`}>{x.status}</span>
            </div>
            <p className="mt-2 font-semibold">{x.title}</p>
            <div className="mt-2 flex justify-between text-xs text-muted">
              <span className="num">{x.stake}</span>
              {x.role && <span className="font-bold text-accent-ink">{x.role}</span>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Status chip for custom bets, used on the bet page. */
export function StatusChip({ status }: { status: number }) {
  const { t } = useT();
  const tone = status === Status.Open ? "open" : status === Status.Active ? "active" : status === Status.Disputed ? "disputed" : "done";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TONES[tone]}`}>{t.bet.status[status]}</span>;
}
