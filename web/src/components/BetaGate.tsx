"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Lion } from "./lion/Lion";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";
import { useT } from "@/i18n/client";

// Acceptance holds for both languages: the points are the same, only translated.
const STORAGE_KEY = `p2pbet-beta-accepted-${LEGAL.betaNoticeVersion}`;

// Acceptance lives in localStorage; if storage is blocked (private mode etc.) it only lasts for this page.
const listeners = new Set<() => void>();
let acceptedThisSession = false;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readAccepted() {
  if (acceptedThisSession) return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "yes";
  } catch {
    return false;
  }
}

function storeAccepted() {
  acceptedThisSession = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, "yes");
  } catch {
    // Not persisted; the notice shows again next visit.
  }
  listeners.forEach((l) => l());
}

/** Blocks the app until the visitor has confirmed every point of the beta notice once. */
export function BetaGate({ children }: { children: ReactNode }) {
  // null on the server: the dialog only decides after mount, so it never flashes for returning users.
  const accepted = useSyncExternalStore<boolean | null>(subscribe, readAccepted, () => null);
  const { t, path } = useT();
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const firstBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (accepted === false) firstBox.current?.focus();
  }, [accepted]);

  const allChecked = t.beta.points.every((_, i) => checked[i]);
  const accept = storeAccepted;

  const blocked = accepted !== true;

  return (
    <>
      <div inert={blocked} aria-hidden={blocked} className="flex min-h-full flex-1 flex-col">
        {children}
      </div>

      {accepted === false && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="beta-title"
            className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
          >
            <div className="flex items-center gap-3">
              <Lion size={60} animated />
              <div>
                <span className="rounded-full bg-soft/40 px-2 py-0.5 text-[11px] font-bold">{t.beta.tag}</span>
                <h2 id="beta-title" className="font-display mt-1 text-2xl font-extrabold">
                  {t.beta.title}
                </h2>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">
              {t.beta.intro(BRAND.name)}
            </p>

            <ul className="mt-4 space-y-3">
              {t.beta.points.map((text, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer gap-3 rounded-2xl border border-line p-3 text-sm hover:border-accent">
                    <input
                      ref={i === 0 ? firstBox : undefined}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      checked={Boolean(checked[i])}
                      onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                    />
                    <span>{text}</span>
                  </label>
                </li>
              ))}
            </ul>

            <button className="btn btn-primary mt-5 w-full" disabled={!allChecked} onClick={accept}>
              {allChecked ? t.beta.continue : t.beta.confirmAll}
            </button>
            <div className="mt-3 flex justify-between text-xs font-semibold text-muted">
              <Link href={path()} className="underline">
                {t.beta.back}
              </Link>
              <span className="flex gap-3">
                <Link href={path("/impressum")} className="underline">
                  {t.footer.impressum}
                </Link>
                <Link href={path("/datenschutz")} className="underline">
                  {t.footer.privacy}
                </Link>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
