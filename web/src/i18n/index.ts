import { de, type Dictionary } from "./de";
import { en } from "./en";

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** Cookie the language switcher sets and the proxy reads. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const dictionaries: Record<Locale, Dictionary> = { de, en };

export const hasLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);

/** Prefix an app path with the locale: localePath("en", "/app") -> "/en/app". */
export function localePath(locale: Locale, path = "/") {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export type { Dictionary };
