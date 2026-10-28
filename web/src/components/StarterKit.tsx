"use client";

import type { useStarterKit } from "@/lib/useStarterKit";
import { ETH_FAUCET } from "@/lib/network";
import { fmtDate } from "@/lib/time";
import { useT } from "@/i18n/client";

/** One button for test ETH + play money, shown wherever someone lacks either. */
export function StarterKit({ kit, need }: { kit: ReturnType<typeof useStarterKit>; need?: bigint }) {
  const { t, locale } = useT();
  const w = t.app.wallet;
  const lacksTokens = need !== undefined ? kit.balance < need : kit.balance === 0n;
  const offersTokens = lacksTokens && kit.canClaim;
  if (!kit.needsGas && !offersTokens) {
    // Nothing we can hand out right now; say when the next play money comes.
    if (lacksTokens && kit.nextClaim > 0) {
      return <p className="text-sm text-muted">{w.faucetWait(fmtDate(kit.nextClaim, locale))}</p>;
    }
    return null;
  }

  return (
    <div className="rounded-2xl border-2 border-accent bg-accent/10 p-4">
      <div className="font-display text-lg font-extrabold">{w.kitTitle}</div>
      <p className="mt-1 text-sm text-muted">
        {kit.needsGas && offersTokens ? w.kitBoth : kit.needsGas ? w.kitGas : w.kitTokens}
      </p>
      <button className="btn btn-primary mt-3 w-full" disabled={Boolean(kit.busy)} onClick={kit.start}>
        {kit.busy ?? w.kitButton}
      </button>
      {kit.error && (
        <p className="mt-2 text-xs text-muted">
          {kit.error}
          {kit.gasFailed && (
            <>
              {" "}
              <a href={ETH_FAUCET} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                {w.gasLink}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
