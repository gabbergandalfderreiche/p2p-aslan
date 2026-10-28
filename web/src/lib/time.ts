"use client";

import { useSyncExternalStore } from "react";

const STEP = 15; // seconds; the snapshot only changes every step, so React sees a stable value

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, STEP * 1000);
  return () => clearInterval(id);
}

const snapshot = () => Math.floor(Date.now() / 1000 / STEP) * STEP;

/** Current unix time in seconds, updated every 15 s. 0 during the server render. */
export function useNow() {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Unix seconds -> value for <input type="datetime-local"> in the visitor's time zone. */
export function toLocalInput(sec: number) {
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> unix seconds (0 if empty or invalid). */
export function fromLocalInput(value: string) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function fmtDate(sec: number, locale: string) {
  return new Date(sec * 1000).toLocaleString(locale === "de" ? "de-CH" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
