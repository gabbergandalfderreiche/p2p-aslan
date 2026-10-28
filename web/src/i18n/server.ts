import { lang } from "next/root-params";
import { notFound } from "next/navigation";
import { dictionaries, hasLocale, type Locale } from "./index";

/** Locale of the current route (Server Components only). */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  if (!value || !hasLocale(value)) notFound();
  return value;
}

/** Dictionary of the current route (Server Components only). */
export async function getDictionary() {
  return dictionaries[await getLocale()];
}
