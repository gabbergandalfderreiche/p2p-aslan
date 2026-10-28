import { Suspense } from "react";
import type { Metadata } from "next";
import { AppFrame } from "@/components/AppFrame";
import { BRAND } from "@/lib/brand";
import { getDictionary } from "@/i18n/server";
import { BetView } from "./BetView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.bet.metaTitle} – ${BRAND.name}` };
}

/** One bet, addressed as /bet?id=N so the page stays static and shareable. */
export default async function BetPage() {
  const t = await getDictionary();
  return (
    <AppFrame>
      {/* The id comes from the query string, which is only known in the browser. */}
      <Suspense fallback={<p className="text-muted">{t.bet.loading}</p>}>
        <BetView />
      </Suspense>
    </AppFrame>
  );
}
