"use client";

import type { ReactNode } from "react";
import { useConnection, useSwitchChain } from "wagmi";
import { SiteHeader } from "./SiteHeader";
import { LegalFooter } from "./LegalFooter";
import { BetaGate } from "./BetaGate";
import { PhantomAutoHelp, PhantomHelpLink } from "./PhantomHelp";
import { DEPLOYMENT } from "@/lib/bets";
import { activeChain, NETWORK, txUrl } from "@/lib/network";
import { useT } from "@/i18n/client";

/** Header, testnet banner, beta notice and network checks shared by all app pages. */
export function AppFrame({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { isConnected, chainId } = useConnection();
  const switchChain = useSwitchChain();
  const wrongChain = isConnected && chainId !== activeChain.id;

  return (
    <BetaGate>
      <SiteHeader app />
      <div className="border-b border-line bg-surface-2 px-4 py-2 text-center text-xs font-semibold text-accent-ink">
        {NETWORK === "local" ? t.app.localBanner : t.app.testnetBanner}
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {wrongChain && (
          <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
            <span>
              <span className="block font-semibold">{t.app.wrongNetwork}</span>
              <PhantomHelpLink />
            </span>
            <button className="btn btn-primary !py-2 text-sm" onClick={() => switchChain.mutate({ chainId: activeChain.id })}>
              {t.app.switchTo(activeChain.name)}
            </button>
          </div>
        )}
        {DEPLOYMENT ? children : <div className="card p-6 text-muted">{t.app.notDeployed}</div>}
      </main>
      <LegalFooter />
      <PhantomAutoHelp />
    </BetaGate>
  );
}

/** Error line plus explorer link after a transaction. */
export function TxStatus({ error, hash, done }: { error: string | null; hash: string | null; done?: string }) {
  const { t } = useT();
  if (error) return <p className="mt-3 text-sm font-semibold text-bad">{error}</p>;
  if (!hash) return null;
  return (
    <p className="mt-3 text-sm font-semibold text-good">
      {done ?? t.bet.done}{" "}
      <TxLink hash={hash} />
    </p>
  );
}

function TxLink({ hash }: { hash: string }) {
  const { t } = useT();
  const url = txUrl(hash);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="font-normal underline">
      {t.app.viewTx}
    </a>
  );
}
