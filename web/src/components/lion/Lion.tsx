import { useId } from "react";
import { lionSvg } from "./lionSvg";

/** The lion mascot. `animated` adds a slow mane sway, breathing and an occasional blink. */
export function Lion({
  size = 64,
  animated = false,
  title = "",
  className = "",
}: {
  size?: number;
  animated?: boolean;
  title?: string;
  className?: string;
}) {
  // SVG ids (clip path, scoped styles) must be unique per instance on the page.
  const id = `lion${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <span
      className={`inline-block shrink-0 leading-none ${className}`}
      style={{ width: size, height: size }}
      // Static markup built from constants in lionSvg.ts, no user input.
      dangerouslySetInnerHTML={{ __html: lionSvg({ id, size, animated, title }) }}
    />
  );
}
