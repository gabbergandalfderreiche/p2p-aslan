"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, parseEventLogs, zeroAddress, type Address } from "viem";
import { useConnection } from "wagmi";
import { getTransactionReceipt } from "wagmi/actions";
import { TxStatus } from "@/components/AppFrame";
import { useConnectModal } from "@/components/ConnectModal";
import { matchBetsAbi } from "@/generated/contracts";
import { parseUsd, TOKEN_SYMBOL, useTokenBalance } from "@/lib/bets";
import { freePicks, groupByLeague, MATCH_BETS, Pick, PICK_SIGN, PICKS, Result, useMatches, type Match, type PickValue } from "@/lib/matches";
import { LeagueFilter } from "@/components/LeagueFilter";
import { TeamBadge } from "../match-bet/MatchBetParts";
import { fmtDate, useNow } from "@/lib/time";
import { refetchSoon } from "@/lib/tx";
import { ensureAllowance, useSend } from "@/lib/useSend";
import { wagmiConfig } from "@/lib/wagmi";
import { useT } from "@/i18n/client";

const STAKES = ["5", "10", "25"];
const CLOSE_BEFORE_KICKOFF = 60; // seconds; a transaction sent later would likely land after kickoff

type Listed = Match & { id: bigint };

/** Football bet: choose an upcoming match, both picks and both stakes. */
export function MatchBetForm() {
  const { t, locale } = useT();
  const mt = t.matches;
  const now = useNow();
  const { matches, isLoading } = useMatches();
  const [selected, setSelected] = useState<bigint | null>(null);
  const [league, setLeague] = useState<string | null>(null);

  const upcoming = matches.filter((m) => m.result === Result.None && m.kickoff > now + CLOSE_BEFORE_KICKOFF);
  const match = upcoming.find((m) => m.id === selected);
  const groups = groupByLeague(upcoming);
  const counts = Object.fromEntries(groups.map((g) => [g.league, g.items.length]));
  const shown = groups.filter((g) => league === null || g.league === league);

  if (!MATCH_BETS) return <p className="mt-4 text-sm text-muted">{mt.noMatchBets}</p>;
  if (match) return <Form match={match} onBack={() => setSelected(null)} />;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-bold">{mt.choose}</h3>
      <LeagueFilter leagues={groups.map((g) => g.league)} counts={counts} value={league} onChange={setLeague} />
      {isLoading && <p className="mt-2 text-sm text-muted">{t.app.lists.loading}</p>}
      {!isLoading && upcoming.length === 0 && <p className="mt-2 text-sm text-muted">{mt.empty}</p>}
      <div className="mt-2 max-h-[30rem] space-y-4 overflow-y-auto pr-1">
        {shown.map((g) => (
          <section key={g.league}>
            <h4 className="sticky top-0 z-10 bg-surface py-1 text-xs font-extrabold uppercase tracking-wide text-accent-ink">
              {g.league}
            </h4>
            <ul className="mt-1 space-y-2">
              {g.items.map((m) => (
                <li key={String(m.id)}>
                  <button
                    type="button"
                    onClick={() => setSelected(m.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line px-4 py-2.5 text-left hover:border-accent"
                  >
                    <span className="flex items-center gap-2 font-bold">
                      <TeamBadge name={m.home} size={20} />
                      {m.home} – {m.away}
                      <TeamBadge name={m.away} size={20} />
                    </span>
                    <span className="num shrink-0 text-xs text-muted">{fmtDate(m.kickoff, locale)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Form({ match, onBack }: { match: Listed; onBack: () => void }) {
  const { t, locale, path } = useT();
  const mt = t.matches;
  const c = t.app.create;
  const router = useRouter();
  const { address } = useConnection();
  const { open } = useConnectModal();
  const send = useSend(t);
  const balance = useTokenBalance(address);

  const [mine, setMine] = useState<PickValue>(Pick.Home);
  const [stake, setStake] = useState("10");
  const [opponent, setOpponent] = useState("");

  const label = (p: number) => (p === Pick.Home ? mt.wins(match.home) : p === Pick.Away ? mt.wins(match.away) : mt.draw);
  const myAmount = parseUsd(stake);
  const opp = opponent.trim();
  const [freeA, freeB] = freePicks(mine);

  const problem =
    opp && !isAddress(opp)
      ? c.badAddress
      : opp && opp.toLowerCase() === address?.toLowerCase()
        ? c.sameAddress
        : address && balance.data !== undefined && myAmount > balance.data
          ? c.tooMuch
          : null;
  const canSubmit = Boolean(address) && !send.busy && myAmount > 0n && !problem;

  async function submit() {
    if (!address || !MATCH_BETS) return;
    const contract = MATCH_BETS;
    let id: bigint | undefined;
    const ok = await send.run(async (step) => {
      await ensureAllowance(step, address, contract, myAmount, c.approving);
      const hash = await step(c.creating, (write) =>
        write({
          address: contract,
          abi: matchBetsAbi,
          functionName: "create",
          args: [match.id, mine, myAmount, (opp || zeroAddress) as Address],
        }),
      );
      const receipt = await getTransactionReceipt(wagmiConfig, { hash });
      id = parseEventLogs({ abi: matchBetsAbi, logs: receipt.logs, eventName: "BetCreated" })[0]?.args.id;
    });
    refetchSoon(balance.refetch);
    if (ok && id !== undefined) router.push(path(`/match-bet?id=${id}&new=1`));
  }

  return (
    <div className="mt-4">
      <div className="rounded-2xl bg-surface-2 p-4">
        <div className="flex justify-between gap-3 text-xs text-muted">
          <span>{match.competition}</span>
          <button type="button" className="font-semibold underline" onClick={onBack}>
            {mt.change}
          </button>
        </div>
        <div className="font-display mt-1 text-xl font-extrabold">
          {match.home} – {match.away}
        </div>
        <div className="num text-xs text-muted">
          {mt.kickoff}: {fmtDate(match.kickoff, locale)}
        </div>
      </div>

      <Choice title={mt.pick} options={[...PICKS]} value={mine} onChange={setMine} label={label} />
      <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
        {mt.opponentChooses(label(freeA), label(freeB))}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <span className="text-sm font-bold">{mt.yourStake}</span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {STAKES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStake(s)}
                className={`rounded-full border px-3 py-1.5 text-sm font-bold ${stake === s ? "border-accent bg-accent text-on-accent" : "border-line"}`}
              >
                {s}
              </button>
            ))}
            <input className="field num !w-24" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} aria-label={mt.yourStake} />
            <span className="text-sm text-muted">{TOKEN_SYMBOL}</span>
          </div>
        </div>
        <div className="text-sm text-muted sm:self-end">{mt.sameStake}</div>
        <label className="block sm:col-span-2">
          <span className="text-sm font-bold">{mt.opponent}</span>
          <input className="field mt-2 font-mono text-xs" placeholder="0x…" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
          <span className="block text-xs text-muted">{c.opponentHint}</span>
        </label>
      </div>

      <p className="mt-4 text-xs text-muted">{mt.regularTime}</p>
      {problem && <p className="mt-3 text-sm font-semibold text-bad">{problem}</p>}

      {address ? (
        <button className="btn btn-primary mt-4 w-full" disabled={!canSubmit} onClick={submit}>
          {send.busy ?? c.submit}
        </button>
      ) : (
        <button className="btn btn-primary mt-4 w-full" onClick={open}>
          {t.connect.login}
        </button>
      )}
      <TxStatus error={send.error} hash={null} />
    </div>
  );
}

function Choice({
  title,
  options,
  value,
  onChange,
  label,
}: {
  title: string;
  options: PickValue[];
  value: PickValue;
  onChange: (p: PickValue) => void;
  label: (p: number) => string;
}) {
  return (
    <div className="mt-4">
      <span className="text-sm font-bold">{title}</span>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {options.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`rounded-2xl border px-3 py-2.5 text-sm font-bold ${value === p ? "border-accent bg-accent text-on-accent" : "border-line hover:border-accent"}`}
          >
            <span className="mr-1.5 rounded-md bg-black/10 px-1.5 py-0.5 text-xs">{PICK_SIGN[p]}</span>
            {label(p)}
          </button>
        ))}
      </div>
    </div>
  );
}
