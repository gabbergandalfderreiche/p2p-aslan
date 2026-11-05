"use client";

import Link from "next/link";
import { useT } from "@/i18n/client";

/** The oracle owl next to the lion: a small link to the coming book game "Das Orakel". */
export function OracleOwl({ className = "" }: { className?: string }) {
  const { t, path } = useT();
  return (
    <Link href={path("/oracle")} title={t.oracle.title} className={`group flex w-fit flex-col items-center gap-1 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/owl-funny.png" alt="" className="lion-bounce h-auto w-28 drop-shadow-[0_6px_12px_rgba(0,0,0,0.3)] [animation-delay:-1.3s]" draggable={false} />
      <span className="font-display text-sm font-extrabold text-muted group-hover:text-ink">{t.oracle.title} →</span>
    </Link>
  );
}
