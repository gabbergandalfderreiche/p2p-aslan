"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BETTING_MS, GROWTH, multiplierAt, type DenState } from "@/lib/den/shared";
import { useT } from "@/i18n/client";
import { RunningLion } from "./RunningLion";

/** Where the round stands at `now`, from the polled state. Pure: the animation never decides anything. */
export function liveOf(game: DenState | null, now: number, offset: number) {
  if (!game || !now) return { phase: "waiting" as const, multiplier: 100, msLeft: 0, flightMs: 0 };
  const into = now + offset - game.startAt;
  if (game.phase === "crashed" && game.crash !== null) {
    return { phase: "crashed" as const, multiplier: game.crash, msLeft: 0, flightMs: Math.log(game.crash / 100) / GROWTH };
  }
  if (into < BETTING_MS) return { phase: "betting" as const, multiplier: 100, msLeft: Math.min(BETTING_MS, BETTING_MS - into), flightMs: 0 };
  const flight = into - BETTING_MS;
  return { phase: "flying" as const, multiplier: multiplierAt(flight), msLeft: 0, flightMs: flight };
}

// Frame clock: one shared requestAnimationFrame loop, read through useSyncExternalStore.
let frameTime = 0;
const frameListeners = new Set<() => void>();
let frameId = 0;
function subscribeFrames(cb: () => void) {
  frameListeners.add(cb);
  if (frameListeners.size === 1) {
    const loop = () => {
      frameTime = Date.now();
      frameListeners.forEach((l) => l());
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
  }
  return () => {
    frameListeners.delete(cb);
    if (frameListeners.size === 0) cancelAnimationFrame(frameId);
  };
}
const useAnimationFrameClock = () => useSyncExternalStore(subscribeFrames, () => frameTime, () => 0);

/** Pixel size of an element, for slope angles and the lion's size on any screen. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 800, h: 400 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const fmt = (h: number) => (h / 100).toFixed(2);
const GOLD = "#f5b53a";
const GREEN = "#3ddc84";
const RED = "#ff5a4e";
const VW = 400;
const VH = 220;

/**
 * The game field: countdown between rounds, the climbing curve with the running lion on it, and a
 * red crash where the lion stumbles out of the picture.
 */
export function LiveGraph({
  game,
  offset,
  cashedAt,
  lostStake,
  lastCrash,
}: {
  game: DenState | null;
  offset: number;
  cashedAt: number | null;
  lostStake: string | null;
  lastCrash: number | null;
}) {
  const { t } = useT();
  const g = t.den;
  const now = useAnimationFrameClock();
  const live = liveOf(game, now, offset);
  const [box, size] = useSize<HTMLDivElement>();

  const crashed = live.phase === "crashed";
  const flying = live.phase === "flying";
  const seconds = Math.max(live.flightMs / 1000, 0);
  const maxX = Math.max(10, seconds * 1.25);
  const maxY = Math.max(2, (live.multiplier / 100) * 1.25);
  const x = (s: number) => 44 + (s / maxX) * 340;
  const y = (m: number) => 205 - ((m - 1) / (maxY - 1)) * 175;
  const mAt = (s: number) => Math.exp(GROWTH * s * 1000);
  const colour = crashed ? RED : live.multiplier >= 200 ? GREEN : GOLD;

  const steps = 60;
  const curve = flying || crashed ? Array.from({ length: steps + 1 }, (_, i) => [x((seconds * i) / steps), y(mAt((seconds * i) / steps))] as const) : [];
  const points = curve.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const tip = curve.at(-1) ?? ([x(0), y(1)] as const);

  // Slope at the tip in screen pixels (the SVG is stretched to the box), so the lion leans with it.
  const ds = Math.max(seconds * 0.02, 0.05);
  const dx = ((x(seconds) - x(Math.max(seconds - ds, 0))) / VW) * size.w;
  const dy = ((y(mAt(seconds)) - y(mAt(Math.max(seconds - ds, 0)))) / VH) * size.h;
  const angle = flying || crashed ? Math.max(-55, Math.min(0, (Math.atan2(dy, dx || 1) * 180) / Math.PI)) : 0;
  const lionWidth = Math.max(72, Math.min(170, size.w * 0.17));
  const tipLeft = (tip[0] / VW) * 100;
  const tipTop = (tip[1] / VH) * 100;

  // Sparks left behind on the curve: fixed positions just behind the tip, flickering with time.
  const sparks =
    flying && seconds > 0.4
      ? Array.from({ length: 9 }, (_, i) => {
          const s = seconds - 0.18 * (i + 1) - ((now / 90 + i * 37) % 10) * 0.004;
          if (s <= 0) return null;
          return { left: (x(s) / VW) * 100, top: (y(mAt(s)) / VH) * 100, o: 0.9 - i * 0.09, r: 2 + ((i * 7 + Math.floor(now / 120)) % 3) };
        }).filter((p) => p !== null)
      : [];

  const gridY = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].filter((v) => v < maxY);

  return (
    <div ref={box} className={`den-field relative h-[20rem] overflow-hidden rounded-[22px] text-white sm:h-[30rem] ${crashed ? "den-shake" : ""}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <filter id="curve-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {gridY.map((v) => (
          <g key={v}>
            <line x1="44" x2="396" y1={y(v)} y2={y(v)} stroke={v === 2 ? GREEN : "white"} strokeOpacity={v === 2 ? 0.3 : 0.07} strokeDasharray={v === 2 ? "4 4" : undefined} />
            <text x="8" y={y(v) + 4} fill={v === 2 ? GREEN : "white"} fillOpacity=".5" fontSize="10">
              {v}x
            </text>
          </g>
        ))}
        {points && (
          <>
            <polygon points={`${x(0)},${y(1)} ${points} ${tip[0]},${y(1)}`} fill={colour} fillOpacity=".1" />
            <polyline points={points} fill="none" stroke={colour} strokeWidth="7" strokeOpacity=".45" filter="url(#curve-glow)" />
            <polyline points={points} fill="none" stroke={colour} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>

      {sparks.map((p, i) => (
        <span
          key={i}
          className="pointer-events-none absolute rounded-full"
          style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.r * 2, height: p.r * 2, background: colour, opacity: p.o, boxShadow: `0 0 8px ${colour}`, transform: "translate(-50%, -50%)" }}
          aria-hidden
        />
      ))}

      {/* The lion: paws on the tip of the curve, leaning with the slope. Hidden in the countdown. */}
      {(flying || crashed) && (
        <div
          key={crashed ? `crash-${game?.round}` : "run"}
          className="pointer-events-none absolute"
          style={{ left: `${tipLeft}%`, top: `${tipTop}%`, transform: `translate(-50%, -91%) rotate(${angle}deg)`, transformOrigin: "50% 91%" }}
        >
          {flying && (
            <div className="lion-trails absolute right-[70%] top-[35%] h-[45%] w-[120%]" aria-hidden>
              <span style={{ top: "15%" }} />
              <span style={{ top: "45%", animationDelay: "0.12s" }} />
              <span style={{ top: "75%", animationDelay: "0.24s" }} />
            </div>
          )}
          <div className={crashed ? "lion-tumble" : ""}>
            <RunningLion mode={crashed ? "crash" : "run"} width={lionWidth} />
          </div>
        </div>
      )}
      {crashed && (
        <span className="den-pop pointer-events-none absolute text-6xl" style={{ left: `${tipLeft}%`, top: `${tipTop}%`, transform: "translate(-50%, -50%)" }} aria-hidden>
          💥
        </span>
      )}
      {live.phase === "betting" && (
        <div className="pointer-events-none absolute bottom-[6%] left-[8%]" aria-hidden>
          <RunningLion mode="idle" width={lionWidth * 0.8} />
        </div>
      )}
      {crashed && <div key={`flash-${game?.round}`} className="den-flash pointer-events-none absolute inset-0" aria-hidden />}

      <div className="pointer-events-none relative flex h-full flex-col items-center justify-center px-4 text-center sm:items-end sm:pr-[10%]">
        {live.phase === "waiting" && <div className="font-display text-2xl font-extrabold opacity-80">{g.connecting}</div>}
        {live.phase === "betting" && (
          <div className="sm:text-right">
            <div className="text-sm font-bold uppercase tracking-widest opacity-80">{g.nextRound}</div>
            <div className="num font-display text-7xl font-extrabold sm:text-8xl">{(live.msLeft / 1000).toFixed(1)}s</div>
            <div className="mt-2 inline-block rounded-full bg-black/35 px-4 py-1 text-sm font-bold">{g.placeBets}</div>
            {lastCrash !== null && (
              <div className="mt-3 text-sm font-bold" style={{ color: RED }}>
                {g.lastRound(fmt(lastCrash))}
              </div>
            )}
          </div>
        )}
        {flying && (
          <div className="sm:text-right">
            <div className="num font-display text-7xl font-extrabold drop-shadow-lg sm:text-9xl" style={{ color: live.multiplier >= 200 ? GREEN : "white" }}>
              {fmt(live.multiplier)}x
            </div>
            {cashedAt !== null && (
              <div className="mt-3 inline-block rounded-full bg-good px-4 py-1.5 text-base font-extrabold">{g.cashedOut(fmt(cashedAt))}</div>
            )}
          </div>
        )}
        {crashed && (
          <div className="sm:text-right">
            <div className="den-pop font-display text-3xl font-extrabold uppercase tracking-wide sm:text-4xl" style={{ color: RED }}>
              💥 {g.roaredTitle}
            </div>
            <div className="den-pop num font-display text-7xl font-extrabold drop-shadow-lg sm:text-9xl" style={{ color: RED }}>
              @ {fmt(live.multiplier)}x
            </div>
            {cashedAt !== null && (
              <div className="mt-3 inline-block rounded-full bg-good px-4 py-1.5 text-base font-extrabold">{g.cashedOut(fmt(cashedAt))}</div>
            )}
            {lostStake && (
              <div className="mt-3 inline-block rounded-full bg-[#ff5a4e] px-4 py-1.5 text-base font-extrabold">{g.youLost(lostStake)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
