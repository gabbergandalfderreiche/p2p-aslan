"use client";

import { BETTING_MS, GROWTH, multiplierAt, type DenState } from "@/lib/den/shared";
import { useT } from "@/i18n/client";

/** Where the round stands right now, from the polled state and the local clock. */
export function liveOf(game: DenState | null, now: number, offset: number) {
  if (!game || !now) return { phase: "waiting" as const, multiplier: 100, msLeft: 0, flightMs: 0 };
  const into = now + offset - game.startAt;
  if (game.phase === "crashed" && game.crash !== null) {
    return { phase: "crashed" as const, multiplier: game.crash, msLeft: 0, flightMs: Math.log(game.crash / 100) / GROWTH };
  }
  if (into < BETTING_MS) return { phase: "betting" as const, multiplier: 100, msLeft: BETTING_MS - into, flightMs: 0 };
  const flight = into - BETTING_MS;
  return { phase: "flying" as const, multiplier: multiplierAt(flight), msLeft: 0, flightMs: flight };
}

const fmt = (h: number) => (h / 100).toFixed(2);

const ORANGE = "#f5b53a";
const GREEN = "#3ddc84";
const RED = "#ff5a4e";

/**
 * The big game field: countdown between rounds, the climbing curve (orange below 2x, green from 2x)
 * and an unmissable red crash with a flash.
 */
export function LiveGraph({
  live,
  round,
  cashedAt,
  lostStake,
  lastCrash,
}: {
  live: ReturnType<typeof liveOf>;
  round: number;
  cashedAt: number | null;
  lostStake: string | null;
  lastCrash: number | null;
}) {
  const { t } = useT();
  const g = t.den;
  const seconds = Math.max(live.flightMs / 1000, 0);
  const maxX = Math.max(10, seconds * 1.15);
  const maxY = Math.max(2, (live.multiplier / 100) * 1.15);
  const x = (s: number) => 44 + (s / maxX) * 346;
  const y = (m: number) => 205 - ((m - 1) / (maxY - 1)) * 185;
  const crashed = live.phase === "crashed";
  const colour = crashed ? RED : live.multiplier >= 200 ? GREEN : ORANGE;

  const steps = 48;
  const curve =
    live.phase === "flying" || crashed
      ? Array.from({ length: steps + 1 }, (_, i) => {
          const s = (seconds * i) / steps;
          return [x(s), y(Math.exp(GROWTH * s * 1000))] as const;
        })
      : [];
  const points = curve.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const tip = curve.at(-1);
  const gridY = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].filter((v) => v < maxY);

  return (
    <div className={`den-sky relative h-[22rem] overflow-hidden rounded-[22px] text-white sm:h-[30rem] ${crashed ? "den-shake" : ""}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden>
        {gridY.map((v) => (
          <g key={v}>
            <line x1="44" x2="395" y1={y(v)} y2={y(v)} stroke={v === 2 ? GREEN : "white"} strokeOpacity={v === 2 ? 0.35 : 0.08} strokeDasharray={v === 2 ? "4 4" : undefined} />
            <text x="6" y={y(v) + 4} fill={v === 2 ? GREEN : "white"} fillOpacity=".55" fontSize="10">
              {v}x
            </text>
          </g>
        ))}
        {points && (
          <>
            <polygon points={`${x(0)},${y(1)} ${points} ${tip![0]},${y(1)}`} fill={colour} fillOpacity=".12" />
            <polyline points={points} fill="none" stroke={colour} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>

      {tip && (
        <span
          className={`absolute ${crashed ? "text-5xl" : "text-4xl"}`}
          style={{ left: `${(tip[0] / 400) * 100}%`, top: `${(tip[1] / 220) * 100}%`, transform: "translate(-50%, -70%)" }}
          aria-hidden
        >
          {crashed ? "💥" : "🦁"}
        </span>
      )}

      {crashed && <div key={`flash-${round}`} className="den-flash pointer-events-none absolute inset-0" aria-hidden />}

      <div className="relative flex h-full flex-col items-center justify-center px-4 text-center">
        {live.phase === "waiting" && <div className="font-display text-2xl font-extrabold opacity-80">{g.connecting}</div>}
        {live.phase === "betting" && (
          <>
            <div className="text-sm font-bold uppercase tracking-widest opacity-80">{g.nextRound}</div>
            <div className="num font-display text-7xl font-extrabold sm:text-8xl">{(live.msLeft / 1000).toFixed(1)}s</div>
            <div className="mt-2 rounded-full bg-black/35 px-4 py-1 text-sm font-bold">{g.placeBets}</div>
            {lastCrash !== null && (
              <div className="mt-3 text-sm font-bold" style={{ color: RED }}>
                {g.lastRound(fmt(lastCrash))}
              </div>
            )}
          </>
        )}
        {live.phase === "flying" && (
          <>
            <div className="num font-display text-7xl font-extrabold drop-shadow-lg sm:text-9xl" style={{ color: colour }}>
              {fmt(live.multiplier)}x
            </div>
            {cashedAt !== null && (
              <div className="mt-3 rounded-full bg-good px-4 py-1.5 text-base font-extrabold">{g.cashedOut(fmt(cashedAt))}</div>
            )}
          </>
        )}
        {crashed && (
          <>
            <div className="den-pop font-display text-3xl font-extrabold uppercase tracking-wide sm:text-4xl" style={{ color: RED }}>
              💥 {g.roaredTitle}
            </div>
            <div className="den-pop num font-display text-7xl font-extrabold drop-shadow-lg sm:text-9xl" style={{ color: RED }}>
              @ {fmt(live.multiplier)}x
            </div>
            {cashedAt !== null && (
              <div className="mt-3 rounded-full bg-good px-4 py-1.5 text-base font-extrabold">{g.cashedOut(fmt(cashedAt))}</div>
            )}
            {lostStake && (
              <div className="mt-3 rounded-full bg-[#ff5a4e] px-4 py-1.5 text-base font-extrabold">{g.youLost(lostStake)}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
