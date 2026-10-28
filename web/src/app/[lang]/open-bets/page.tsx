import type { Metadata } from "next";
import { AppFrame } from "@/components/AppFrame";
import { BRAND } from "@/lib/brand";
import { getDictionary } from "@/i18n/server";
import { OpenBets } from "./OpenBets";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: `${t.open.title} – ${BRAND.name}`,
    alternates: { languages: { de: "/de/open-bets", en: "/en/open-bets" } },
  };
}

export default function OpenBetsPage() {
  return (
    <AppFrame>
      <OpenBets />
    </AppFrame>
  );
}
