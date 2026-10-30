"use client";

import { useEffect, useState } from "react";
import { TOKEN_SYMBOL } from "@/lib/bets";

const RAIN = 64;
const SPRAY = 28;
const SHOW_MS = 3400;
// Fixed pseudo-random spread per piece, so renders stay pure and every shower looks lively.
const rnd = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * Deposit celebration: coins burst out of the middle, bills and coins rain down, a big "+amount" pops
 * up with a golden flash and a short shake. `trigger` changes for every new deposit.
 */
export function MoneyRain({ trigger, amount }: { trigger: number; amount: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    const start = setTimeout(() => setShown(trigger), 0);
    const end = setTimeout(() => setShown(0), SHOW_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [trigger]);
  if (!shown) return null;

  return (
    <div key={shown} className="money-stage pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      <div className="money-flash absolute inset-0" />
      {Array.from({ length: SPRAY }, (_, i) => {
        const angle = (i / SPRAY) * Math.PI * 2 + rnd(i, 1) * 0.4;
        const dist = 30 + rnd(i, 2) * 25; // vmin
        return (
          <span
            key={`s${i}`}
            className="money-coin money-spray"
            style={{
              ["--dx" as string]: `${Math.cos(angle) * dist}vmin`,
              ["--dy" as string]: `${Math.sin(angle) * dist}vmin`,
              animationDelay: `${rnd(i, 3) * 0.12}s`,
            }}
          />
        );
      })}
      {Array.from({ length: RAIN }, (_, i) => {
        const bill = i % 3 !== 0;
        return (
          <span
            key={`r${i}`}
            className={`${bill ? "money-bill" : "money-coin"} money-fall`}
            style={{
              left: `${rnd(i, 4) * 100}%`,
              animationDelay: `${0.15 + rnd(i, 5) * 1.2}s`,
              animationDuration: `${1.8 + rnd(i, 6) * 1.2}s`,
              ["--drift" as string]: `${(rnd(i, 7) - 0.5) * 160}px`,
              ["--spin" as string]: `${(rnd(i, 8) - 0.5) * 900}deg`,
              ["--scale" as string]: `${0.7 + rnd(i, 9) * 0.7}`,
            }}
          >
            {bill ? TOKEN_SYMBOL : ""}
          </span>
        );
      })}
      <div className="absolute inset-0 grid place-items-center">
        <div className="money-pop num font-display text-6xl font-extrabold text-[#ffd36b] sm:text-8xl">
          +{amount} {TOKEN_SYMBOL}
        </div>
      </div>
    </div>
  );
}
