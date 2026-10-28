import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, hasLocale, type Locale } from "@/i18n";

/** Saved choice from the language switcher first, then the browser's Accept-Language, then English. */
function pickLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (saved && hasLocale(saved)) return saved;

  const accepted = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  const match = accepted.find((a) => hasLocale(a.lang));
  return match ? (match.lang as Locale) : DEFAULT_LOCALE;
}

/** Sends every path without a locale prefix to its localized version, e.g. /app -> /de/app. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (/^\/(de|en)(\/|$)/.test(pathname)) return;

  const url = request.nextUrl.clone();
  url.pathname = `/${pickLocale(request)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals and files with an extension (favicon.ico, images, ...).
  matcher: ["/((?!_next|.*\\..*).*)"],
};
