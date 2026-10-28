import Link from "next/link";
import { Mark } from "@/components/Mark";
import { SiteHeader } from "@/components/SiteHeader";
import { LegalFooter } from "@/components/LegalFooter";
import { localePath } from "@/i18n";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function Home() {
  const t = await getDictionary();
  const locale = await getLocale();
  const h = t.home;

  return (
    <div className="flex flex-col">
      <SiteHeader />

      <main>
        <section className="versus border-b border-line">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-[1.4fr_1fr] md:py-20">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted">
                <span className="h-2 w-2 rounded-full bg-good" />
                {h.kicker}
              </span>
              <h1 className="font-display mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
                {h.title}
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted">{h.lead}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={localePath(locale, "/app")} className="btn btn-primary">
                  {h.cta}
                </Link>
                <Link href={localePath(locale, "/start")} className="btn btn-ghost">
                  {h.ctaGuide}
                </Link>
              </div>
            </div>
            <div className="mx-auto">
              <Mark size={220} />
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-3xl font-extrabold">{h.stepsTitle}</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {h.steps.map((s, i) => (
              <li key={s.title} className="card p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-accent font-extrabold text-on-accent">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="rules" className="mx-auto grid max-w-6xl gap-4 px-4 pb-14 md:grid-cols-2">
          <div className="card p-6">
            <h2 className="font-display text-2xl font-extrabold">{h.rulesTitle}</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {h.rules.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-2" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="font-display text-2xl font-extrabold">{h.factsTitle}</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {h.facts.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-good" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[22px] bg-surface-2 p-6 md:col-span-2">
            <h2 className="font-display text-xl font-extrabold">{h.whyTitle}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{h.why}</p>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
