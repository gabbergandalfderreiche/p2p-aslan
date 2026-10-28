"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zeroAddress } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { TxStatus } from "@/components/AppFrame";
import { useConnectModal } from "@/components/ConnectModal";
import { Fact, Person, Share } from "../bet/BetView";
import { matchBetsAbi } from "@/generated/contracts";
import { fmtUsd, TOKEN_SYMBOL, useTokenBalance } from "@/lib/bets";
import {
  hasPendingResult,
  isInviteOnlyMatchBet,
  MATCH_BETS,
  MatchStatus,
  Payout,
  Pick,
  RESULT_TIMEOUT,
  Result,
  takerWinsOn,
  useLiveness,
  useMatch,
  type Match,
  type MatchBet,
} from "@/lib/matches";
import { fmtDate, useNow } from "@/lib/time";
import { refetchSoon } from "@/lib/tx";
import { ensureAllowance, useSend } from "@/lib/useSend";
import { useT } from "@/i18n/client";

export function MatchBetView() {
  const { t, path } = useT();
  const params = useSearchParams();
  const raw = params.get("id") ?? "";
  const id = /^\d+$/.test(raw) ? BigInt(raw) : 0n;

  const betQuery = useReadContract({
    address: MATCH_BETS,
    abi: matchBetsAbi,
    functionName: "getBet",
    args: [id],
    query: { enabled: Boolean(MATCH_BETS) && id > 0n, refetchInterval: 15_000 },
  });
  const bet = betQuery.data as MatchBet | undefined;
  const matchQuery = useMatch(bet?.matchId);
  const match = matchQuery.data as Match | undefined;

  const refetch = () =>
    refetchSoon(() => {
      betQuery.refetch();
      matchQuery.refetch();
    });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={path("/app")} className="text-sm font-semibold text-muted hover:text-ink">
        {t.bet.back}
      </Link>
      {!MATCH_BETS || id === 0n || (bet && bet.status === MatchStatus.None) ? (
        <p className="card mt-4 p-6 text-muted">{t.bet.notFound}</p>
      ) : !bet || !match ? (
        <p className="mt-4 text-muted">{t.bet.loading}</p>
      ) : (
        <Details id={id} bet={bet} match={match} isNew={params.get("new") === "1"} refetch={refetch} />
      )}
    </div>
  );
}

function Details({ id, bet, match, isNew, refetch }: { id: bigint; bet: MatchBet; match: Match; isNew: boolean; refetch: () => void }) {
  const { t, locale } = useT();
  const mt = t.matches;
  const { address } = useConnection();
  const now = useNow();
  const liveness = useLiveness();

  const pickLabel = (p: number) =>
    p === Pick.Home ? mt.wins(match.home) : p === Pick.Away ? mt.wins(match.away) : p === Pick.Draw ? mt.draw : mt.other;
  const winsOn = (picks: number[]) => picks.map((p) => mt.resultLabel[p]).join(" / ");
  const timedOut = now > match.kickoff + RESULT_TIMEOUT && match.result === Result.None;

  let result: ReactNode;
  if (match.result !== Result.None) result = mt.resultFinal(mt.resultLabel[match.result]);
  else if (hasPendingResult(match))
    result = mt.resultPending(mt.resultLabel[match.asserted], fmtDate(match.assertedAt + liveness, locale));
  else if (timedOut) result = mt.resultTimeout;
  else result = mt.resultOpen;

  return (
    <article className="mt-4 space-y-4">
      <section className="card p-6">
        <div className="flex items-center justify-between gap-3 text-sm font-semibold text-muted">
          <span>{mt.number(String(id))}</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold">{mt.status[bet.status]}</span>
        </div>
        <div className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">{match.competition}</div>
        <h1 className="font-display mt-1 text-2xl font-extrabold leading-snug md:text-3xl">
          {match.home} – {match.away}
        </h1>
        <p className="num text-sm text-muted">
          {mt.kickoff}: {fmtDate(match.kickoff, locale)}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Side
            title={mt.creator}
            pick={pickLabel(bet.creatorPick)}
            winsOn={`${mt.winsOn} ${winsOn([bet.creatorPick])}`}
            stake={bet.creatorStake}
            won={bet.payout === Payout.Creator}
          />
          <Side
            title={mt.taker}
            pick={pickLabel(bet.takerPick)}
            winsOn={`${mt.winsOn} ${winsOn(takerWinsOn(bet))}`}
            stake={bet.takerStake}
            won={bet.payout === Payout.Taker}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Fact label={t.bet.pot} value={`${fmtUsd(bet.creatorStake + bet.takerStake)} ${TOKEN_SYMBOL}`} />
          <Fact label={t.bet.joinBy} value={fmtDate(match.kickoff, locale)} />
        </div>

        <dl className="mt-5 space-y-2 text-sm">
          <Person label={mt.creator} who={bet.creator} me={address} />
          <Person
            label={mt.taker}
            who={bet.status === MatchStatus.Open && bet.taker === zeroAddress ? undefined : bet.taker}
            me={address}
            fallback={t.bet.nobody}
          />
        </dl>
        {bet.feeBps > 0 && <p className="mt-3 text-xs text-muted">{t.bet.fee((bet.feeBps / 100).toString())}</p>}

        <div className="mt-5 rounded-2xl bg-surface-2 p-4 text-sm">
          <p className="font-semibold">{result}</p>
          <p className="mt-1 text-xs text-muted">{mt.regularTime}</p>
        </div>
        {bet.status === MatchStatus.Settled && (
          <p className="mt-3 rounded-2xl bg-good/15 p-4 font-semibold">{mt.payout[bet.payout]}</p>
        )}
      </section>

      {bet.status === MatchStatus.Open && now < match.kickoff && (
        <Share href={`/match-bet?id=${id}`} highlight={isNew} inviteOnly={isInviteOnlyMatchBet(bet)} />
      )}

      <Actions id={id} bet={bet} match={match} refetch={refetch} />
    </article>
  );
}

function Side({ title, pick, winsOn, stake, won }: { title: string; pick: string; winsOn: string; stake: bigint; won: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${won ? "border-good bg-good/10" : "border-line"}`}>
      <div className="text-xs text-muted">{title}</div>
      <div className="mt-1 text-lg font-extrabold">{pick}</div>
      <div className="text-xs text-muted">{winsOn}</div>
      <div className="num mt-2 font-bold">
        {fmtUsd(stake)} {TOKEN_SYMBOL}
      </div>
    </div>
  );
}

function Actions({ id, bet, match, refetch }: { id: bigint; bet: MatchBet; match: Match; refetch: () => void }) {
  const { t } = useT();
  const mt = t.matches;
  const { address } = useConnection();
  const { open } = useConnectModal();
  const now = useNow();
  const liveness = useLiveness();
  const send = useSend(t);
  const balance = useTokenBalance(address);
  const contract = MATCH_BETS!;
  const busy = Boolean(send.busy);

  const payout = useReadContract({
    address: contract,
    abi: matchBetsAbi,
    functionName: "payoutOf",
    args: [id],
    query: { enabled: bet.status === MatchStatus.Active, refetchInterval: 30_000 },
  });

  const me = address?.toLowerCase();
  const isCreator = me === bet.creator.toLowerCase();
  const invited = bet.taker !== zeroAddress;
  const beforeKickoff = now > 0 && now < match.kickoff;
  const canJoin =
    bet.status === MatchStatus.Open && beforeKickoff && !isCreator && (!invited || me === bet.taker.toLowerCase());
  const canCancel = bet.status === MatchStatus.Open && (isCreator || (now > 0 && !beforeKickoff));
  const canSettle = bet.status === MatchStatus.Active && payout.data !== undefined && payout.data !== Payout.None;
  const canConfirm =
    bet.status === MatchStatus.Active &&
    match.result === Result.None &&
    hasPendingResult(match) &&
    now >= match.assertedAt + liveness;
  const notEnough = balance.data !== undefined && balance.data < bet.takerStake;

  async function act(run: Parameters<typeof send.run>[0]) {
    await send.run(run);
    refetch();
    payout.refetch();
    refetchSoon(balance.refetch);
  }

  const join = () =>
    act(async (step) => {
      await ensureAllowance(step, address!, contract, bet.takerStake, t.app.create.approving);
      await step(t.bet.joining, (w) => w({ address: contract, abi: matchBetsAbi, functionName: "join", args: [id] }));
    });
  const cancel = () =>
    act(async (step) => {
      await step(t.bet.cancelling, (w) => w({ address: contract, abi: matchBetsAbi, functionName: "cancel", args: [id] }));
    });
  const settle = () =>
    act(async (step) => {
      await step(mt.settling, (w) => w({ address: contract, abi: matchBetsAbi, functionName: "settle", args: [id] }));
    });
  const confirm = () =>
    act(async (step) => {
      await step(mt.confirming, (w) =>
        w({ address: contract, abi: matchBetsAbi, functionName: "settleResult", args: [bet.matchId] }),
      );
    });

  let body: ReactNode = null;
  if (!address && (bet.status === MatchStatus.Open || canSettle)) {
    body = (
      <button className="btn btn-primary w-full" onClick={open}>
        {t.connect.login}
      </button>
    );
  } else if (canJoin) {
    body = (
      <>
        <button className="btn btn-primary w-full" disabled={busy || notEnough} onClick={join}>
          {send.busy ?? mt.join(fmtUsd(bet.takerStake))}
        </button>
        {notEnough && <p className="mt-2 text-sm font-semibold text-bad">{t.app.create.tooMuch}</p>}
      </>
    );
  } else if (bet.status === MatchStatus.Open && !beforeKickoff && now > 0 && !isCreator) {
    body = <p className="text-sm text-muted">{mt.started}</p>;
  } else if (bet.status === MatchStatus.Open && address && !isCreator && invited) {
    body = <p className="text-sm text-muted">{t.bet.inviteOnly}</p>;
  } else if (canSettle) {
    body = (
      <>
        <p className="mb-3 text-sm text-muted">{mt.settleHint}</p>
        <button className="btn btn-good w-full" disabled={busy} onClick={settle}>
          {send.busy ?? mt.settle}
        </button>
      </>
    );
  } else if (canConfirm && address) {
    body = (
      <button className="btn btn-ghost w-full" disabled={busy} onClick={confirm}>
        {send.busy ?? mt.confirm}
      </button>
    );
  }

  const cancelButton = canCancel && address && (
    <button className="btn btn-ghost mt-3 w-full !py-2 text-sm" disabled={busy} onClick={cancel}>
      {send.busy === t.bet.cancelling ? t.bet.cancelling : isCreator ? t.bet.cancel : t.bet.refundCreator}
    </button>
  );

  if (!body && !cancelButton && !send.error && !send.hash) return null;
  return (
    <section className="card p-5">
      {body}
      {cancelButton}
      <TxStatus error={send.error} hash={send.hash} />
    </section>
  );
}
