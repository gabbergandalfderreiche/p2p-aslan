"use client";

import Link from "next/link";
import { Lion } from "./lion/Lion";
import { BRAND } from "@/lib/brand";
import { useT } from "@/i18n/client";

export function Logo() {
  const { path } = useT();
  return (
    <Link href={path()} className="flex items-center gap-2">
      <Lion size={34} />
      <span className="font-display text-lg font-extrabold">{BRAND.name}</span>
    </Link>
  );
}
