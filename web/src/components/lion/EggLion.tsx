"use client";

import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Lion } from "./Lion";
import { useT } from "@/i18n/client";

/**
 * The lion with a secret: a double-click (double-tap) opens the Löwensprung page. `funny` shows the
 * drawn sunglasses lion instead of the logo lion.
 */
export function EggLion({ funny = false, ...props }: ComponentProps<typeof Lion> & { funny?: boolean }) {
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
      {funny ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/funny-lion.png" alt={props.title ?? ""} style={{ width: props.size }} className="lion-bounce h-auto" draggable={false} />
      ) : (
        <Lion {...props} />
      )}
    </span>
  );
}
