"use client";

import { useBalance, useConnection, useReadContract } from "wagmi";
import { TxStatus } from "@/components/AppFrame";
import { useConnectModal } from "@/components/ConnectModal";
import { testDollarAbi } from "@/generated/contracts";
import { DEPLOYMENT, fmtUsd, TOKEN_SYMBOL, useTokenBalance } from "@/lib/bets";
import { ETH_FAUCET, NETWORK } from "@/lib/network";
import { fmtDate, useNow } from "@/lib/time";
import { refetchSoon } from "@/lib/tx";
import { useSend } from "@/lib/useSend";
import { useT } from "@/i18n/client";

const COOLDOWN = 86_400; // TestDollar.FAUCET_COOLDOWN

/** Play-money balance, the daily faucet and a hint when test ETH for gas is missing. */
export function WalletCard() {
  const { t, locale } = useT();
  const w = t.app.wallet;
  const { address } = useConnection();
  const { open } = useConnectModal();
  const now = useNow();
  const send = useSend(t);
  const token = DEPLOYMENT!.token;

  const tokenBalance = useTokenBalance(address);
  const claimed = useReadContract({
    address: token,
    abi: testDollarAbi,
    functionName: "lastClaim",
    args: [address!],
    query: { enabled: Boolean(address) },
  });
  const eth = useBalance({ address, query: { enabled: Boolean(address) } });

  const balance = tokenBalance.data ?? 0n;
  const lastClaim = Number(claimed.data ?? 0n);
  const nextClaim = lastClaim ? lastClaim + COOLDOWN : 0;
  const canClaim = Boolean(address) && now > 0 && now >= nextClaim;
  const noGas = NETWORK !== "local" && eth.data?.value === 0n;

  async function faucet() {
    await send.run(async (step) => {
      await step(w.faucetBusy, (write) => write({ address: token, abi: testDollarAbi, functionName: "faucet" }));
    });
    refetchSoon(() => {
      tokenBalance.refetch();
      claimed.refetch();
      eth.refetch();
    });
  }

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
            {fmtUsd(balance)} <span className="text-base text-muted">{TOKEN_SYMBOL}</span>
          </div>
          <button className="btn btn-ghost mt-4 w-full" disabled={!canClaim || Boolean(send.busy) || noGas} onClick={faucet}>
            {send.busy ?? w.faucet}
          </button>
          {!canClaim && nextClaim > 0 && now > 0 && (
            <p className="mt-2 text-xs text-muted">{w.faucetWait(fmtDate(nextClaim, locale))}</p>
          )}
          <TxStatus error={send.error} hash={send.hash} done={w.faucetDone} />

          {noGas && (
            <div className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm">
              <div className="font-bold">{w.gasTitle}</div>
              <p className="mt-1 text-xs text-muted">{w.gasText}</p>
              <a href={ETH_FAUCET} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold underline">
                {w.gasLink}
              </a>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
