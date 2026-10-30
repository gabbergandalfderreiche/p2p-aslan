import type { Metadata } from "next";
import { AppFrame } from "@/components/AppFrame";
import { BRAND } from "@/lib/brand";
import { getDictionary } from "@/i18n/server";
import { WalletCard } from "./WalletCard";
import { NewBet } from "./NewBet";
import { BetLists } from "./BetLists";
import { DenLion } from "@/components/lion/DenLion";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: `${t.nav.openApp} – ${BRAND.name}`,
    alternates: { languages: { de: "/de/app", en: "/en/app" } },
  };
}

export default function AppPage() {
  return (
    <AppFrame>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <NewBet />
        <div className="space-y-6">
          <WalletCard />
          <DenLion className="hidden lg:flex" />
        </div>
      </div>
      <BetLists />
    </AppFrame>
  );
}
