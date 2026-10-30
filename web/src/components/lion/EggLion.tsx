"use client";

import { useRouter } from "next/navigation";
import { LionHead } from "./LionHead";
import { useT } from "@/i18n/client";

/**
 * The lion with a secret: a double-click (double-tap) opens the Löwensprung page. By default the
 * lion's head; `full` shows the whole golden lion leaping.
 */
export function EggLion({ size = 48, title = "", full = false }: { size?: number; title?: string; full?: boolean }) {
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
      {full ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/lion-leap.png" alt={title} style={{ width: size }} className="h-auto" draggable={false} />
      ) : (
        <LionHead size={size} title={title} />
      )}
    </span>
  );
}
