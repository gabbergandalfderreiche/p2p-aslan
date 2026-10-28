"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zeroAddress } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { TxStatus } from "@/components/AppFrame";
import { useConnectModal } from "@/components/ConnectModal";
import { Confetti, DuelDivider, Position, Scoreboard, ShareCard, Slip, Timeline } from "./MatchBetParts";
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
  freePicks,
  PICK_SIGN,
  unpicked,
  useLiveness,
  useMatch,
  type Match,
  type MatchBet,
} from "@/lib/matches";
import { fmtDate, useNow } from "@/lib/time";
import { refetchSoon } from "@/lib/tx";
import { ensureAllowance, useSend } from "@/lib/useSend";
import { useStarterKit } from "@/lib/useStarterKit";
import { StarterKit } from "@/components/StarterKit";
import { UmaInfo } from "@/components/UmaInfo";
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
    p === Pick.Home ? mt.wins(match.home) : p === Pick.Away ? mt.wins(match.away) : mt.draw;
  const [freeA, freeB] = freePicks(bet.creatorPick);
  const third = unpicked(bet);
  const winsOn = (picks: number[]) => `${mt.winsOn} ${picks.map((p) => mt.resultLabel[p]).join(" / ")}`;
  const pot = bet.creatorStake + bet.takerStake;
  const fmt = (v: bigint) => `${fmtUsd(v)} ${TOKEN_SYMBOL}`;

  const me = address?.toLowerCase();
  const role = me === bet.creator.toLowerCase() ? "creator" : me && me === bet.taker.toLowerCase() ? "taker" : "visitor";
  const open = bet.status === MatchStatus.Open;
  const settled = bet.status === MatchStatus.Settled;
  const cancelled = bet.status === MatchStatus.Cancelled;
  const kicked = now > 0 && now >= match.kickoff;
  const resultKnown = match.result !== Result.None;
  const timedOut = now > match.kickoff + RESULT_TIMEOUT && !resultKnown;

  // 0 created, 1 opponent in, 2 kicked off, 3 result reported/confirmed, 4 paid out
  // Index of the current step; everything before it is done (see Timeline).
  const step = settled
    ? 5
    : resultKnown
      ? 4
      : bet.status === MatchStatus.Active
        ? kicked
          ? 3
          : 2
        : 1;

  let result: ReactNode;
  if (resultKnown) result = mt.resultFinal(mt.resultLabel[match.result]);
  else if (hasPendingResult(match))
    result = mt.resultPending(mt.resultLabel[match.asserted], fmtDate(match.assertedAt + liveness, locale));
  else if (timedOut) result = mt.resultTimeout;
  else result = mt.resultOpen;

  // What this visitor has at stake and what happens next, in one sentence.
  const myPick = role === "creator" ? bet.creatorPick : bet.takerPick;
  const myStake = role === "creator" ? bet.creatorStake : bet.takerStake;
  const iWon = (role === "creator" && bet.payout === Payout.Creator) || (role === "taker" && bet.payout === Payout.Taker);
  // Confetti right after creating a bet, after accepting one, and when you open a bet you won.
  const [burst, setBurst] = useState(() => (isNew || (settled && iWon) ? 1 : 0));
  let position: { tone: "accent" | "good" | "muted" | "bad"; text: ReactNode };
  if (cancelled) position = { tone: "muted", text: mt.position.cancelled };
  else if (role === "visitor") {
    position = open && !kicked
      ? { tone: "accent", text: mt.position.offer(fmt(bet.takerStake), pickLabel(freeA), pickLabel(freeB), fmt(pot)) }
      : { tone: "muted", text: settled ? mt.payout[bet.payout] : open ? mt.position.notTaken : mt.position.watching };
  } else {
    const stakeText = mt.position.mine(fmt(myStake), pickLabel(myPick));
    const next = settled
      ? bet.payout === Payout.Refund
        ? mt.position.refunded
        : iWon
          ? mt.position.won(fmt(pot))
          : mt.position.lost
      : open
        ? kicked
          ? mt.position.expired
          : mt.position.waitOpponent
        : resultKnown || hasPendingResult(match)
          ? mt.position.waitConfirm
          : kicked
            ? mt.position.waitResult
            : mt.position.waitKickoff(fmtDate(match.kickoff, locale));
    position = {
      tone: settled ? (iWon ? "good" : bet.payout === Payout.Refund ? "muted" : "bad") : open && kicked ? "bad" : "accent",
      text: (
        <>
          {stakeText} <span className="font-normal text-muted">{next}</span>
        </>
      ),
    };
  }

  const slipState = (side: "creator" | "taker") =>
    settled && bet.payout !== Payout.Refund
      ? (side === "creator") === (bet.payout === Payout.Creator)
        ? "won"
        : "lost"
      : side === "taker" && open
        ? "open"
        : "normal";

  return (
    <article className="mt-4 space-y-4">
      <Scoreboard
        competition={match.competition}
        home={match.home}
        away={match.away}
        kickoff={match.kickoff}
        now={now}
        pot={pot}
        status={
          open
            ? kicked
              ? mt.notTakenChip
              : mt.status[bet.status]
            : bet.status === MatchStatus.Active
              ? !kicked
                ? mt.chip.ready
                : now < match.kickoff + 2 * 3600
                  ? mt.chip.live
                  : mt.chip.afterMatch
              : mt.status[bet.status]
        }
        score={resultKnown ? mt.resultLabel[match.result] : null}
      />

      <Position tone={position.tone}>{position.text}</Position>

      {open && !kicked && role === "creator" && (
        <ShareCard
          href={`/match-bet?id=${id}`}
          text={mt.shareText(match.home, match.away)}
          highlight={isNew}
          inviteOnly={isInviteOnlyMatchBet(bet)}
        />
      )}

      <Actions id={id} bet={bet} match={match} refetch={refetch} onJoined={() => setBurst(Date.now())} />
      <Confetti trigger={burst} />

      <section className="card p-5">
        <div className="relative grid gap-3 sm:grid-cols-2">
          <DuelDivider />
          <Slip
            role={mt.creator}
            who={bet.creator}
            me={address}
            pick={pickLabel(bet.creatorPick)}
            winsOn={winsOn([bet.creatorPick])}
            stake={bet.creatorStake}
            state={slipState("creator")}
          />
          <Slip
            role={mt.taker}
            who={open && bet.taker === zeroAddress ? null : bet.taker}
            me={address}
            pick={open ? mt.takerChooses(pickLabel(freeA), pickLabel(freeB)) : pickLabel(bet.takerPick)}
            winsOn={open ? mt.sameStakeShort : winsOn([bet.takerPick])}
            stake={bet.takerStake}
            state={slipState("taker")}
          />
        </div>
        {!open && third !== undefined && (
          <p className="mt-3 text-center text-xs text-muted">{mt.thirdRefund(pickLabel(third))}</p>
        )}
        <div className="mt-6">
          <Timeline step={step} cancelled={cancelled} />
        </div>
        <div className="mt-5 rounded-2xl bg-surface-2 p-4 text-sm">
          <p className="font-semibold">{result}</p>
          <p className="mt-1 text-xs text-muted">{mt.regularTime}</p>
          <UmaInfo className="mt-2" />
        </div>
        <p className="mt-3 text-xs text-muted">
          {mt.number(String(id))}
          {bet.feeBps > 0 && ` · ${t.bet.fee((bet.feeBps / 100).toString())}`}
        </p>
      </section>

    </article>
  );
}

function Actions({
  id,
  bet,
  match,
  refetch,
  onJoined,
}: {
  id: bigint;
  bet: MatchBet;
  match: Match;
  refetch: () => void;
  onJoined: () => void;
}) {
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
  const kit = useStarterKit(address);
  const notEnough = kit.balance < bet.takerStake;
  const needsSetup = kit.needsGas || notEnough;

  async function act(run: Parameters<typeof send.run>[0], onSuccess?: () => void) {
    if ((await send.run(run)) && onSuccess) onSuccess();
    refetch();
    payout.refetch();
    refetchSoon(balance.refetch);
  }

  const join = (pick: number) =>
    act(async (step) => {
      await ensureAllowance(step, address!, contract, bet.takerStake, t.app.create.approving);
      await step(t.bet.joining, (w) =>
        w({ address: contract, abi: matchBetsAbi, functionName: "join", args: [id, pick] }),
      );
    }, onJoined);
  const pickLabel = (p: number) => (p === Pick.Home ? mt.wins(match.home) : p === Pick.Away ? mt.wins(match.away) : mt.draw);
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
        {needsSetup && (
          <div className="mb-3">
            <StarterKit kit={kit} need={bet.takerStake} />
          </div>
        )}
        <div className="text-sm font-bold">{mt.yourChoice(fmtUsd(bet.takerStake))}</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {freePicks(bet.creatorPick).map((p) => (
            <button key={p} className="btn btn-primary" disabled={busy || needsSetup} onClick={() => join(p)}>
              <span className="rounded-md bg-black/15 px-1.5 py-0.5 text-xs">{PICK_SIGN[p]}</span>
              {pickLabel(p)}
            </button>
          ))}
        </div>
        {send.busy && <p className="mt-2 text-sm text-muted">{send.busy}</p>}
        {notEnough && !kit.canClaim && !kit.needsGas && (
          <p className="mt-2 text-sm font-semibold text-bad">{t.app.create.tooMuch}</p>
        )}
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
