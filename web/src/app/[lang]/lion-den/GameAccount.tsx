"use client";

import { useEffect, useState } from "react";
import { erc20Abi, type Address } from "viem";
import { StarterKit } from "@/components/StarterKit";
import { DEPLOYMENT, fmtUsd, parseUsd, TOKEN_SYMBOL, useTokenBalance } from "@/lib/bets";
import { txUrl } from "@/lib/network";
import { refetchSoon } from "@/lib/tx";
import { errorText as walletErrorText, useSend } from "@/lib/useSend";
import { useStarterKit } from "@/lib/useStarterKit";
import { useT } from "@/i18n/client";
import { MoneyRain } from "./MoneyRain";
import { denApi, type useDenAccount } from "./useDen";

/** Only the house owner (Oli's wallet, the timelock admin) tops up the pot; players never see that button. */
const POT_OWNER = "0xbd7c9af9cd062e3f099d8442393052dd71744c01";

/**
 * The tUSD game account shared by Löwensprung and the Orakel: balance, deposit from the wallet,
 * withdraw to it, the starter kit for newcomers and the house pot. Same panel on both pages.
 */
export function GameAccount({ account }: { account: ReturnType<typeof useDenAccount> }) {
  const { t } = useT();
  const g = t.den;
  const { address, me, loggedIn, refreshMe } = account;
  const kit = useStarterKit(address);
  const wallet = useTokenBalance(address);
  const send = useSend(t);

  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [rain, setRain] = useState({ n: 0, amount: "" });
  const [house, setHouse] = useState<{ house: Address | null; pot: number; persistent: boolean } | null>(null);

  const errorText = (e: unknown) => {
    const code = e instanceof Error ? e.message : "server";
    return g.errors[code] ?? walletErrorText(e, t);
  };

  const loadHouse = () =>
    fetch("/api/den/house", { cache: "no-store" })
      .then((r) => r.json())
      .then(setHouse)
      .catch(() => {});
  useEffect(() => {
    const id = setTimeout(loadHouse, 0);
    return () => clearTimeout(id);
  }, []);

  const afterMove = () =>
    refetchSoon(() => {
      wallet.refetch();
      void loadHouse();
    });

  /** Sends tUSD from the wallet to the house; `credit` puts it on the game account. */
  async function moveIn(credit: boolean) {
    if (!address || !house?.house || !DEPLOYMENT) return;
    setMessage(null);
    const value = parseUsd(amount);
    const to = house.house;
    let hash = "";
    const ok = await send.run(async (step) => {
      hash = await step(credit ? g.depositing : g.funding, (w) =>
        w({ address: DEPLOYMENT!.token, abi: erc20Abi, functionName: "transfer", args: [to, value] }),
      );
    });
    if (ok && credit) {
      try {
        await denApi("deposit", { hash });
        await refreshMe();
        setMessage({ ok: true, text: g.deposited(fmtUsd(value)), tx: hash });
        setRain((r) => ({ n: r.n + 1, amount: fmtUsd(value) }));
      } catch (e) {
        setMessage({ ok: false, text: errorText(e) });
      }
    } else if (ok) {
      setMessage({ ok: true, text: g.funded(fmtUsd(value)), tx: hash });
    }
    afterMove();
  }

  async function withdraw() {
    setBusy(true);
    setMessage(null);
    try {
      const value = parseUsd(amount);
      const { hash } = await denApi<{ hash: string }>("withdraw", { amount: Number(value) });
      await refreshMe();
      setMessage({ ok: true, text: g.withdrawn(fmtUsd(value)), tx: hash });
      afterMove();
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="den-panel grid gap-4 p-5 md:grid-cols-3">
      <MoneyRain trigger={rain.n} amount={rain.amount} />
      <div>
        <h2 className="font-display text-xl font-extrabold">{g.account}</h2>
        <div className="num font-display mt-1 text-3xl font-extrabold">
          {fmtUsd(BigInt(me?.balance ?? 0))} <span className="text-base text-muted">{TOKEN_SYMBOL}</span>
        </div>
        <p className="text-xs text-muted">{g.accountHint}</p>
      </div>

      {address && loggedIn && (
        <div className="rounded-2xl border border-line p-3">
          <div className="flex items-center gap-2">
            <input className="field num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={g.amount} />
            <span className="text-sm text-muted">{TOKEN_SYMBOL}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="btn btn-primary !py-2 text-sm" disabled={Boolean(send.busy) || !house?.house} onClick={() => moveIn(true)}>
              {send.busy ?? g.deposit}
            </button>
            <button className="btn btn-ghost !py-2 text-sm" disabled={busy} onClick={withdraw}>
              {g.withdraw}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">{g.walletBalance(fmtUsd(wallet.data ?? 0n))}</p>
        </div>
      )}
      {address && (kit.needsGas || kit.balance === 0n) && <StarterKit kit={kit} />}

      <div className="rounded-2xl bg-surface-2 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">{g.pot}</span>
          <span className="num font-bold">
            {fmtUsd(BigInt(house?.pot ?? 0))} {TOKEN_SYMBOL}
          </span>
        </div>
        {address?.toLowerCase() === POT_OWNER && house?.house && (
          <button className="mt-2 text-xs font-semibold underline" disabled={Boolean(send.busy)} onClick={() => moveIn(false)}>
            {g.fundPot(amount)}
          </button>
        )}
        {house && !house.persistent && <p className="mt-2 text-xs text-bad">{g.notPersistent}</p>}
      </div>

      {send.error && <p className="text-sm font-semibold text-bad md:col-span-3">{send.error}</p>}
      {message && (
        <p className={`text-sm font-semibold md:col-span-3 ${message.ok ? "text-good" : "text-bad"}`}>
          {message.text}{" "}
          {message.tx && txUrl(message.tx) && (
            <a href={txUrl(message.tx)!} target="_blank" rel="noopener noreferrer" className="font-normal underline">
              {t.app.viewTx}
            </a>
          )}
        </p>
      )}
    </aside>
  );
}
