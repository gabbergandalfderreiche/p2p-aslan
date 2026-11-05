import type { Metadata } from "next";
import { AppFrame } from "@/components/AppFrame";
import { BRAND } from "@/lib/brand";
import { getDictionary } from "@/i18n/server";
import { OracleGame } from "./OracleGame";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.oracle.title} – ${BRAND.name}`, robots: { index: false, follow: false } };
}

/** Easter egg: reached through the oracle owl next to the lion. */
export default function OraclePage() {
  return (
    <AppFrame>
      <OracleGame />
    </AppFrame>
  );
}
