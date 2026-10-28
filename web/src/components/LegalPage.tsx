import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { LegalFooter } from "./LegalFooter";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { isPlaceholder } from "@/lib/legal";
import { localePath } from "@/i18n";
import { getDictionary, getLocale } from "@/i18n/server";

/** Shared frame for Impressum and Datenschutz. */
export async function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const t = await getDictionary();
  const locale = await getLocale();
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href={localePath(locale, "/app")} className="btn btn-ghost !py-2 text-sm">
              {t.nav.toApp}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="font-display text-4xl font-extrabold">{title}</h1>
        {t.legal.translationNote && (
          <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-2 text-sm text-muted">{t.legal.translationNote}</p>
        )}
        <div className="legal mt-6">{children}</div>
      </main>
      <LegalFooter />
    </div>
  );
}

/** Renders an operator detail; unfilled placeholders are highlighted. */
export function Field({ value }: { value: string }) {
  if (!isPlaceholder(value)) return <>{value}</>;
  return (
    <mark className="rounded bg-soft/50 px-1 text-ink" title="Platzhalter / placeholder – src/lib/legal.ts">
      {value}
    </mark>
  );
}
