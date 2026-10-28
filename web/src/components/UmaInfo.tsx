"use client";

import { useT } from "@/i18n/client";

/** Tap-to-open explanation of the UMA oracle; a native <details>, so it works without JS and on touch. */
export function UmaInfo({ className = "" }: { className?: string }) {
  const { t } = useT();
  const u = t.uma;
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-accent-ink hover:underline [&::-webkit-details-marker]:hidden">
        <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px] leading-none">i</span>
        {u.question}
        <span className="transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="mt-2 space-y-2 rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-muted">
        <p className="text-ink">{u.what}</p>
        <ol className="list-decimal space-y-1 pl-4">
          {u.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p>{u.why}</p>
        <p>{u.testnet}</p>
        <a href="https://uma.xyz" target="_blank" rel="noopener noreferrer" className="inline-block font-semibold underline">
          {u.more}
        </a>
      </div>
    </details>
  );
}
