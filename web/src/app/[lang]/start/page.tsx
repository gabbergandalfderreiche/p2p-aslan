import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { LegalFooter } from "@/components/LegalFooter";
import { BRAND } from "@/lib/brand";
import { localePath } from "@/i18n";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: `${t.guide.metaTitle} – ${BRAND.name}`,
    description: t.guide.lead,
    alternates: { languages: { de: "/de/start", en: "/en/start" } },
  };
}

/** Getting started for crypto newcomers: wallet, test ETH, play money, first bet. */
export default async function StartPage() {
  const t = await getDictionary();
  const locale = await getLocale();
  const g = t.guide;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <span className="text-xs font-bold uppercase tracking-wide text-accent-ink">{g.kicker}</span>
        <h1 className="font-display mt-2 text-4xl font-extrabold">{g.title}</h1>
        <p className="mt-3 text-muted">{g.lead}</p>

        <ol className="mt-8 space-y-4">
          {g.steps.map((s, i) => (
            <li key={s.title} className="card flex gap-4 p-5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent font-extrabold text-on-accent">
                {i + 1}
              </span>
              <div>
                <h2 className="text-lg font-bold">{s.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <Link href={localePath(locale, "/app")} className="btn btn-primary mt-8">
          {g.toApp}
        </Link>
      </main>
      <LegalFooter />
    </div>
  );
}
