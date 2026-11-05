"use client";

import { useEffect, useRef } from "react";

export type OwlMood = "fly" | "idle" | "cheer" | "shake";

// Sprite sheets in /public: frames side by side, 460 × 400 each, feet on the same line.
// `ms` matches the animation length in globals.css; after it the owl goes back to idle.
const SHEETS: Record<OwlMood, { src: string; frames: number; ms: number }> = {
  fly: { src: "/owl-fly.webp", frames: 6, ms: 900 },
  idle: { src: "/owl-idle.webp", frames: 4, ms: 0 },
  cheer: { src: "/owl-fly.webp", frames: 6, ms: 1300 },
  shake: { src: "/owl-shake.webp", frames: 4, ms: 1900 },
};

/**
 * The oracle owl perched on the slot: flies in, blinks while waiting, flaps on a win and shakes its
 * head (facepalm) on a miss. Every mood but idle plays once and then hands back to idle; `play`
 * changes for each new reaction so the same mood can play twice in a row.
 */
export function OwlSprite({ mood, play, onDone, className = "" }: { mood: OwlMood; play: number; onDone: () => void; className?: string }) {
  // Without motion the stylesheet shows the sitting owl whatever the mood (see .owl-sprite).
  const sheet = SHEETS[mood];
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  // A timer, not animationend: that event is lost when the animation ends before hydration.
  useEffect(() => {
    if (mood === "idle") return;
    const id = setTimeout(() => done.current(), SHEETS[mood].ms);
    return () => clearTimeout(id);
  }, [mood, play]);
  return (
    <div className={`${mood === "fly" ? "owl-arrive" : ""} ${className}`}>
      <div
        key={`${mood}-${play}`}
        className={`owl-sprite owl-${mood} aspect-[460/400] w-full`}
        style={{ backgroundImage: `url(${sheet.src})`, backgroundSize: `${sheet.frames * 100}% 100%` }}
        aria-hidden
      />
    </div>
  );
}

/** The whitepaper opening, frame by frame, for the start of the free spins. */
export function BookOpening({ className = "" }: { className?: string }) {
  return <div className={`book-open aspect-[400/420] ${className}`} aria-hidden />;
}
