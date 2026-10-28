"use client";

import { useState } from "react";
import { MatchBetForm } from "./MatchBetForm";
import { CreateBet } from "./CreateBet";
import { useT } from "@/i18n/client";

/** "New bet" card: football bets first, custom claims as the second tab. */
export function NewBet() {
  const { t } = useT();
  const [tab, setTab] = useState<"football" | "custom">("football");
  const tabs = [
    ["football", t.matches.tabFootball],
    ["custom", t.matches.tabCustom],
  ] as const;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold">{t.app.create.title}</h2>
        <div role="tablist" className="flex rounded-full border border-line p-0.5 text-sm font-bold">
          {tabs.map(([key, name]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-full px-3 py-1 ${tab === key ? "bg-accent text-on-accent" : "text-muted hover:text-ink"}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      {tab === "football" ? <MatchBetForm /> : <CreateBet embedded />}
    </section>
  );
}
