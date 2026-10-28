/**
 * Placeholder badge until the mascot arrives from the marketing chat (see brand-inbox/).
 * Deliberately plain: two facing halves for "you vs. your friend", no character.
 */
export function Mark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="19" fill="var(--accent)" />
      <path d="M20 1a19 19 0 0 1 0 38Z" fill="var(--accent-2)" />
      <text
        x="20"
        y="25.5"
        textAnchor="middle"
        fontSize="15"
        fontWeight="900"
        fontFamily="var(--font-display), system-ui, sans-serif"
        fill="var(--on-accent)"
      >
        VS
      </text>
    </svg>
  );
}
