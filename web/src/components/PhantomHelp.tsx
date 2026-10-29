"use client";

import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { NETWORK } from "@/lib/network";
import { useT } from "@/i18n/client";

const SEEN_KEY = "p2pbet-phantom-testnet-help";

const isPhantom = (c?: { id: string; name: string }) => Boolean(c && (c.id === "app.phantom" || /phantom/i.test(c.name)));

/** Step-by-step dialog: switch Phantom to testnet mode so it works with Base Sepolia. */
export function PhantomHelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const p = t.phantomHelp;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phantom-help-title"
        className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ab9ff2] text-xl" aria-hidden>
              👻
            </span>
            <div>
              <h2 id="phantom-help-title" className="font-display text-xl font-extrabold">
                {p.title}
              </h2>
              <p className="text-xs text-muted">{p.sub}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t.connect.close} className="rounded-full px-2 text-xl text-muted hover:text-ink">
            ×
          </button>
        </div>

        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">{p.why}</p>

        <ol className="mt-4 space-y-3">
          {p.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent font-extrabold text-on-accent">{i + 1}</span>
              <div>
                <div className="font-bold">{s.title}</div>
                <p className="text-sm text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-xs text-muted">{p.safe}</p>
        <button className="btn btn-primary mt-4 w-full" onClick={onClose}>
          {p.done}
        </button>
      </div>
    </div>
  );
}

/** Small text link that opens the dialog. */
export function PhantomHelpLink({ className = "" }: { className?: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  if (NETWORK === "local") return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`text-xs font-semibold underline ${className}`}>
        {t.phantomHelp.link}
      </button>
      {open && <PhantomHelpDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** Opens the dialog once, the first time someone signs in with Phantom. */
export function PhantomAutoHelp() {
  const { connector, isConnected } = useConnection();
  const [open, setOpen] = useState(false);
  const phantom = isConnected && isPhantom(connector);

  useEffect(() => {
    if (!phantom || NETWORK === "local") return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "yes";
      window.localStorage.setItem(SEEN_KEY, "yes");
    } catch {
      // Storage blocked: show it, it only costs one click.
    }
    if (seen) return;
    const id = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(id);
  }, [phantom]);

  return open ? <PhantomHelpDialog onClose={() => setOpen(false)} /> : null;
}
