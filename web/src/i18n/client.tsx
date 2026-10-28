"use client";

import { createContext, useContext, type ReactNode } from "react";
import { dictionaries, localePath, type Locale } from "./index";

const LocaleContext = createContext<Locale>("de");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** Dictionary and a path helper for the current locale (Client Components). */
export function useT() {
  const locale = useLocale();
  return { t: dictionaries[locale], locale, path: (p = "/") => localePath(locale, p) };
}
