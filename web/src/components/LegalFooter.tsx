"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { useT } from "@/i18n/client";

export function LegalFooter() {
  const { t, path } = useT();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs leading-relaxed text-muted md:flex-row md:items-start md:justify-between">
        <p className="max-w-2xl">{t.footer.disclaimer(BRAND.name)}</p>
        <nav className="flex shrink-0 gap-4 font-semibold">
          <Link href={path("/start")} className="hover:text-ink">
            {t.nav.guide}
          </Link>
          <Link href={path("/impressum")} className="hover:text-ink">
            {t.footer.impressum}
          </Link>
          <Link href={path("/datenschutz")} className="hover:text-ink">
            {t.footer.privacy}
          </Link>
          {BRAND.repo && (
            <a href={BRAND.repo} className="hover:text-ink">
              {t.footer.source}
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
