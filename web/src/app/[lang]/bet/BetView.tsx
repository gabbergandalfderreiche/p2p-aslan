"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Address } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { TxStatus } from "@/components/AppFrame";
import { useConnectModal } from "@/components/ConnectModal";
import { StatusChip } from "../app/BetLists";
import { betEscrowAbi } from "@/generated/contracts";
import {
  actionsFor,
  DEPLOYMENT,
  fmtUsd,
  hasArbiter,
  isInviteOnly,
  Outcome,
  roleOf,
  short,
  Status,
  TOKEN_SYMBOL,
  useTokenBalance,
  type Bet,
  type OutcomeValue,
} from "@/lib/bets";
import { addressUrl } from "@/lib/network";
import { fmtDate, useNow } from "@/lib/time";
import { refetchSoon } from "@/lib/tx";
import { ensureAllowance, useSend } from "@/lib/useSend";
import { useT } from "@/i18n/client";

export function BetView() {
  const { t, path } = useT();
  const params = useSearchParams();
  const raw = params.get("id") ?? "";
  const id = /^\d+$/.test(raw) ? BigInt(raw) : 0n;

  const query = useReadContract({
    address: DEPLOYMENT!.escrow,
    abi: betEscrowAbi,
    functionName: "getBet",
    args: [id],
    query: { enabled: id > 0n, refetchInterval: 15_000 },
  });
  const bet = query.data as Bet | undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={path("/app")} className="text-sm font-semibold text-muted hover:text-ink">
        {t.bet.back}
      </Link>
      {id === 0n || (bet && bet.status === Status.None) ? (
        <p className="card mt-4 p-6 text-muted">{t.bet.notFound}</p>
      ) : !bet ? (
        <p className="mt-4 text-muted">{t.bet.loading}</p>
      ) : (
        <Details id={id} bet={bet} isNew={params.get("new") === "1"} refetch={() => refetchSoon(query.refetch)} />
      )}
    </div>
  );
}

function Details({ id, bet, isNew, refetch }: { id: bigint; bet: Bet; isNew: boolean; refetch: () => void }) {
  const { t, locale } = useT();
  const b = t.bet;
  const { address } = useConnection();
  const now = useNow();
  const role = roleOf(bet, address);
  const can = actionsFor(bet, role, now);

  return (
    <article className="mt-4 space-y-4">
      <section className="card p-6">
        <div className="flex items-center justify-between gap-3 text-sm font-semibold text-muted">
          <span>{b.number(String(id))}</span>
          <StatusChip status={bet.status} />
        </div>
        <div className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">{b.claimLabel}</div>
        <h1 className="font-display mt-1 text-2xl font-extrabold leading-snug md:text-3xl">{bet.claim}</h1>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Fact label={b.stake} value={`${fmtUsd(bet.stake)} ${TOKEN_SYMBOL}`} />
          <Fact label={b.pot} value={`${fmtUsd(bet.stake * 2n)} ${TOKEN_SYMBOL}`} />
          <Fact label={b.joinBy} value={fmtDate(bet.joinBy, locale)} />
          <Fact label={b.decideBy} value={fmtDate(bet.decideBy, locale)} />
        </div>

        <dl className="mt-5 space-y-2 text-sm">
          <Person label={b.creator} who={bet.creator} me={address} />
          <Person label={b.taker} who={bet.status === Status.Open && !isInviteOnly(bet) ? undefined : bet.taker} me={address} fallback={b.nobody} />
          <Person label={b.arbiter} who={hasArbiter(bet) ? bet.arbiter : undefined} me={address} fallback={b.noArbiter} />
        </dl>
        {bet.feeBps > 0 && <p className="mt-3 text-xs text-muted">{b.fee((bet.feeBps / 100).toString())}</p>}

        {(bet.status === Status.Active || bet.status === Status.Disputed) && (
          <div className="mt-5 rounded-2xl bg-surface-2 p-4 text-sm">
            <div className="font-bold">{b.reports}</div>
            <div className="mt-1 text-muted">
              {b.creator}: {b.reportLabel[bet.creatorReport]}
            </div>
            <div className="text-muted">
              {b.taker}: {b.reportLabel[bet.takerReport]}
            </div>
          </div>
        )}
        {bet.status === Status.Settled && (
          <p className="mt-5 rounded-2xl bg-good/15 p-4 font-semibold">{b.outcome[bet.outcome]}</p>
        )}
      </section>

      {bet.status === Status.Open && <Share id={id} bet={bet} highlight={isNew} />}

      <Actions id={id} bet={bet} role={role} can={can} refetch={refetch} />
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="num font-bold">{value}</div>
    </div>
  );
}

function Person({ label, who, me, fallback }: { label: string; who?: Address; me?: Address; fallback?: string }) {
  const { t } = useT();
  const url = who ? addressUrl(who) : null;
  const isMe = Boolean(who && me && who.toLowerCase() === me.toLowerCase());
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-xs font-semibold">
        {!who ? (
          <span className="font-sans text-muted">{fallback}</span>
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            {short(who)}
          </a>
        ) : (
          short(who)
        )}
        {isMe && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 font-sans text-[11px] text-on-accent">{t.bet.you}</span>}
      </dd>
    </div>
  );
}

function Share({ id, bet, highlight }: { id: bigint; bet: Bet; highlight: boolean }) {
  const { t, path } = useT();
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}${path(`/bet?id=${id}`)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link stays visible to copy by hand.
    }
  }

  return (
    <section className={`card p-5 ${highlight ? "border-2 border-accent" : ""}`}>
      {highlight && <p className="mb-2 font-bold text-good">{t.app.create.done}</p>}
      <div className="text-sm font-bold">{t.bet.share}</div>
      <div className="mt-2 flex gap-2">
        <input readOnly value={link} className="field font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button className="btn btn-ghost shrink-0 !py-2 text-sm" onClick={copy}>
          {copied ? t.bet.copied : t.bet.copy}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">{isInviteOnly(bet) ? t.bet.inviteOnly : t.bet.shareHint}</p>
    </section>
  );
}

function Actions({
  id,
  bet,
  role,
  can,
  refetch,
}: {
  id: bigint;
  bet: Bet;
  role: ReturnType<typeof roleOf>;
  can: ReturnType<typeof actionsFor>;
  refetch: () => void;
}) {
  const { t, locale } = useT();
  const b = t.bet;
  const { address } = useConnection();
  const { open } = useConnectModal();
  const send = useSend(t);
  const balance = useTokenBalance(address);
  const escrow = DEPLOYMENT!.escrow;
  const busy = Boolean(send.busy);

  async function act(run: Parameters<typeof send.run>[0]) {
    await send.run(run);
    refetch();
    refetchSoon(balance.refetch);
  }

  const join = () =>
    act(async (step) => {
      await ensureAllowance(step, address!, bet.stake, t.app.create.approving);
      await step(b.joining, (w) => w({ address: escrow, abi: betEscrowAbi, functionName: "join", args: [id] }));
    });
  const cancel = () =>
    act(async (step) => {
      await step(b.cancelling, (w) => w({ address: escrow, abi: betEscrowAbi, functionName: "cancel", args: [id] }));
    });
  const report = (o: OutcomeValue) =>
    act(async (step) => {
      await step(b.reporting, (w) => w({ address: escrow, abi: betEscrowAbi, functionName: "report", args: [id, o] }));
    });
  const arbitrate = (o: OutcomeValue) =>
    act(async (step) => {
      await step(b.arbitrating, (w) => w({ address: escrow, abi: betEscrowAbi, functionName: "arbitrate", args: [id, o] }));
    });
  const finalize = () =>
    act(async (step) => {
      await step(b.finalizing, (w) => w({ address: escrow, abi: betEscrowAbi, functionName: "finalize", args: [id] }));
    });

  const won = role === "creator" ? Outcome.Creator : Outcome.Taker;
  const lost = role === "creator" ? Outcome.Taker : Outcome.Creator;
  const notEnough = balance.data !== undefined && balance.data < bet.stake;

  let body: ReactNode = null;
  if (!address && (bet.status === Status.Open || bet.status === Status.Active || bet.status === Status.Disputed)) {
    body = (
      <button className="btn btn-primary w-full" onClick={open}>
        {t.connect.login}
      </button>
    );
  } else if (can.join) {
    body = (
      <>
        <button className="btn btn-primary w-full" disabled={busy || notEnough} onClick={join}>
          {send.busy ?? b.join(fmtUsd(bet.stake))}
        </button>
        {notEnough && <p className="mt-2 text-sm font-semibold text-bad">{t.app.create.tooMuch}</p>}
      </>
    );
  } else if (can.report) {
    body = (
      <>
        <h2 className="font-display text-xl font-extrabold">{b.reportTitle}</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <button className="btn btn-good" disabled={busy} onClick={() => report(won)}>
            {b.iWon}
          </button>
          <button className="btn btn-bad" disabled={busy} onClick={() => report(lost)}>
            {b.iLost}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => report(Outcome.Draw)}>
            {b.draw}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{send.busy ?? b.reportWarn}</p>
      </>
    );
  } else if (can.arbitrate) {
    body = (
      <>
        <h2 className="font-display text-xl font-extrabold">{b.arbitrateTitle}</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <button className="btn btn-primary" disabled={busy} onClick={() => arbitrate(Outcome.Creator)}>
            {b.creatorWins}
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => arbitrate(Outcome.Taker)}>
            {b.takerWins}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => arbitrate(Outcome.Draw)}>
            {b.draw}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{send.busy ?? b.arbitrateUntil(fmtDate(can.arbiterUntil, locale))}</p>
      </>
    );
  } else if (can.finalize) {
    body = (
      <>
        <p className="mb-3 text-sm text-muted">{b.finalizeHint}</p>
        <button className="btn btn-primary w-full" disabled={busy} onClick={finalize}>
          {send.busy ?? b.finalize}
        </button>
      </>
    );
  } else if (bet.status === Status.Active && can.myReport !== Outcome.None) {
    body = <p className="text-sm text-muted">{b.waitingOther}</p>;
  } else if (address && role === "visitor" && bet.status !== Status.Settled && bet.status !== Status.Cancelled) {
    body = <p className="text-sm text-muted">{isInviteOnly(bet) ? b.inviteOnly : b.notParticipant}</p>;
  }

  // Calling off is offered next to other actions, never instead of them.
  const cancelButton = can.cancel && (
    <button className="btn btn-ghost mt-3 w-full !py-2 text-sm" disabled={busy} onClick={cancel}>
      {send.busy && send.busy === b.cancelling ? b.cancelling : role === "creator" ? b.cancel : b.refundCreator}
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
