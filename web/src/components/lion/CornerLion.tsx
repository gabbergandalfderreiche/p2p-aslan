"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";

/** The funny lion in the bottom-right corner of every page: one click leads to Löwensprung. */
export function CornerLion() {
  const { t, path } = useT();
  const target = path("/lion-den");
  if (usePathname() === target) return null;
  return (
    <Link href={target} aria-label={t.den.title} title={t.den.title} className="lion-bounce fixed bottom-3 right-3 z-30 block w-16 sm:bottom-5 sm:right-5 sm:w-24">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/funny-lion.png" alt="" className="h-auto w-full drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]" draggable={false} />
    </Link>
  );
}
