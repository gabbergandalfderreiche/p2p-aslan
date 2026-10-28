"use client";

import Link from "next/link";
import { zeroAddress, type Address } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { betEscrowAbi } from "@/generated/contracts";
import { DEPLOYMENT, fmtUsd, roleOf, Status, TOKEN_SYMBOL, type Bet } from "@/lib/bets";
import { useNow } from "@/lib/time";
import { useT } from "@/i18n/client";

const OPEN_LOOKBACK = 30n; // newest bets scanned for the public list

/** Reads several bets at once; returns [id, bet] pairs in the given order. */
function useBets(ids: bigint[]) {
  const escrow = DEPLOYMENT!.escrow;
  const res = useReadContracts({
    contracts: ids.map((id) => ({ address: escrow, abi: betEscrowAbi, functionName: "getBet", args: [id] }) as const),
    query: { enabled: ids.length > 0, refetchInterval: 20_000 },
  });
  const bets = ids.flatMap((id, i) => {
    const bet = res.data?.[i]?.result as Bet | undefined;
    return bet ? [[id, bet] as const] : [];
  });
  return { bets, isLoading: res.isLoading };
}

export function BetLists() {
  const { t } = useT();
  const { address } = useConnection();
  const escrow = DEPLOYMENT!.escrow;
  const now = useNow();

  const mine = useReadContract({
    address: escrow,
    abi: betEscrowAbi,
    functionName: "betsOf",
    args: [address!],
    query: { enabled: Boolean(address), refetchInterval: 20_000 },
  });
  const count = useReadContract({ address: escrow, abi: betEscrowAbi, functionName: "betCount", query: { refetchInterval: 20_000 } });

  const myIds = [...new Set(mine.data ?? [])].reverse();
  const newest = count.data ?? 0n;
  const recentIds: bigint[] = [];
  for (let id = newest; id > 0n && id > newest - OPEN_LOOKBACK; id--) recentIds.push(id);

  const myBets = useBets(myIds);
  const recent = useBets(recentIds);
  const openBets = recent.bets.filter(
    ([, b]) => b.status === Status.Open && b.taker === zeroAddress && b.joinBy > now && roleOf(b, address) === "visitor",
  );

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      {address && (
        <List title={t.app.lists.mine} empty={t.app.lists.mineEmpty} loading={myBets.isLoading} bets={myBets.bets} user={address} />
      )}
      <List title={t.app.lists.open} empty={t.app.lists.openEmpty} loading={recent.isLoading} bets={openBets} user={address} />
    </div>
  );
}

function List({
  title,
  empty,
  loading,
  bets,
  user,
}: {
  title: string;
  empty: string;
  loading: boolean;
  bets: (readonly [bigint, Bet])[];
  user?: Address;
}) {
  const { t, path } = useT();
  return (
    <section>
      <h2 className="font-display text-xl font-extrabold">{title}</h2>
      <div className="mt-3 space-y-3">
        {loading && <p className="text-sm text-muted">{t.app.lists.loading}</p>}
        {!loading && bets.length === 0 && <p className="text-sm text-muted">{empty}</p>}
        {bets.map(([id, b]) => {
          const role = roleOf(b, user);
          return (
            <Link key={String(id)} href={path(`/bet?id=${id}`)} className="card block p-4 hover:border-accent">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
                <span>{t.bet.number(String(id))}</span>
                <StatusChip status={b.status} />
              </div>
              <p className="mt-2 font-semibold">{b.claim}</p>
              <div className="mt-2 flex justify-between text-xs text-muted">
                <span className="num">
                  {fmtUsd(b.stake)} {TOKEN_SYMBOL} {t.bet.stake.toLowerCase()}
                </span>
                {role !== "visitor" && <span className="font-bold text-accent-ink">{roleLabel(role, t)}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function roleLabel(role: string, t: ReturnType<typeof useT>["t"]) {
  if (role === "creator") return t.bet.creator;
  if (role === "taker" || role === "invited") return t.bet.taker;
  return t.bet.arbiter;
}

export function StatusChip({ status }: { status: number }) {
  const { t } = useT();
  const tone =
    status === Status.Open
      ? "bg-accent/25 text-accent-ink"
      : status === Status.Active
        ? "bg-good/20 text-good"
        : status === Status.Disputed
          ? "bg-accent-2/20 text-accent-2"
          : "bg-surface-2 text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{t.bet.status[status]}</span>;
}
