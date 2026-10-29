"use client";

import { useState } from "react";
import { parseEventLogs, type Hash } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { getBlockNumber, getTransactionReceipt, readContract } from "wagmi/actions";
import { TxStatus } from "@/components/AppFrame";
import { useConnectModal } from "@/components/ConnectModal";
import { StarterKit } from "@/components/StarterKit";
import { crashGameAbi } from "@/generated/contracts";
import { DEPLOYMENT, fmtUsd, parseUsd, TOKEN_SYMBOL, useTokenBalance } from "@/lib/bets";
import { confirm, refetchSoon } from "@/lib/tx";
import { ensureAllowance, useSend } from "@/lib/useSend";
import { useStarterKit } from "@/lib/useStarterKit";
import { wagmiConfig } from "@/lib/wagmi";
import { useT } from "@/i18n/client";
import { CrashFlight, type Flight } from "./CrashFlight";

const CRASH = DEPLOYMENT?.crash;
const TARGETS = [150, 200, 300, 500, 1000];
const STAKES = ["1", "5", "10", "25"];
const HISTORY = 30;
const State = { Pending: 1, Won: 2, Lost: 3 } as const;

type Round = { player: string; stake: bigint; betBlock: bigint; target: number; crash: number; state: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hidden play-money crash game with its own tUSD dashboard. */
export function LionDen() {
  const { t } = useT();
  const g = t.den;
  const { address } = useConnection();
  const { open } = useConnectModal();
  const kit = useStarterKit(address);
  const balance = useTokenBalance(address);
  const send = useSend(t);
  const [stake, setStake] = useState("5");
  const [targetText, setTargetText] = useState("2.00");
  const [flight, setFlight] = useState<Flight>(null);
  const [flying, setFlying] = useState(false);

  const stats = useReadContract({
    address: CRASH,
    abi: crashGameAbi,
    functionName: "stats",
    args: [address!],
    query: { enabled: Boolean(CRASH && address) },
  });
  const ids = useReadContract({
    address: CRASH,
    abi: crashGameAbi,
    functionName: "roundsOf",
    args: [address!],
    query: { enabled: Boolean(CRASH && address) },
  });
  const lastIds = [...(ids.data ?? [])].slice(-HISTORY);
  const rounds = useReadContracts({
    contracts: lastIds.map((id) => ({ address: CRASH, abi: crashGameAbi, functionName: "getRound", args: [id] }) as const),
    query: { enabled: lastIds.length > 0 },
  });
  const history = lastIds
    .map((id, i) => ({ id, r: rounds.data?.[i]?.result as Round | undefined }))
    .filter((x): x is { id: bigint; r: Round } => Boolean(x.r) && x.r!.state !== State.Pending);

  const amount = parseUsd(stake);
  const target = Math.round(Number(targetText.replace(",", ".")) * 100);
  const targetOk = Number.isFinite(target) && target >= 101 && target <= 100_000;
  const stakeOk = amount >= 100_000n && amount <= 100_000_000n;
  const needsSetup = kit.needsGas || kit.balance < amount;
  const canPlay = Boolean(address && CRASH) && !send.busy && !flying && targetOk && stakeOk && !needsSetup;

  const refetchAll = () =>
    refetchSoon(() => {
      stats.refetch();
      ids.refetch();
      rounds.refetch();
      balance.refetch();
    });

  async function reveal(id: bigint, betBlock: bigint, step: Parameters<Parameters<typeof send.run>[0]>[0]) {
    // Our server reveals for free; without it (local node) the player reveals with a second click.
    const res = await fetch("/api/crash/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id.toString() }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { hash?: Hash }) : {};
    if (data.hash) return confirm(data.hash);
    while ((await getBlockNumber(wagmiConfig)) <= betBlock + 1n) await sleep(1000);
    return step(g.revealing, (w) => w({ address: CRASH!, abi: crashGameAbi, functionName: "reveal", args: [id] }));
  }

  async function play() {
    if (!address || !CRASH) return;
    let result: Round | undefined;
    const ok = await send.run(async (step) => {
      await ensureAllowance(step, address, CRASH, amount, t.app.create.approving);
      const hash = await step(g.betting, (w) =>
        w({ address: CRASH, abi: crashGameAbi, functionName: "play", args: [amount, target] }),
      );
      const receipt = await getTransactionReceipt(wagmiConfig, { hash });
      const id = parseEventLogs({ abi: crashGameAbi, logs: receipt.logs, eventName: "Played" })[0]?.args.id;
      if (id === undefined) throw new Error("no round id");
      await reveal(id, receipt.blockNumber, step);
      for (let i = 0; i < 10; i++) {
        result = (await readContract(wagmiConfig, { address: CRASH, abi: crashGameAbi, functionName: "getRound", args: [id] })) as Round;
        if (result.state !== State.Pending) break;
        await sleep(1000);
      }
    });
    if (ok && result && result.state !== State.Pending) {
      setFlying(true);
      setFlight((prev) => ({ key: (prev?.key ?? 0) + 1, target: result!.target, crash: result!.crash, won: result!.state === State.Won }));
    } else {
      refetchAll();
    }
  }

  const s = stats.data;
  const wagered = s?.[0] ?? 0n;
  const paidOut = s?.[1] ?? 0n;
  const played = s?.[2] ?? 0;
  const wins = s?.[3] ?? 0;
  const best = s?.[4] ?? 0;
  const net = paidOut - wagered;

  if (!CRASH) return <p className="card p-6 text-muted">{g.notDeployed}</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="rounded-full bg-accent-2 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-white">{g.secret}</span>
          <h1 className="font-display mt-2 text-4xl font-extrabold">{g.title}</h1>
          <p className="mt-1 max-w-xl text-muted">{g.lead}</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="card p-5">
          <CrashFlight
            flight={flight}
            onDone={() => {
              setFlying(false);
              refetchAll();
            }}
          />

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <span className="text-sm font-bold">{g.stake}</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {STAKES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setStake(v)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-bold ${stake === v ? "border-accent bg-accent text-on-accent" : "border-line"}`}
                  >
                    {v}
                  </button>
                ))}
                <input className="field num !w-20" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} aria-label={g.stake} />
              </div>
            </div>
            <div>
              <span className="text-sm font-bold">{g.target}</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {TARGETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTargetText((v / 100).toFixed(2))}
                    className={`rounded-full border px-3 py-1.5 text-sm font-bold ${target === v ? "border-accent bg-accent text-on-accent" : "border-line"}`}
                  >
                    {v / 100}x
                  </button>
                ))}
                <input className="field num !w-20" inputMode="decimal" value={targetText} onChange={(e) => setTargetText(e.target.value)} aria-label={g.target} />
              </div>
            </div>
          </div>

          {targetOk && stakeOk && (
            <p className="mt-3 text-sm text-muted">
              {g.preview(fmtUsd((amount * BigInt(target)) / 100n), (target / 100).toFixed(2), Math.min(99, 99 / (target / 100)).toFixed(1))}
            </p>
          )}
          {!stakeOk && <p className="mt-3 text-sm font-semibold text-bad">{g.badStake}</p>}
          {!targetOk && <p className="mt-3 text-sm font-semibold text-bad">{g.badTarget}</p>}

          {address && needsSetup && (
            <div className="mt-4">
              <StarterKit kit={kit} need={amount} />
            </div>
          )}

          {address ? (
            <button className="btn btn-bad mt-4 w-full text-lg" disabled={!canPlay} onClick={play}>
              {send.busy ?? (flying ? g.inFlight : g.play)}
            </button>
          ) : (
            <button className="btn btn-primary mt-4 w-full" onClick={open}>
              {t.connect.login}
            </button>
          )}
          <TxStatus error={send.error} hash={null} />
        </section>

        <aside className="card h-fit p-5">
          <h2 className="font-display text-xl font-extrabold">{g.dashboard}</h2>
          <div className="mt-3 text-xs font-semibold text-muted">{t.app.wallet.balance}</div>
          <div className="num font-display text-3xl font-extrabold">
            {fmtUsd(kit.balance)} <span className="text-base text-muted">{TOKEN_SYMBOL}</span>
          </div>
          <div className={`num mt-3 rounded-2xl p-3 text-center ${net >= 0n ? "bg-good/15 text-good" : "bg-accent-2/15 text-accent-2"}`}>
            <div className="text-[11px] font-bold uppercase tracking-wide">{g.net}</div>
            <div className="font-display text-2xl font-extrabold">
              {net >= 0n ? "+" : "−"}
              {fmtUsd(net >= 0n ? net : -net)} {TOKEN_SYMBOL}
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Stat label={g.rounds} value={String(played)} />
            <Stat label={g.winRate} value={played ? `${Math.round((wins / played) * 100)} %` : "–"} />
            <Stat label={g.wagered} value={fmtUsd(wagered)} />
            <Stat label={g.paidOut} value={fmtUsd(paidOut)} />
            <Stat label={g.best} value={best ? `${(best / 100).toFixed(2)}x` : "–"} />
          </dl>
          <Sparkline history={history.map((h) => h.r)} />
        </aside>
      </div>

      {history.length > 0 && (
        <section className="card p-5">
          <h2 className="font-display text-xl font-extrabold">{g.history}</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {[...history].reverse().map(({ id, r }) => {
              const won = r.state === State.Won;
              const delta = won ? (r.stake * BigInt(r.target)) / 100n - r.stake : -r.stake;
              return (
                <li key={String(id)} className="num flex items-center justify-between gap-3 py-2">
                  <span className="text-muted">#{String(id)}</span>
                  <span>
                    {g.stake}: {fmtUsd(r.stake)} · {g.target}: {(r.target / 100).toFixed(2)}x
                  </span>
                  <span className="text-muted">{r.crash ? `${(r.crash / 100).toFixed(2)}x` : g.expired}</span>
                  <span className={`font-bold ${won ? "text-good" : "text-accent-2"}`}>
                    {won ? "+" : "−"}
                    {fmtUsd(delta >= 0n ? delta : -delta)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-[22px] bg-surface-2 p-5 text-sm leading-relaxed text-muted">
        <h2 className="font-display text-lg font-extrabold text-ink">{g.fairTitle}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {g.fair.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-2.5">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num font-bold">{value}</dd>
    </div>
  );
}

/** Running profit and loss over the last rounds. */
function Sparkline({ history }: { history: Round[] }) {
  const { t } = useT();
  if (history.length < 2) return null;
  const deltas = history.map((r) => Number(r.state === State.Won ? (r.stake * BigInt(r.target)) / 100n - r.stake : -r.stake) / 1e6);
  const values = deltas.reduce<number[]>((acc, d) => [...acc, acc[acc.length - 1] + d], [0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 300).toFixed(1)},${(80 - ((v - min) / span) * 70 - 5).toFixed(1)}`).join(" ");
  const zero = 80 - ((0 - min) / span) * 70 - 5;
  return (
    <div className="mt-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{t.den.curve}</div>
      <svg viewBox="0 0 300 80" className="mt-1 h-20 w-full" aria-hidden>
        <line x1="0" x2="300" y1={zero} y2={zero} stroke="var(--line)" strokeDasharray="4 4" />
        <polyline points={pts} fill="none" stroke={values[values.length - 1] >= 0 ? "var(--good)" : "var(--accent-2)"} strokeWidth="2.5" />
      </svg>
    </div>
  );
}
