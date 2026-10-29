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

/** Rising curve with the big multiplier, a countdown between rounds and the crash in red. */
export function LiveGraph({ live, cashedAt }: { live: ReturnType<typeof liveOf>; cashedAt: number | null }) {
  const { t } = useT();
  const g = t.den;
  const seconds = Math.max(live.flightMs / 1000, 0);
  const maxX = Math.max(10, seconds * 1.15);
  const maxY = Math.max(2, (live.multiplier / 100) * 1.15);
  const x = (s: number) => 40 + (s / maxX) * 350;
  const y = (m: number) => 200 - ((m - 1) / (maxY - 1)) * 180;
  const steps = 40;
  const points =
    live.phase === "flying" || live.phase === "crashed"
      ? Array.from({ length: steps + 1 }, (_, i) => {
          const s = (seconds * i) / steps;
          return `${x(s).toFixed(1)},${y(Math.exp(GROWTH * s * 1000)).toFixed(1)}`;
        }).join(" ")
      : "";
  const tip = points ? points.split(" ").pop()!.split(",").map(Number) : null;
  const crashed = live.phase === "crashed";
  const gridY = [1, ...[2, 5, 10, 25, 50, 100, 250, 500, 1000].filter((v) => v < maxY)].slice(-4);

  return (
    <div className={`den-sky relative h-72 overflow-hidden rounded-[22px] text-white ${crashed ? "den-shake" : ""}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden>
        {gridY.map((v) => (
          <g key={v}>
            <line x1="40" x2="395" y1={y(v)} y2={y(v)} stroke="white" strokeOpacity=".08" />
            <text x="6" y={y(v) + 4} fill="white" fillOpacity=".45" fontSize="10">
              {v}x
            </text>
          </g>
        ))}
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke={crashed ? "#ff6b5e" : "#f5b53a"}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {tip && live.phase === "flying" && (
        <span
          className="absolute text-3xl"
          style={{ left: `${(tip[0] / 400) * 100}%`, top: `${(tip[1] / 220) * 100}%`, transform: "translate(-50%, -70%)" }}
          aria-hidden
        >
          🦁
        </span>
      )}
      <div className="relative flex h-full flex-col items-center justify-center text-center">
        {live.phase === "waiting" && <div className="font-display text-2xl font-extrabold opacity-80">{g.connecting}</div>}
        {live.phase === "betting" && (
          <>
            <div className="text-sm font-bold uppercase tracking-wide opacity-80">{g.nextRound}</div>
            <div className="num font-display text-6xl font-extrabold">{(live.msLeft / 1000).toFixed(1)}s</div>
            <div className="mt-1 text-sm opacity-80">{g.placeBets}</div>
          </>
        )}
        {(live.phase === "flying" || crashed) && (
          <>
            <div className={`num font-display text-7xl font-extrabold drop-shadow ${crashed ? "text-[#ff6b5e]" : ""}`}>
              {fmt(live.multiplier)}x
            </div>
            {crashed && <div className="font-display mt-1 text-xl font-extrabold">{g.roared(fmt(live.multiplier))}</div>}
            {cashedAt !== null && (
              <div className="mt-2 rounded-full bg-good px-3 py-1 text-sm font-extrabold">{g.cashedOut(fmt(cashedAt))}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
