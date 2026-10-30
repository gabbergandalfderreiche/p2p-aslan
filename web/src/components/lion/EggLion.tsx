"use client";

import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Lion } from "./Lion";
import { useT } from "@/i18n/client";

/** The lion with a secret: a double-click (double-tap) opens the Löwensprung page. */
export function EggLion(props: ComponentProps<typeof Lion>) {
  const router = useRouter();
  const { path } = useT();
  return (
    <span
      onDoubleClick={(e) => {
        e.preventDefault();
        router.push(path("/lion-den"));
      }}
      className="inline-block select-none"
    >
      <Lion {...props} />
    </span>
  );
}
