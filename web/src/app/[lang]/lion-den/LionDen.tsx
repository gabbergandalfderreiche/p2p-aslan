"use client";

import { useEffect, useState, type ReactNode } from "react";
import { erc20Abi, type Address } from "viem";
import { useConnection } from "wagmi";
import { useConnectModal } from "@/components/ConnectModal";
import { StarterKit } from "@/components/StarterKit";
import { DEPLOYMENT, fmtUsd, parseUsd, short, TOKEN_SYMBOL, useTokenBalance } from "@/lib/bets";
import { crashFromSeed, MAX_AUTO, MAX_STAKE, MIN_STAKE } from "@/lib/den/shared";
import { txUrl } from "@/lib/network";
import { refetchSoon } from "@/lib/tx";
import { useSend } from "@/lib/useSend";
import { useStarterKit } from "@/lib/useStarterKit";
import { useT } from "@/i18n/client";
import { LiveGraph, liveOf } from "./LiveGraph";
import { useDen, useFrameClock } from "./useDen";

/** Only the house owner (Oli's wallet, the timelock admin) tops up the pot; players never see that button. */
const POT_OWNER = "0xbd7c9af9cd062e3f099d8442393052dd71744c01";
const STAKES = [1, 5, 10, 25];
const AUTOS = ["1.5", "2", "3", "10"];
const x = (h: number) => (h / 100).toFixed(2);

/** Hidden play-money crash game with a game account: deposit once, play without transactions, withdraw. */
export function LionDen() {
  const { t } = useT();
  const g = t.den;
  const { address } = useConnection();
  const { open } = useConnectModal();
  const den = useDen();
  const now = useFrameClock();
  const live = liveOf(den.game, now, den.offset);
  const kit = useStarterKit(address);
  const wallet = useTokenBalance(address);
  const send = useSend(t);

  const [stake, setStake] = useState("5");
  const [autoOn, setAutoOn] = useState(false);
  const [autoText, setAutoText] = useState("2.00");
  const [lostStake, setLostStake] = useState<{ round: number; text: string } | null>(null);
  const [queued, setQueued] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [moveAmount, setMoveAmount] = useState("50");
  const [house, setHouse] = useState<{ house: Address | null; pot: number; persistent: boolean } | null>(null);

  const me = address?.toLowerCase();
  const myBet = den.game?.bets.find((b) => b.player.toLowerCase() === me) ?? null;
  const amount = Number(parseUsd(stake));
  const autoValue = autoOn ? Math.round(Number(autoText.replace(",", ".")) * 100) : null;
  const stakeOk = amount >= MIN_STAKE && amount <= MAX_STAKE;
  const autoOk = autoValue === null || (autoValue >= 101 && autoValue <= MAX_AUTO);

  const errorText = (e: unknown) => {
    const code = e instanceof Error ? e.message : "server";
    return g.errors[code] ?? t.app.failed;
  };

  const loadHouse = () =>
    fetch("/api/den/house", { cache: "no-store" })
      .then((r) => r.json())
      .then(setHouse)
      .catch(() => {});
  useEffect(() => {
    const id = setTimeout(loadHouse, 0);
    return () => clearTimeout(id);
  }, []);

  async function placeBet() {
    setBusy(true);
    setMessage(null);
    try {
      await den.bet(amount, autoValue);
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  // A bet queued during a flight goes in as soon as the next betting window opens.
  useEffect(() => {
    if (!queued || live.phase !== "betting" || myBet || !den.loggedIn) return;
    const id = setTimeout(() => {
      setQueued(false);
      void placeBet();
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placeBet reads the latest inputs
  }, [queued, live.phase, myBet, den.loggedIn]);

  // Make a loss as obvious as a win: when the lion roars while we are still in, say so.
  const roundId = den.game?.round ?? 0;
  useEffect(() => {
    if (live.phase !== "crashed" || !myBet || myBet.cashout !== null || lostStake?.round === roundId) return;
    const text = fmtUsd(BigInt(myBet.stake));
    const id = setTimeout(() => {
      setLostStake({ round: roundId, text });
      setMessage({ ok: false, text: g.lostMessage(x(live.multiplier), text) });
    }, 0);
    return () => clearTimeout(id);
  }, [live.phase, live.multiplier, myBet, roundId, lostStake, g]);

  async function cashOut() {
    setBusy(true);
    try {
      const r = await den.cashOut();
      setMessage({ ok: true, text: g.cashedMessage(x(r.at), fmtUsd(BigInt(r.payout))) });
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  /** Sends tUSD from the wallet to the house; `credit` puts it on the game account. */
  async function moveIn(credit: boolean) {
    if (!address || !house?.house || !DEPLOYMENT) return;
    setMessage(null);
    const value = parseUsd(moveAmount);
    const to = house.house;
    let hash = "";
    const ok = await send.run(async (step) => {
      hash = await step(credit ? g.depositing : g.funding, (w) =>
        w({ address: DEPLOYMENT!.token, abi: erc20Abi, functionName: "transfer", args: [to, value] }),
      );
    });
    if (ok && credit) {
      try {
        await den.deposit(hash);
        setMessage({ ok: true, text: g.deposited(fmtUsd(value)), tx: hash });
      } catch (e) {
        setMessage({ ok: false, text: errorText(e) });
      }
    } else if (ok) {
      setMessage({ ok: true, text: g.funded(fmtUsd(value)), tx: hash });
    }
    refetchSoon(() => {
      wallet.refetch();
      void loadHouse();
    });
  }

  async function withdraw() {
    setBusy(true);
    setMessage(null);
    try {
      const value = parseUsd(moveAmount);
      const { hash } = await den.withdraw(Number(value));
      setMessage({ ok: true, text: g.withdrawn(fmtUsd(value)), tx: hash });
      refetchSoon(() => {
        wallet.refetch();
        void loadHouse();
      });
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  const balance = den.me?.balance ?? 0;
  const stats = den.me?.stats;
  const net = stats ? stats.won - stats.wagered : 0;
  const cashedAt = myBet?.cashout ?? null;
  const payoutNow = myBet ? Math.floor((myBet.stake * live.multiplier) / 100) : 0;

  let action;
  if (!address) {
    action = (
      <button className="btn btn-primary w-full text-lg" onClick={open}>
        {t.connect.login}
      </button>
    );
  } else if (!den.loggedIn) {
    action = (
      <button
        className="btn btn-primary w-full text-lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await den.login();
          } catch (e) {
            setMessage({ ok: false, text: errorText(e) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {g.enter}
      </button>
    );
  } else if (live.phase === "flying" && myBet && cashedAt === null) {
    action = (
      <button className="btn btn-good w-full py-4 text-xl" disabled={busy} onClick={cashOut}>
        {g.cashOutNow(x(live.multiplier), fmtUsd(BigInt(payoutNow)))}
      </button>
    );
  } else if (live.phase === "betting" && !myBet) {
    action = (
      <button className="btn btn-bad w-full py-4 text-xl" disabled={busy || !stakeOk || !autoOk || amount > balance} onClick={placeBet}>
        {g.placeBet(fmtUsd(BigInt(amount || 0)))}
      </button>
    );
  } else if (myBet && cashedAt === null && live.phase === "betting") {
    action = <div className="rounded-2xl bg-surface-2 p-4 text-center font-bold">{g.youreIn(fmtUsd(BigInt(myBet.stake)))}</div>;
  } else {
    action = (
      <button
        className={`btn w-full py-4 text-lg ${queued ? "btn-ghost" : "btn-primary"}`}
        disabled={!stakeOk || !autoOk || amount > balance}
        onClick={() => setQueued((q) => !q)}
      >
        {queued ? g.queued : g.queue}
      </button>
    );
  }

  return (
    <div className="den-dark space-y-6 rounded-[28px] p-3 sm:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <Crown />
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{g.title}</h1>
        <span className="rounded-full bg-accent-2 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">{g.secret}</span>
        <p className="w-full max-w-2xl text-sm text-muted">{g.lead}</p>
      </header>

      <section className="den-panel p-3 sm:p-5">
        <LiveGraph
          game={den.game}
          offset={den.offset}
          cashedAt={cashedAt}
          lostStake={lostStake?.round === roundId ? lostStake.text : null}
          lastCrash={den.game?.history[0]?.crash ?? null}
        />
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {(den.game?.history ?? []).map((h) => (
            <span
              key={h.round}
              className={`num shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-xs font-extrabold ${h.crash >= 200 ? "text-[#3ddc84]" : "text-[#ff5a4e]"}`}
            >
              {x(h.crash)}x
            </span>
          ))}
        </div>

        <div className="mt-4 grid gap-5 border-t border-white/10 pt-5 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-white/10">
          <div className="sm:pr-6">
            <div className="mb-2 text-sm font-bold">{g.stake}</div>
            <div className="flex flex-wrap items-center gap-2">
              {STAKES.map((v) => (
                <Chip key={v} active={Number(stake) === v} onClick={() => setStake(String(v))}>
                  {v}
                </Chip>
              ))}
              <div className="flex items-center rounded-xl border border-white/15 bg-black/30 pr-3">
                <input
                  className="num w-20 bg-transparent px-3 py-2 text-lg font-bold outline-none"
                  inputMode="decimal"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  aria-label={g.stake}
                />
                <span className="text-xs font-bold text-muted">{TOKEN_SYMBOL}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">{g.stakeHint}</p>
          </div>
          <div className="sm:pl-6">
            <div className="mb-2 text-sm font-bold">{g.auto}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip active={!autoOn} onClick={() => setAutoOn(false)}>
                {g.autoOff.toUpperCase()}
              </Chip>
              {AUTOS.map((v) => (
                <Chip
                  key={v}
                  active={autoOn && Number(autoText) === Number(v)}
                  onClick={() => {
                    setAutoOn(true);
                    setAutoText(Number(v).toFixed(2));
                  }}
                >
                  {v}x
                </Chip>
              ))}
              <div className={`flex items-center rounded-xl border bg-black/30 pr-3 ${autoOn ? "border-accent" : "border-white/15"}`}>
                <input
                  className="num w-20 bg-transparent px-3 py-2 text-lg font-bold outline-none"
                  inputMode="decimal"
                  value={autoText}
                  onFocus={() => setAutoOn(true)}
                  onChange={(e) => {
                    setAutoOn(true);
                    setAutoText(e.target.value);
                  }}
                  aria-label={g.auto}
                />
                <span className="text-xs font-bold text-muted">x</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">{autoOn ? g.autoHintOn : g.autoHintOff}</p>
          </div>
        </div>

          {!stakeOk && <p className="mt-3 text-sm font-semibold text-bad">{g.badStake}</p>}
          {!autoOk && <p className="mt-3 text-sm font-semibold text-bad">{g.badTarget}</p>}
          {den.loggedIn && amount > balance && <p className="mt-3 text-sm font-semibold text-bad">{g.depositFirst}</p>}
          {stakeOk && autoOk && autoValue !== null && (
            <p className="mt-3 text-sm text-muted">
              {g.autoPreview(x(autoValue), fmtUsd(BigInt(Math.floor((amount * autoValue) / 100))), Math.min(99, 99 / (autoValue / 100)).toFixed(1))}
            </p>
          )}

          <div className="den-action mt-5">{action}</div>
          {message && (
            <p className={`mt-3 text-sm font-semibold ${message.ok ? "text-good" : "text-bad"}`}>
              {message.text}{" "}
              {message.tx && txUrl(message.tx) && (
                <a href={txUrl(message.tx)!} target="_blank" rel="noopener noreferrer" className="font-normal underline">
                  {t.app.viewTx}
                </a>
              )}
            </p>
          )}
      </section>

      <div>
        <aside className="den-panel grid gap-4 p-5 md:grid-cols-3">
          <div>
            <h2 className="font-display text-xl font-extrabold">{g.account}</h2>
            <div className="num font-display mt-1 text-3xl font-extrabold">
              {fmtUsd(BigInt(balance))} <span className="text-base text-muted">{TOKEN_SYMBOL}</span>
            </div>
            <p className="text-xs text-muted">{g.accountHint}</p>
          </div>

          {address && den.loggedIn && (
            <div className="rounded-2xl border border-line p-3">
              <div className="flex items-center gap-2">
                <input className="field num" inputMode="decimal" value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} aria-label={g.amount} />
                <span className="text-sm text-muted">{TOKEN_SYMBOL}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="btn btn-primary !py-2 text-sm" disabled={Boolean(send.busy) || !house?.house} onClick={() => moveIn(true)}>
                  {send.busy ?? g.deposit}
                </button>
                <button className="btn btn-ghost !py-2 text-sm" disabled={busy} onClick={withdraw}>
                  {g.withdraw}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">{g.walletBalance(fmtUsd(wallet.data ?? 0n))}</p>
            </div>
          )}
          {address && (kit.needsGas || kit.balance === 0n) && <StarterKit kit={kit} />}

          <div className="rounded-2xl bg-surface-2 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">{g.pot}</span>
              <span className="num font-bold">
                {fmtUsd(BigInt(house?.pot ?? 0))} {TOKEN_SYMBOL}
              </span>
            </div>
            {address?.toLowerCase() === POT_OWNER && house?.house && (
              <button className="mt-2 text-xs font-semibold underline" disabled={Boolean(send.busy)} onClick={() => moveIn(false)}>
                {g.fundPot(moveAmount)}
              </button>
            )}
            {house && !house.persistent && <p className="mt-2 text-xs text-bad">{g.notPersistent}</p>}
          </div>
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="den-panel p-5">
          <h2 className="font-display text-xl font-extrabold">{g.players(den.game?.bets.length ?? 0)}</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {(den.game?.bets ?? []).length === 0 && <li className="py-2 text-muted">{g.noPlayers}</li>}
            {(den.game?.bets ?? []).map((b) => {
              const lost = live.phase === "crashed" && b.cashout === null;
              const mine = b.player.toLowerCase() === me;
              return (
                <li key={b.player} className="num flex items-center justify-between gap-3 py-2">
                  <span className={mine ? "font-bold text-accent-ink" : ""}>{mine ? t.bet.you : short(b.player)}</span>
                  <span>{fmtUsd(BigInt(b.stake))}</span>
                  <span className={b.cashout ? "font-bold text-good" : lost ? "text-accent-2" : "text-muted"}>
                    {b.cashout
                      ? `${x(b.cashout)}x · +${fmtUsd(BigInt(Math.floor((b.stake * b.cashout) / 100) - b.stake))}`
                      : lost
                        ? g.lost
                        : b.auto
                          ? `${g.autoShort} ${x(b.auto)}x`
                          : "…"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="den-panel p-5">
          <h2 className="font-display text-xl font-extrabold">{g.dashboard}</h2>
          <div className={`num mt-3 rounded-2xl p-3 text-center ${net >= 0 ? "bg-good/15 text-good" : "bg-accent-2/15 text-accent-2"}`}>
            <div className="text-[11px] font-bold uppercase tracking-wide">{g.net}</div>
            <div className="font-display text-2xl font-extrabold">
              {net >= 0 ? "+" : "−"}
              {fmtUsd(BigInt(Math.abs(net)))} {TOKEN_SYMBOL}
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <Stat label={g.rounds} value={String(stats?.rounds ?? 0)} />
            <Stat label={g.winRate} value={stats?.rounds ? `${Math.round((stats.wins / stats.rounds) * 100)} %` : "–"} />
            <Stat label={g.best} value={stats?.best ? `${x(stats.best)}x` : "–"} />
            <Stat label={g.wagered} value={fmtUsd(BigInt(stats?.wagered ?? 0))} />
            <Stat label={g.paidOut} value={fmtUsd(BigInt(stats?.won ?? 0))} />
          </dl>
          <Sparkline profits={[...(den.me?.history ?? [])].reverse().map((h) => h.profit)} />
        </section>
      </div>

      <section className="rounded-[22px] bg-surface-2 p-5 text-sm leading-relaxed text-muted">
        <h2 className="font-display text-lg font-extrabold text-ink">{g.fairTitle}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {g.fair.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        {den.game && <Proof commit={den.game.commit} seed={den.game.seed} round={den.game.round} />}
      </section>
    </div>
  );
}

function Chip({ active = false, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`num min-w-12 rounded-full border px-4 py-2 text-sm font-extrabold transition-colors ${active ? "border-accent bg-accent text-on-accent shadow-[0_0_18px_rgba(245,181,58,0.45)]" : "border-white/15 bg-black/20 hover:border-accent"}`}
    >
      {children}
    </button>
  );
}

/** Golden crown next to the title. */
function Crown() {
  return (
    <svg width="44" height="34" viewBox="0 0 44 34" aria-hidden>
      <path d="M3 10 L12 20 L22 4 L32 20 L41 10 L37 30 L7 30 Z" fill="#f5b53a" />
      <rect x="7" y="27" width="30" height="5" rx="2" fill="#d48c15" />
      <circle cx="3" cy="9" r="3" fill="#f5b53a" />
      <circle cx="22" cy="4" r="3" fill="#f5b53a" />
      <circle cx="41" cy="9" r="3" fill="#f5b53a" />
    </svg>
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

/** Running profit over the last rounds (oldest first). */
function Sparkline({ profits }: { profits: number[] }) {
  const { t } = useT();
  if (profits.length < 2) return null;
  const values = profits.reduce<number[]>((acc, p) => [...acc, acc[acc.length - 1] + p / 1e6], [0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 300).toFixed(1)},${(75 - ((v - min) / span) * 70).toFixed(1)}`).join(" ");
  const zero = 75 - ((0 - min) / span) * 70;
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

/** Commitment shown during the round, seed after the crash; the browser re-checks both. */
function Proof({ commit, seed, round }: { commit: string; seed: string | null; round: number }) {
  const { t } = useT();
  const g = t.den;
  const [checked, setChecked] = useState<{ seed: string; ok: boolean; crash: number } | null>(null);

  useEffect(() => {
    if (!seed || checked?.seed === seed) return;
    let cancelled = false;
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)).then((buf) => {
      if (cancelled) return;
      const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      setChecked({ seed, ok: hex === commit, crash: crashFromSeed(seed) });
    });
    return () => {
      cancelled = true;
    };
  }, [seed, commit, checked]);

  return (
    <div className="mt-3 rounded-xl bg-surface p-3 font-mono text-[11px] break-all">
      <div>
        {g.round} #{round} · {g.commit}: {commit}
      </div>
      {seed && <div className="mt-1">{g.seed}: {seed}</div>}
      {checked && checked.seed === seed && (
        <div className={`mt-1 font-sans text-xs font-bold ${checked.ok ? "text-good" : "text-bad"}`}>
          {checked.ok ? g.proofOk((checked.crash / 100).toFixed(2)) : g.proofBad}
        </div>
      )}
    </div>
  );
}
