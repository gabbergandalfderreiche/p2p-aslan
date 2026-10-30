"use client";

import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Lion } from "./Lion";
import { useT } from "@/i18n/client";

/**
 * The lion with a secret: a double-click (double-tap) opens the Löwensprung page. `golden` shows the
 * drawn golden lion (the one on hamstr.online) instead of the logo lion.
 */
export function EggLion({ golden = false, ...props }: ComponentProps<typeof Lion> & { golden?: boolean }) {
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
      {golden ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/lion-leap.png" alt={props.title ?? ""} style={{ width: props.size }} className="h-auto" draggable={false} />
      ) : (
        <Lion {...props} />
      )}
    </span>
  );
}
