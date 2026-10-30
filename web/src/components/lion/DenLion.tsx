"use client";

import Link from "next/link";
import { useT } from "@/i18n/client";

/** The funny lion as a small link to Löwensprung, placed in the page flow. */
export function DenLion({ className = "" }: { className?: string }) {
  const { t, path } = useT();
  return (
    <Link href={path("/lion-den")} title={t.den.title} className={`group mx-auto flex w-fit flex-col items-center gap-1 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/funny-lion.png" alt="" className="lion-bounce h-auto w-32 drop-shadow-[0_6px_12px_rgba(0,0,0,0.3)]" draggable={false} />
      <span className="font-display text-sm font-extrabold text-muted group-hover:text-ink">{t.den.title} →</span>
    </Link>
  );
}
