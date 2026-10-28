"use client";

import { useState } from "react";
import type { Address, Hash } from "viem";
import { useBalance, useReadContract } from "wagmi";
import { testDollarAbi } from "@/generated/contracts";
import { DEPLOYMENT, useTokenBalance } from "./bets";
import { NETWORK } from "./network";
import { useNow } from "./time";
import { confirm, refetchSoon } from "./tx";
import { useSend } from "./useSend";
import { useT } from "@/i18n/client";

const COOLDOWN = 86_400; // TestDollar.FAUCET_COOLDOWN
const MIN_GAS = 10_000_000_000_000n; // 0.00001 ETH, same "empty" line as app/api/gas

/**
 * Everything a newcomer needs before the first bet, in one click: test ETH for fees from our
 * server (app/api/gas) and then the daily 100 tUSD from the TestDollar faucet.
 */
export function useStarterKit(address?: Address) {
  const { t } = useT();
  const w = t.app.wallet;
  const now = useNow();
  const send = useSend(t);
  const [gasBusy, setGasBusy] = useState(false);
  const [gasError, setGasError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const token = DEPLOYMENT?.token;

  const tokenBalance = useTokenBalance(address);
  const claimed = useReadContract({
    address: token,
    abi: testDollarAbi,
    functionName: "lastClaim",
    args: [address!],
    query: { enabled: Boolean(address && token) },
  });
  const eth = useBalance({ address, query: { enabled: Boolean(address) } });

  const balance = tokenBalance.data ?? 0n;
  const lastClaim = Number(claimed.data ?? 0n);
  const nextClaim = lastClaim ? lastClaim + COOLDOWN : 0;
  const canClaim = Boolean(address) && now > 0 && now >= nextClaim;
  const needsGas = NETWORK !== "local" && eth.data !== undefined && eth.data.value < MIN_GAS;

  const refetchAll = () =>
    refetchSoon(() => {
      tokenBalance.refetch();
      claimed.refetch();
      eth.refetch();
    });

  async function getGas() {
    setGasBusy(true);
    setGasError(null);
    try {
      const res = await fetch("/api/gas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = (await res.json()) as { hash?: Hash; error?: string };
      if (data.error === "has-gas") return true; // the server sees enough already
      if (!data.hash) {
        setGasError(data.error === "cooldown" ? w.gasCooldown : w.gasOff);
        return false;
      }
      await confirm(data.hash);
      await eth.refetch();
      return true;
    } catch {
      setGasError(w.gasOff);
      return false;
    } finally {
      setGasBusy(false);
    }
  }

  /** Test ETH if missing, then the daily tUSD if available. */
  async function start() {
    if (!address || !token) return;
    setDone(false);
    // Decide on a fresh balance: a stale or missing value must not skip the test ETH and leave the
    // wallet unable to pay for the faucet transaction.
    if (NETWORK !== "local") {
      const fresh = (await eth.refetch()).data?.value;
      if ((fresh === undefined || fresh < MIN_GAS) && !(await getGas())) return refetchAll();
    }
    if (canClaim) {
      const ok = await send.run(async (step) => {
        await step(w.faucetBusy, (write) => write({ address: token, abi: testDollarAbi, functionName: "faucet" }));
      });
      if (!ok) return refetchAll();
    }
    setDone(true);
    refetchAll();
  }

  return {
    balance,
    needsGas,
    canClaim,
    nextClaim,
    start,
    done,
    busy: gasBusy ? w.gasBusy : send.busy,
    error: gasError ?? send.error,
    gasFailed: Boolean(gasError),
    hash: send.hash,
  };
}
