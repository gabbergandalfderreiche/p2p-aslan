import type { Metadata } from "next";
import { AppFrame } from "@/components/AppFrame";
import { BRAND } from "@/lib/brand";
import { getDictionary } from "@/i18n/server";
import { LionDen } from "./LionDen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.den.title} – ${BRAND.name}`, robots: { index: false, follow: false } };
}

/** Easter egg: reached by double-clicking the lion, not linked anywhere. */
export default function LionDenPage() {
  return (
    <AppFrame>
      <LionDen />
    </AppFrame>
  );
}
