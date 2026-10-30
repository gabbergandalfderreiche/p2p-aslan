/** Head of the golden lion: logo, dialogs and the favicon. */
export function LionHead({ size = 48, title = "" }: { size?: number; title?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/lion-head.png" alt={title} width={size} height={size} className="inline-block shrink-0" draggable={false} />;
}
