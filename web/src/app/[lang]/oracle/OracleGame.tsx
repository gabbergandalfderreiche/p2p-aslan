"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useConnectModal } from "@/components/ConnectModal";
import { fmtUsd, TOKEN_SYMBOL } from "@/lib/bets";
import { BOOK, BOOK_PAYS, LINES, PAYS, REELS, spinFromSeed, STAKES, STRIPS, type Grid, type Screen, type SpinResult } from "@/lib/oracle/slot";
import { errorText } from "@/lib/useSend";
import { useT } from "@/i18n/client";
import { denApi, useDenAccount } from "../lion-den/useDen";
import { MoneyRain } from "../lion-den/MoneyRain";
import { GameAccount } from "../lion-den/GameAccount";
import { BookOpening, OwlSprite, type OwlMood } from "./OwlSprite";

const START: Grid = [
  [6, 0, 3],
  [2, 8, 1],
  [9, 5, 4],
  [1, 7, 0],
  [3, 6, 2],
];
const usd = (micro: number) => fmtUsd(BigInt(Math.round(micro)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One symbol from the sprite sheet. */
function Sym({ s, className = "", style }: { s: number; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`oracle-sym ${className}`}
      style={{ backgroundPosition: `${(s / 9) * 100}% 0`, ...style }}
      aria-hidden
    />
  );
}

type Focus = { cells: Set<string>; line: number | null; expansion: Screen["expansion"]; text: string };
const NO_FOCUS: Focus = { cells: new Set(), line: null, expansion: null, text: "" };

/** "Das Orakel": the book slot on the Löwensprung game account. Outcomes come from the server. */
export function OracleGame() {
  const { t, path } = useT();
  const o = t.oracle;
  const { open } = useConnectModal();
  const account = useDenAccount();
  const { address, me, setMe, loggedIn, login, signing, autoError } = account;

  const [stake, setStake] = useState(1_000_000);
  const [grid, setGrid] = useState<Grid>(START);
  const [spinning, setSpinning] = useState<boolean[]>(Array(REELS).fill(false));
  const [landed, setLanded] = useState<number[]>(Array(REELS).fill(0));
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<Focus>(NO_FOCUS);
  const [banner, setBanner] = useState<{ title: string; sub?: string; hype?: number; book?: boolean } | null>(null);
  const [owl, setOwl] = useState<{ mood: OwlMood; n: number }>({ mood: "fly", n: 0 });
  const react = (mood: OwlMood) => setOwl((v) => ({ mood, n: v.n + 1 }));
  const [free, setFree] = useState<{ i: number; n: number; hype: number; won: number } | null>(null);
  const [result, setResult] = useState<{ text: string; good: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commit, setCommit] = useState<string | null>(null);
  const [last, setLast] = useState<{ seed: string; commit: string; pay: number } | null>(null);
  const [check, setCheck] = useState<boolean | null>(null);
  const [stats, setStats] = useState<{ spins: number; wagered: number; won: number; best: number } | null>(null);
  const [rain, setRain] = useState({ n: 0, amount: "" });
  const skip = useRef(false);

  const shownError = error ?? (autoError ? errorText(autoError, t) : null);
  const wait = (ms: number) => (skip.current ? Promise.resolve() : sleep(ms));

  useEffect(() => {
    if (!loggedIn) return;
    let stop = false;
    denApi<{ commit: string; stats: typeof stats }>("oracle")
      .then((r) => {
        if (stop) return;
        setCommit(r.commit);
        setStats(r.stats);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [loggedIn]);

  /** Spins all reels, then lets them land one after the other on `target`. */
  async function roll(target: Grid, fast: boolean) {
    setFocus(NO_FOCUS);
    setSpinning(Array(REELS).fill(true));
    await wait(fast ? 250 : 450);
    for (let r = 0; r < REELS; r++) {
      setGrid((g) => g.map((col, i) => (i === r ? target[r] : col)));
      setSpinning((s) => s.map((v, i) => (i === r ? false : v)));
      setLanded((l) => l.map((v, i) => (i === r ? v + 1 : v)));
      await wait(fast ? 110 : 190);
    }
  }

  /** Shows what a screen paid: each line in turn, the whitepapers, the expanded hype symbol. */
  async function present(screen: Screen, lineBet: number, fast: boolean) {
    const names = o.symbols;
    if (screen.expansion) {
      const e = screen.expansion;
      setFocus({ cells: new Set(e.reels.flatMap((r) => [0, 1, 2].map((row) => `${r}:${row}`))), line: null, expansion: e, text: `${o.expanded(names[e.symbol])} ${usd(e.pay * lineBet)} ${TOKEN_SYMBOL}` });
      await wait(fast ? 1100 : 1500);
    }
    // An expanded hype symbol pays instead of its own line wins, so those are not shown.
    const lines = screen.expansion ? screen.lines.filter((w) => w.symbol !== screen.expansion!.symbol) : screen.lines;
    for (const w of lines.slice(0, fast ? 2 : 4)) {
      const cells = new Set(LINES[w.line].slice(0, w.count).map((row, r) => `${r}:${row}`));
      setFocus({ cells, line: w.line, expansion: null, text: o.line(w.line + 1, w.count, names[w.symbol], usd(w.pay * lineBet)) });
      await wait(fast ? 650 : 900);
    }
    if (screen.bookPay > 0) {
      const cells = new Set(screen.grid.flatMap((col, r) => col.flatMap((s, row) => (s === BOOK ? [`${r}:${row}`] : []))));
      setFocus({ cells, line: null, expansion: null, text: o.books(screen.books, usd(screen.bookPay * lineBet)) });
      await wait(fast ? 800 : 1100);
    }
  }

  async function play() {
    if (busy || !me) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setCheck(null);
    skip.current = false;
    const commitBefore = commit;
    const lineBet = stake / LINES.length;
    setMe({ ...me, balance: me.balance - stake });

    // Reels start turning at once; the outcome arrives while they spin.
    setFocus(NO_FOCUS);
    setSpinning(Array(REELS).fill(true));
    let res: SpinResult;
    try {
      res = await denApi<SpinResult>("oracle-spin", { stake });
    } catch (e) {
      setSpinning(Array(REELS).fill(false));
      setMe({ ...me });
      const code = e instanceof Error ? e.message : "server";
      setError(t.den.errors[code] ?? t.app.failed);
      setBusy(false);
      return;
    }

    await roll(res.spin.base.grid, false);
    await present(res.spin.base, lineBet, false);

    let total = res.spin.base.pay;
    if (res.spin.free) {
      const { hype, screens } = res.spin.free;
      react("cheer");
      setBanner({ title: o.freeTitle, sub: o.freeIntro(10), book: true });
      await wait(1800);
      setBanner({ title: o.freeTitle, sub: o.hype(o.symbols[hype]), hype });
      await wait(1800);
      setBanner(null);
      let n = 10;
      for (let i = 0; i < screens.length; i++) {
        setFree({ i: i + 1, n, hype, won: total - res.spin.base.pay });
        await roll(screens[i].grid, true);
        await present(screens[i], lineBet, true);
        total += screens[i].pay;
        setFree({ i: i + 1, n, hype, won: total - res.spin.base.pay });
        if (screens[i].books >= 3) {
          n += 10;
          setBanner({ title: o.retrigger });
          await wait(1200);
          setBanner(null);
        }
      }
      setBanner({ title: o.freeTotal(usd(((total - res.spin.base.pay) * stake) / LINES.length)) });
      await wait(1800);
      setBanner(null);
      setFree(null);
    }

    setFocus(NO_FOCUS);
    setMe({ ...me, balance: res.balance });
    setCommit(res.nextCommit);
    setLast(commitBefore ? { seed: res.seed, commit: commitBefore, pay: res.spin.pay } : null);
    setResult(res.payout > 0 ? { text: o.win(usd(res.payout)), good: true } : { text: o.noWin, good: false });
    react(res.payout > 0 ? "cheer" : "shake");
    if (res.payout >= stake * 20) setRain((r) => ({ n: r.n + 1, amount: usd(res.payout) }));
    setStats((s) => (s ? { spins: s.spins + 1, wagered: s.wagered + stake, won: s.won + res.payout, best: Math.max(s.best, res.payout) } : s));
    setBusy(false);
  }

  /** Login by signature; the button stays locked so a second click cannot start a second request. */
  async function enter() {
    setBusy(true);
    setError(null);
    try {
      await login();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("oracle login", e);
      setError(/reject|denied|cancel/i.test(msg) ? o.signCancelled : (t.den.errors[msg] ?? errorText(e, t)));
    } finally {
      setBusy(false);
    }
  }

  /** Recomputes the last spin in the browser: the seed must hash to the commit shown before. */
  async function verify() {
    if (!last) return;
    const bytes = new TextEncoder().encode(last.seed);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    setCheck(hash === last.commit && spinFromSeed(last.seed).pay === last.pay);
  }

  const action = !address ? (
    <button className="btn btn-primary w-full text-lg" onClick={open}>
      {t.connect.login}
    </button>
  ) : !loggedIn ? (
    <button className="btn btn-primary w-full text-lg" disabled={busy || signing} onClick={() => void enter()}>
      {busy || signing ? o.signing : o.login}
    </button>
  ) : (
    <button className="btn btn-primary w-full py-4 text-xl" disabled={busy || (me?.balance ?? 0) < stake} onClick={() => void play()}>
      {busy ? o.spinning : `${o.spin} · ${usd(stake)} ${TOKEN_SYMBOL}`}
    </button>
  );

  return (
    <div className="den-dark space-y-6 rounded-[28px] p-3 sm:p-6">
      <MoneyRain trigger={rain.n} amount={rain.amount} />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{o.title}</h1>
        <span className="rounded-full bg-accent-2 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">{o.secret}</span>
        <p className="w-full max-w-2xl text-sm text-muted">{o.lead}</p>
      </header>

      <section className="den-panel oracle-stage overflow-hidden p-3 sm:p-5">
        <div className={`oracle-machine relative mx-auto mt-16 max-w-3xl rounded-[22px] p-2 sm:mt-24 sm:p-4 ${free ? "oracle-free" : ""}`}>
          {/* The owl sits on the top edge of the machine and reacts to every spin. */}
          <OwlSprite
            mood={owl.mood}
            play={owl.n}
            onDone={() => setOwl((v) => ({ mood: "idle", n: v.n }))}
            className="pointer-events-none absolute bottom-[calc(100%-14px)] right-3 z-20 w-28 sm:right-6 sm:w-40"
          />
          {free && (
            <div className="mb-2 flex items-center justify-between px-1 text-sm font-extrabold">
              <span className="flex items-center gap-2">
                <Sym s={free.hype} className="h-7 w-7" />
                {o.freeLeft(free.i, free.n)}
              </span>
              <span className="num text-[#ffd36b]">+{usd((free.won * stake) / LINES.length)} {TOKEN_SYMBOL}</span>
            </div>
          )}
          <div className="relative grid grid-cols-5 gap-1.5 sm:gap-2">
            {grid.map((col, r) => (
              <div key={r} className="oracle-reel relative overflow-hidden rounded-xl">
                {spinning[r] ? (
                  <div className="oracle-spin">
                    {[...STRIPS[r].slice(0, 8), ...STRIPS[r].slice(0, 8)].map((s, i) => (
                      <Sym key={i} s={s} className="aspect-square w-full" />
                    ))}
                  </div>
                ) : (
                  <div key={landed[r]} className="oracle-land">
                    {col.map((s, row) => (
                      <Sym key={row} s={s} className={`aspect-square w-full ${focus.cells.has(`${r}:${row}`) ? "oracle-hit" : focus.cells.size ? "opacity-40" : ""}`} />
                    ))}
                  </div>
                )}
                {focus.expansion?.reels.includes(r) && !spinning[r] && (
                  <div className="oracle-expand pointer-events-none absolute inset-0 grid place-items-center">
                    <Sym s={focus.expansion.symbol} className="aspect-square w-[115%] max-w-none" />
                  </div>
                )}
              </div>
            ))}
            {focus.line !== null && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden>
                <polyline
                  points={LINES[focus.line].map((row, r) => `${r * 100 + 50},${row * 100 + 50}`).join(" ")}
                  fill="none"
                  stroke="#ffd36b"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="oracle-line"
                />
              </svg>
            )}
          </div>

          {banner && (
            <div className="oracle-banner absolute inset-0 z-10 grid place-items-center rounded-[22px] bg-black/70 p-4 text-center">
              <div>
                {banner.book && <BookOpening className="mx-auto w-32 sm:w-40" />}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {banner.hype === undefined && !banner.book && <img src="/owl-scroll.png" alt="" className="mx-auto h-28 w-auto" draggable={false} />}
                {banner.hype !== undefined && <Sym s={banner.hype} className="oracle-hype mx-auto h-28 w-28" />}
                <div className="font-display mt-2 text-4xl font-extrabold text-[#ffd36b] sm:text-5xl">{banner.title}</div>
                {banner.sub && <div className="mt-2 text-lg font-bold">{banner.sub}</div>}
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto mt-3 min-h-7 max-w-3xl text-center text-sm font-bold sm:text-base">
          {focus.text ? (
            <span className="text-[#ffd36b]">{focus.text}</span>
          ) : result ? (
            <span className={result.good ? "text-[#3ddc84]" : "text-muted"}>{result.text}</span>
          ) : null}
        </div>

        <div className="mx-auto mt-3 max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-sm font-bold">{o.stake}</span>
              {STAKES.map((v) => (
                <button
                  key={v}
                  disabled={busy}
                  onClick={() => setStake(v)}
                  className={`num min-w-12 rounded-full border px-3 py-1.5 text-sm font-extrabold ${stake === v ? "border-accent bg-accent text-on-accent shadow-[0_0_18px_rgba(245,181,58,0.45)]" : "border-white/15 bg-black/20 hover:border-accent"}`}
                >
                  {usd(v)}
                </button>
              ))}
            </div>
            {loggedIn && (
              <div className="text-sm">
                <span className="text-muted">{o.balance} </span>
                <span className="num font-extrabold">
                  {usd(me?.balance ?? 0)} {TOKEN_SYMBOL}
                </span>
              </div>
            )}
          </div>
          <div className="den-action">{action}</div>
          {busy && free && (
            <button className="w-full text-center text-xs font-semibold text-muted underline" onClick={() => (skip.current = true)}>
              {o.skip}
            </button>
          )}
          {shownError && <p className="text-sm font-semibold text-bad">{shownError}</p>}
          {!loggedIn && <p className="text-xs text-muted">{o.loginHint}</p>}
          {loggedIn && (me?.balance ?? 0) < stake && !busy && <p className="text-sm font-semibold text-[#ffd36b]">{o.topUp} ↓</p>}
        </div>
      </section>

      <GameAccount account={account} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="den-panel p-5">
          <h2 className="font-display text-xl font-extrabold">{o.paytable}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[8, 7, 6, 5, 4, 3, 2, 1, 0].map((s) => (
              <div key={s} className="flex items-center gap-2 rounded-xl bg-black/20 p-2">
                <Sym s={s} className="h-12 w-12 shrink-0" />
                <div className="num text-[11px] leading-tight">
                  {[5, 4, 3, 2]
                    .filter((c) => PAYS[s][c] > 0)
                    .map((c) => (
                      <div key={c}>
                        <span className="text-muted">{c}×</span> <span className="font-extrabold">{PAYS[s][c]}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
            <div className="col-span-2 flex items-center gap-2 rounded-xl border border-[#f5b53a]/40 bg-black/20 p-2 sm:col-span-3">
              <Sym s={BOOK} className="h-12 w-12 shrink-0" />
              <div className="num text-[11px] leading-tight">
                {[5, 4, 3].map((c) => (
                  <span key={c} className="mr-3">
                    <span className="text-muted">{c}×</span> <span className="font-extrabold">{BOOK_PAYS[c]}× </span>
                  </span>
                ))}
                <div className="mt-1 text-muted">{o.freeIntro(10).split(" – ")[0]}</div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">{o.paysNote}</p>
          <p className="mt-1 text-xs text-muted">{o.rtp}</p>
        </section>

        <section className="den-panel space-y-3 p-5">
          <h2 className="font-display text-xl font-extrabold">{o.fair}</h2>
          <p className="text-sm text-muted">{o.fairText}</p>
          {commit && (
            <div className="text-xs">
              <div className="text-muted">{o.nextCommit}</div>
              <code className="break-all">{commit}</code>
            </div>
          )}
          {last && (
            <div className="space-y-2 text-xs">
              <div className="text-muted">{o.lastSeed}</div>
              <code className="break-all">{last.seed}</code>
              <div className="flex items-center gap-3">
                <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => void verify()}>
                  {o.verify}
                </button>
                {check !== null && <span className={check ? "font-bold text-good" : "font-bold text-bad"}>{check ? o.verified : o.mismatch}</span>}
              </div>
            </div>
          )}
          {stats && (
            <div className="grid grid-cols-2 gap-2 pt-2 text-sm sm:grid-cols-4">
              {(["spins", "wagered", "won", "best"] as const).map((k) => (
                <div key={k} className="rounded-xl bg-black/20 p-2">
                  <div className="text-[11px] text-muted">{o.stats[k]}</div>
                  <div className="num font-extrabold">{k === "spins" ? stats.spins : usd(stats[k])}</div>
                </div>
              ))}
            </div>
          )}
          <Link href={path("/lion-den")} className="inline-block pt-2 text-sm font-semibold underline">
            {o.toDen} →
          </Link>
        </section>
      </div>
    </div>
  );
}
