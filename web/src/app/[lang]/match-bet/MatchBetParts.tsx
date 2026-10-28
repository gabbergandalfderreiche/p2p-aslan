"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Address } from "viem";
import { fmtUsd, short, TOKEN_SYMBOL } from "@/lib/bets";
import { addressUrl } from "@/lib/network";
import { fmtDate } from "@/lib/time";
import { useT } from "@/i18n/client";

// Neutral badge colours picked from the team name; deliberately not the clubs' own colours or crests.
const BADGE_COLOURS = ["#2f5d8a", "#7a3b69", "#2e7d5b", "#8a5a2b", "#4b4f9c", "#9c3d3d", "#3d7f8f", "#6b6b2e"];

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function colourOf(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BADGE_COLOURS[h % BADGE_COLOURS.length];
}

export function TeamBadge({ name, size = 64 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border-[3px] border-white/80 font-display font-extrabold text-white shadow-lg"
      style={{ width: size, height: size, background: colourOf(name), fontSize: size * 0.3 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

// A clock that ticks every second, for the countdown only (the rest of the page uses useNow).
function subscribeSecond(onChange: () => void) {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}
const secondNow = () => Math.floor(Date.now() / 1000);

function useSecondClock() {
  return useSyncExternalStore(subscribeSecond, secondNow, () => 0);
}

/** Rough match minute from kickoff: 1–45, half time, 46–90, then 90+. */
function matchMinute(elapsed: number) {
  const m = Math.floor(elapsed / 60) + 1;
  if (m <= 47) return `${Math.min(m, 45)}'`;
  if (m <= 62) return null; // half time
  const second = m - 17;
  return second > 90 ? "90+'" : `${second}'`;
}

/** Big ticking countdown before kickoff, pulsing LIVE badge during the match, full time after. */
export function Countdown({ kickoff }: { kickoff: number }) {
  const { t } = useT();
  const c = t.matches.countdown;
  const now = useSecondClock();
  if (!now) return <div className="h-14" />;

  const left = kickoff - now;
  if (left > 0) {
    const parts = [
      [Math.floor(left / 86_400), c.days],
      [Math.floor((left % 86_400) / 3600), c.hours],
      [Math.floor((left % 3600) / 60), c.minutes],
      [left % 60, c.seconds],
    ] as const;
    const soon = left < 3600;
    return (
      <div className="flex flex-col items-center">
        <div className={`flex gap-1.5 ${soon ? "countdown-soon" : ""}`}>
          {parts.map(([value, label], i) =>
            i === 0 && value === 0 ? null : (
              <div key={label} className="min-w-11 rounded-lg bg-black/45 px-1.5 py-1 text-center">
                <div className="num font-display text-xl font-extrabold leading-none">{String(value).padStart(2, "0")}</div>
                <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide opacity-75">{label}</div>
              </div>
            ),
          )}
        </div>
        <div className="mt-1 text-[11px] font-bold uppercase tracking-wide opacity-80">{c.untilKickoff}</div>
      </div>
    );
  }
  if (now < kickoff + 2 * 3600) {
    const minute = matchMinute(now - kickoff);
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="flex items-center gap-1.5 rounded-full bg-accent-2 px-3 py-1 text-sm font-extrabold text-white">
          <span className="live-dot h-2 w-2 rounded-full bg-white" />
          LIVE {minute ?? c.halfTime}
        </span>
        <span className="text-[11px] font-bold opacity-80">{c.fingersCrossed}</span>
      </div>
    );
  }
  return <span className="rounded-full bg-black/40 px-3 py-1 text-sm font-extrabold">{c.over}</span>;
}

/** Stadium-style header: pitch, both teams, kickoff countdown and the pot. */
export function Scoreboard({
  competition,
  home,
  away,
  kickoff,
  now,
  pot,
  status,
  score,
}: {
  competition: string;
  home: string;
  away: string;
  kickoff: number;
  now: number;
  pot: bigint;
  status: string;
  score: string | null;
}) {
  const { t, locale } = useT();
  const live = now >= kickoff && now < kickoff + 2 * 3600;
  return (
    <section className="pitch relative overflow-hidden rounded-[22px] px-5 pb-6 pt-4 text-white shadow-lg">
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-25" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden>
        <rect x="6" y="6" width="388" height="188" fill="none" stroke="white" strokeWidth="2" />
        <line x1="200" y1="6" x2="200" y2="194" stroke="white" strokeWidth="2" />
        <circle cx="200" cy="100" r="34" fill="none" stroke="white" strokeWidth="2" />
        <rect x="6" y="60" width="40" height="80" fill="none" stroke="white" strokeWidth="2" />
        <rect x="354" y="60" width="40" height="80" fill="none" stroke="white" strokeWidth="2" />
      </svg>
      <div className="relative flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wide">
        <span className="rounded-full bg-black/30 px-2.5 py-1">{competition}</span>
        <span className="rounded-full bg-black/30 px-2.5 py-1">{status}</span>
      </div>
      <div className="relative mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamBadge name={home} />
          <span className="font-display text-lg font-extrabold leading-tight drop-shadow sm:text-xl">{home}</span>
        </div>
        <div className="flex flex-col items-center text-center">
          {score ? (
            <span className="font-display text-2xl font-extrabold drop-shadow">{score}</span>
          ) : (
            <span className={`vs-glow font-display text-4xl font-extrabold drop-shadow ${live ? "text-accent" : ""}`}>VS</span>
          )}
          <div className="mt-2">{!score && <Countdown kickoff={kickoff} />}</div>
          <span className="num mt-1 text-[11px] opacity-80">{fmtDate(kickoff, locale)}</span>
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamBadge name={away} />
          <span className="font-display text-lg font-extrabold leading-tight drop-shadow sm:text-xl">{away}</span>
        </div>
      </div>
      <div className="relative mx-auto mt-5 w-fit rounded-2xl bg-black/35 px-5 py-2 text-center">
        <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">{t.bet.pot}</div>
        <div className="num font-display text-2xl font-extrabold text-accent">
          {fmtUsd(pot)} {TOKEN_SYMBOL}
        </div>
      </div>
    </section>
  );
}

/** One side of the bet as a big betting slip. */
export function Slip({
  role,
  who,
  me,
  pick,
  winsOn,
  stake,
  state,
}: {
  role: string;
  who: Address | null;
  me?: Address;
  pick: string;
  winsOn: string;
  stake: bigint;
  state: "won" | "lost" | "open" | "normal";
}) {
  const { t } = useT();
  const isMe = Boolean(who && me && who.toLowerCase() === me.toLowerCase());
  const url = who ? addressUrl(who) : null;
  const frame =
    state === "won"
      ? "border-good bg-good/10"
      : state === "open"
        ? "border-dashed border-accent/70"
        : state === "lost"
          ? "border-line opacity-70"
          : isMe
            ? "border-accent"
            : "border-line";
  return (
    <div className={`relative rounded-2xl border-2 bg-surface p-4 ${frame}`}>
      {state === "won" && <span className="absolute right-3 top-3 text-xl" aria-hidden>🏆</span>}
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <span>{role}</span>
        {isMe ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">{t.bet.you}</span>
        ) : who ? (
          url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono underline">
              {short(who)}
            </a>
          ) : (
            <span className="font-mono">{short(who)}</span>
          )
        ) : (
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent-ink">{t.matches.openSeat}</span>
        )}
      </div>
      <div className="mt-2 font-display text-xl font-extrabold leading-tight">{pick}</div>
      <div className="text-xs text-muted">{winsOn}</div>
      <div className="num mt-3 font-display text-3xl font-extrabold">
        {fmtUsd(stake)} <span className="text-base font-bold text-muted">{TOKEN_SYMBOL}</span>
      </div>
    </div>
  );
}

/** Where the bet stands: created → opponent → kickoff → result → payout. */
export function Timeline({ step, cancelled }: { step: number; cancelled: boolean }) {
  const { t } = useT();
  const steps = t.matches.steps;
  return (
    <ol className="grid grid-cols-5 gap-1 text-center text-[11px] font-semibold sm:text-xs">
      {steps.map((label, i) => {
        const done = !cancelled && i < step;
        const current = !cancelled && i === step;
        return (
          <li key={label} className="flex flex-col items-center gap-1.5">
            <span
              className={`grid h-8 w-8 place-items-center rounded-full border-2 text-sm font-extrabold ${
                done ? "border-good bg-good text-white" : current ? "border-accent bg-accent/20 text-accent-ink" : "border-line text-muted"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={done || current ? "text-ink" : "text-muted"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Share card with copy, WhatsApp and the phone's own share sheet. */
export function ShareCard({ href, text, highlight, inviteOnly }: { href: string; text: string; highlight: boolean; inviteOnly: boolean }) {
  const { t, path } = useT();
  const mt = t.matches;
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}${path(href)}`;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link stays visible to copy by hand.
    }
  }

  const button = "btn !py-2 text-sm";
  return (
    <section className={`card p-5 ${highlight ? "border-2 border-accent" : ""}`}>
      {highlight && <p className="mb-2 font-bold text-good">{t.app.create.done}</p>}
      <div className="font-display text-lg font-extrabold">{mt.shareTitle}</div>
      <p className="mt-1 text-sm text-muted">{inviteOnly ? t.bet.inviteOnly : t.bet.shareHint}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <a
          className={`${button} bg-[#25d366] text-white`}
          href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
        {canShare && (
          <button className={`${button} btn-ghost`} onClick={() => navigator.share({ text, url: link }).catch(() => {})}>
            {mt.shareNative}
          </button>
        )}
        <button className={`${button} btn-ghost`} onClick={copy}>
          {copied ? t.bet.copied : mt.copyLink}
        </button>
      </div>
      <input readOnly value={link} className="field mt-3 font-mono text-xs" onFocus={(e) => e.target.select()} />
    </section>
  );
}

/** Highlighted sentence that says what the visitor has at stake and what happens next. */
export function Position({ tone, children }: { tone: "accent" | "good" | "muted" | "bad"; children: ReactNode }) {
  const styles = {
    accent: "border-accent bg-accent/10",
    good: "border-good bg-good/10",
    muted: "border-line bg-surface-2",
    bad: "border-accent-2 bg-accent-2/10",
  };
  return <div className={`rounded-2xl border-2 p-4 text-base font-semibold leading-snug ${styles[tone]}`}>{children}</div>;
}

const CONFETTI_COLOURS = ["#f0a73a", "#c4472b", "#f6e4c3", "#2e7d5b", "#ffffff"];

/** Short burst of confetti over the page; `trigger` changes start a new burst. */
export function Confetti({ trigger }: { trigger: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    const start = setTimeout(() => setShown(trigger), 0);
    const end = setTimeout(() => setShown(0), 3500);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [trigger]);
  if (!shown) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {Array.from({ length: 48 }, (_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 12) * 0.06;
        const size = 6 + (i % 4) * 2;
        return (
          <span
            key={`${shown}-${i}`}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              width: size,
              height: size * 1.6,
              background: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
              animationDelay: `${delay}s`,
              ["--drift" as string]: `${((i % 7) - 3) * 18}px`,
            }}
          />
        );
      })}
    </div>
  );
}

/** "You vs. them" divider between the two slips. */
export function DuelDivider() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
      <span className="vs-glow grid h-12 w-12 place-items-center rounded-full border-2 border-accent bg-surface font-display text-lg font-extrabold text-accent-ink shadow-lg">
        VS
      </span>
    </div>
  );
}
