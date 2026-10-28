"use client";

import { useT } from "@/i18n/client";

/** Chips to show one competition or all; `null` = all. */
export function LeagueFilter({
  leagues,
  counts,
  value,
  onChange,
}: {
  leagues: string[];
  counts: Record<string, number>;
  value: string | null;
  onChange: (league: string | null) => void;
}) {
  const { t } = useT();
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${active ? "border-accent bg-accent text-on-accent" : "border-line text-muted hover:text-ink"}`;
  if (leagues.length < 2) return null;
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <button type="button" className={chip(value === null)} onClick={() => onChange(null)}>
        {t.matches.allLeagues}
      </button>
      {leagues.map((l) => (
        <button key={l} type="button" className={chip(value === l)} onClick={() => onChange(l)}>
          {l} <span className="opacity-70">{counts[l]}</span>
        </button>
      ))}
    </div>
  );
}
