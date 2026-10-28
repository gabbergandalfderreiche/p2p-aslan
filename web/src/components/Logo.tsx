"use client";

import Link from "next/link";
import { Mark } from "./Mark";
import { BRAND } from "@/lib/brand";
import { useT } from "@/i18n/client";

export function Logo() {
  const { path } = useT();
  return (
    <Link href={path()} className="flex items-center gap-2">
      <Mark size={30} />
      <span className="font-display text-lg font-extrabold">{BRAND.name}</span>
    </Link>
  );
}
