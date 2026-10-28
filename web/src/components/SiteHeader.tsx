"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ConnectButton } from "./ConnectButton";
import { useT } from "@/i18n/client";

/** Sticky header: on app pages with the sign-in button, elsewhere with a link to the app. */
export function SiteHeader({ app = false }: { app?: boolean }) {
  const { t, path } = useT();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Logo />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {app ? (
            <ConnectButton />
          ) : (
            <Link href={path("/app")} className="btn btn-primary !py-2 text-sm">
              {t.nav.openApp}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
