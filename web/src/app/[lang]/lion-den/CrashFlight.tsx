"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";

const GROWTH = 0.12; // multiplier = e^(GROWTH × seconds), so 2x after ~5.8 s
const MAX_SECONDS = 14; // very high crash points jump to the end instead of running for minutes

export type Flight = { key: number; target: number; crash: number; won: boolean } | null;

/** The rising multiplier: climbs from 1.00x to the crash point, marks the cash-out if it was reached. */
export function CrashFlight({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const { t } = useT();
  const g = t.den;
  const [value, setValue] = useState(100);
  const [phase, setPhase] = useState<"idle" | "flying" | "crashed">("idle");
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!flight) return;
    const crash = flight.crash / 100;
    const total = Math.min(Math.log(Math.max(crash, 1.0001)) / GROWTH, MAX_SECONDS);
    let start = 0;
    let frame = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const s = (now - start) / 1000;
      if (s >= total) {
        setValue(flight.crash);
        setPhase("crashed");
        done.current();
        return;
      }
      // Run the normal curve, but squeeze it into MAX_SECONDS for huge crash points.
      const scale = total < MAX_SECONDS ? 1 : Math.log(crash) / (GROWTH * MAX_SECONDS);
      setValue(Math.floor(Math.exp(GROWTH * s * scale) * 100));
      frame = requestAnimationFrame(tick);
    };
    const begin = requestAnimationFrame((now) => {
      setPhase("flying");
      setValue(100);
      tick(now);
    });
    return () => {
      cancelAnimationFrame(begin);
      cancelAnimationFrame(frame);
    };
  }, [flight]);

  const cashedOut = flight && flight.won && value >= flight.target;
  const x = (v: number) => (v / 100).toFixed(2);
  // Curve: x = progress to the crash point, y = multiplier on a log scale.
  const top = Math.max(flight?.crash ?? 200, 200);
  const progress = flight ? Math.min(Math.log(value / 100) / Math.log(Math.max(top / 100, 1.0001)), 1) : 0;
  const points = Array.from({ length: 30 }, (_, i) => {
    const p = (i / 29) * progress;
    const px = 20 + p * 360;
    const py = 170 - p * p * 140;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(" ");
  const tip = points.split(" ").pop()?.split(",").map(Number) ?? [20, 170];

  return (
    <div className={`den-sky relative h-64 overflow-hidden rounded-[22px] text-white ${phase === "crashed" ? "den-shake" : ""}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden>
        <polyline points={points} fill="none" stroke={phase === "crashed" ? "#ff6b5e" : "#f5b53a"} strokeWidth="4" strokeLinecap="round" />
      </svg>
      {phase === "flying" && (
        <span className="absolute text-2xl" style={{ left: `${(tip[0] / 400) * 100}%`, top: `${(tip[1] / 200) * 100}%`, transform: "translate(-50%, -60%)" }} aria-hidden>
          🦁
        </span>
      )}
      <div className="relative flex h-full flex-col items-center justify-center text-center">
        {phase === "idle" ? (
          <>
            <div className="font-display text-5xl font-extrabold opacity-80">1.00x</div>
            <div className="mt-2 text-sm opacity-80">{g.ready}</div>
          </>
        ) : (
          <>
            <div className={`num font-display text-6xl font-extrabold drop-shadow ${phase === "crashed" ? "text-[#ff6b5e]" : ""}`}>{x(value)}x</div>
            {phase === "crashed" && <div className="mt-1 font-display text-xl font-extrabold">{g.roared(x(flight!.crash))}</div>}
            {cashedOut && (
              <div className="mt-2 rounded-full bg-good px-3 py-1 text-sm font-extrabold">{g.cashedOut(x(flight!.target))}</div>
            )}
            {phase === "crashed" && flight && !flight.won && (
              <div className="mt-2 rounded-full bg-black/40 px-3 py-1 text-sm font-bold">{g.tooGreedy(x(flight.target))}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
