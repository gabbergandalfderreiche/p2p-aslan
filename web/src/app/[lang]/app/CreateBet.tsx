"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, parseEventLogs, zeroAddress, type Address } from "viem";
import { useConnection } from "wagmi";
import { getTransactionReceipt } from "wagmi/actions";
import { TxStatus } from "@/components/AppFrame";
import { useConnectModal } from "@/components/ConnectModal";
import { betEscrowAbi } from "@/generated/contracts";
import { byteLength, DEPLOYMENT, MAX_CLAIM_BYTES, parseUsd, TOKEN_SYMBOL, useTokenBalance } from "@/lib/bets";
import { fromLocalInput, toLocalInput, useNow } from "@/lib/time";
import { refetchSoon } from "@/lib/tx";
import { ensureAllowance, useSend } from "@/lib/useSend";
import { wagmiConfig } from "@/lib/wagmi";
import { useT } from "@/i18n/client";

const DAY = 86_400;
const STAKES = ["5", "10", "25"];

/** Form for a new bet: claim, stake, optional opponent and arbiter, two deadlines. */
export function CreateBet() {
  const { t, path } = useT();
  const c = t.app.create;
  const router = useRouter();
  const { address } = useConnection();
  const { open } = useConnectModal();
  const now = useNow();
  const send = useSend(t);
  const balance = useTokenBalance(address);

  const [claim, setClaim] = useState("");
  const [stake, setStake] = useState("10");
  const [opponent, setOpponent] = useState("");
  const [arbiter, setArbiter] = useState("");
  // null = default relative to now, so the server render and the first client render agree.
  const [joinByInput, setJoinBy] = useState<string | null>(null);
  const [decideByInput, setDecideBy] = useState<string | null>(null);

  const joinByText = joinByInput ?? (now ? toLocalInput(now + 2 * DAY) : "");
  const decideByText = decideByInput ?? (now ? toLocalInput(now + 7 * DAY) : "");
  const joinBy = fromLocalInput(joinByText);
  const decideBy = fromLocalInput(decideByText);

  const amount = parseUsd(stake);
  const bytes = byteLength(claim.trim());
  const opp = opponent.trim();
  const arb = arbiter.trim();
  const me = address?.toLowerCase();

  const problem =
    bytes > MAX_CLAIM_BYTES
      ? c.tooLong(bytes, MAX_CLAIM_BYTES)
      : (opp && !isAddress(opp)) || (arb && !isAddress(arb))
        ? c.badAddress
        : (opp && opp.toLowerCase() === me) || (arb && arb.toLowerCase() === me) || (opp && arb && opp.toLowerCase() === arb.toLowerCase())
          ? c.sameAddress
          : now && (joinBy <= now || decideBy <= joinBy)
            ? c.badDates
            : address && balance.data !== undefined && amount > balance.data
              ? c.tooMuch
              : null;
  const canSubmit = Boolean(address) && !send.busy && bytes > 0 && amount > 0n && !problem;

  async function submit() {
    if (!address || !DEPLOYMENT) return;
    const escrow = DEPLOYMENT.escrow;
    let id: bigint | undefined;
    const ok = await send.run(async (step) => {
      await ensureAllowance(step, address, amount, c.approving);
      const hash = await step(c.creating, (write) =>
        write({
          address: escrow,
          abi: betEscrowAbi,
          functionName: "create",
          args: [
            claim.trim(),
            (opp || zeroAddress) as Address,
            (arb || zeroAddress) as Address,
            amount,
            joinBy,
            decideBy,
          ],
        }),
      );
      const receipt = await getTransactionReceipt(wagmiConfig, { hash });
      id = parseEventLogs({ abi: betEscrowAbi, logs: receipt.logs, eventName: "BetCreated" })[0]?.args.id;
    });
    refetchSoon(balance.refetch);
    if (ok && id !== undefined) router.push(path(`/bet?id=${id}&new=1`));
  }

  return (
    <section className="card p-5">
      <h2 className="font-display text-2xl font-extrabold">{c.title}</h2>

      <label className="mt-4 block">
        <span className="text-sm font-bold">{c.claim}</span>
        <span className="block text-xs text-muted">{c.claimHint}</span>
        <textarea
          className="field mt-2 min-h-24"
          value={claim}
          maxLength={MAX_CLAIM_BYTES * 2}
          placeholder={c.claimPlaceholder}
          onChange={(e) => setClaim(e.target.value)}
        />
        <span className="flex justify-between gap-3 text-xs text-muted">
          <span>{c.claimPublic}</span>
          <span className="num shrink-0">{c.chars(bytes, MAX_CLAIM_BYTES)}</span>
        </span>
      </label>

      <div className="mt-4">
        <span className="text-sm font-bold">{c.stake}</span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {STAKES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStake(s)}
              className={`rounded-full border px-3 py-1.5 text-sm font-bold ${stake === s ? "border-accent bg-accent text-on-accent" : "border-line"}`}
            >
              {s} {TOKEN_SYMBOL}
            </button>
          ))}
          <input
            className="field num !w-28"
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            aria-label={c.stake}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold">{c.joinBy}</span>
          <input type="datetime-local" className="field mt-2" value={joinByText} onChange={(e) => setJoinBy(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-bold">{c.decideBy}</span>
          <input type="datetime-local" className="field mt-2" value={decideByText} onChange={(e) => setDecideBy(e.target.value)} />
          <span className="block text-xs text-muted">{c.decideByHint}</span>
        </label>
        <label className="block">
          <span className="text-sm font-bold">{c.opponent}</span>
          <input className="field mt-2 font-mono text-xs" placeholder="0x…" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
          <span className="block text-xs text-muted">{c.opponentHint}</span>
        </label>
        <label className="block">
          <span className="text-sm font-bold">{c.arbiter}</span>
          <input className="field mt-2 font-mono text-xs" placeholder="0x…" value={arbiter} onChange={(e) => setArbiter(e.target.value)} />
          <span className="block text-xs text-muted">{c.arbiterHint}</span>
        </label>
      </div>

      {problem && <p className="mt-4 text-sm font-semibold text-bad">{problem}</p>}

      {address ? (
        <button className="btn btn-primary mt-5 w-full" disabled={!canSubmit} onClick={submit}>
          {send.busy ?? c.submit}
        </button>
      ) : (
        <button className="btn btn-primary mt-5 w-full" onClick={open}>
          {t.connect.login}
        </button>
      )}
      <TxStatus error={send.error} hash={null} />
    </section>
  );
}
