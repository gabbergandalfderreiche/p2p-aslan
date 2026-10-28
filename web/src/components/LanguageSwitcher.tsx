"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALE_COOKIE, LOCALES, dictionaries } from "@/i18n";
import { useT } from "@/i18n/client";
import { ThemeToggle } from "./ThemeToggle";

/** DE | EN toggle (plus the theme switch). Keeps the current page and remembers the choice in a cookie for the proxy. */
export function LanguageSwitcher() {
  const { t, locale } = useT();
  const pathname = usePathname() ?? `/${locale}`;
  const rest = pathname.replace(/^\/(de|en)(?=\/|$)/, "");

  return (
    <div className="flex items-center gap-1.5">
      <ThemeToggle />
      <nav aria-label={t.nav.language} className="flex rounded-full border border-line p-0.5 text-xs font-bold">
        {LOCALES.map((l) => (
          <Link
            key={l}
            href={`/${l}${rest}`}
            hrefLang={l}
            lang={l}
            aria-current={l === locale ? "true" : undefined}
            title={dictionaries[l].langName}
            onClick={() => {
              document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
            }}
            className={`rounded-full px-2.5 py-1 uppercase ${l === locale ? "bg-accent text-on-accent" : "text-muted hover:text-ink"}`}
          >
            {l}
          </Link>
        ))}
      </nav>
    </div>
  );
}
