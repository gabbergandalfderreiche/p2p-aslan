"use client";

import { useConnection } from "wagmi";
import { TxStatus } from "@/components/AppFrame";
import { useConnectModal } from "@/components/ConnectModal";
import { StarterKit } from "@/components/StarterKit";
import { fmtUsd, TOKEN_SYMBOL } from "@/lib/bets";
import { fmtDate } from "@/lib/time";
import { useStarterKit } from "@/lib/useStarterKit";
import { useT } from "@/i18n/client";

/** Play-money balance and the daily faucet; newcomers get test ETH and tUSD in one click. */
export function WalletCard() {
  const { t, locale } = useT();
  const w = t.app.wallet;
  const { address } = useConnection();
  const { open } = useConnectModal();
  const kit = useStarterKit(address);

  return (
    <aside className="card h-fit p-5">
      <h2 className="font-display text-xl font-extrabold">{w.title}</h2>
      {!address ? (
        <>
          <p className="mt-2 text-sm text-muted">{t.app.loginFirst}</p>
          <button className="btn btn-primary mt-4 w-full" onClick={open}>
            {t.connect.login}
          </button>
        </>
      ) : (
        <>
          <div className="mt-3 text-xs font-semibold text-muted">{w.balance}</div>
          <div className="num font-display text-3xl font-extrabold">
            {fmtUsd(kit.balance)} <span className="text-base text-muted">{TOKEN_SYMBOL}</span>
          </div>

          {kit.needsGas || kit.balance === 0n ? (
            <div className="mt-4">
              <StarterKit kit={kit} />
            </div>
          ) : (
            <>
              <button className="btn btn-ghost mt-4 w-full" disabled={!kit.canClaim || Boolean(kit.busy)} onClick={kit.start}>
                {kit.busy ?? w.faucet}
              </button>
              {!kit.canClaim && kit.nextClaim > 0 && (
                <p className="mt-2 text-xs text-muted">{w.faucetWait(fmtDate(kit.nextClaim, locale))}</p>
              )}
            </>
          )}
          {kit.done && <TxStatus error={null} hash={kit.hash} done={w.kitDone} />}
          {!kit.needsGas && kit.balance > 0n && kit.error && <p className="mt-3 text-sm font-semibold text-bad">{kit.error}</p>}
        </>
      )}
    </aside>
  );
}
