"use client";

import { useState } from "react";
import { erc20Abi, type Address, type Hash } from "viem";
import { readContract } from "wagmi/actions";
import { useAttributedWrite } from "./attribution";
import { DEPLOYMENT } from "./bets";
import { confirm } from "./tx";
import { wagmiConfig } from "./wagmi";
import type { Dictionary } from "@/i18n";

type Write = ReturnType<typeof useAttributedWrite>["mutateAsync"];

/** Plain-language message for a failed wallet action. */
export function errorText(e: unknown, t: Dictionary) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/rejected|denied|cancel/i.test(msg)) return t.app.cancelled;
  if (/insufficient funds|exceeds the balance|gas required exceeds/i.test(msg)) return t.app.noGas;
  return t.app.failed;
}

/**
 * Runs one user action (one or more transactions) with a busy label per step, error text and the
 * last transaction hash. `step` signs, waits for the block and throws if it reverted.
 */
export function useSend(t: Dictionary) {
  const write = useAttributedWrite();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<Hash | null>(null);

  async function run(
    action: (step: (label: string, tx: (w: Write) => Promise<Hash>) => Promise<Hash>) => Promise<void>,
  ) {
    setError(null);
    setHash(null);
    try {
      await action(async (label, tx) => {
        setBusy(label);
        const h = await confirm(await tx(write.mutateAsync));
        setHash(h);
        return h;
      });
      return true;
    } catch (e) {
      setError(errorText(e, t));
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { run, busy, error, hash };
}

/** Approves `spender` (one of our contracts) for `amount` test dollars unless the allowance already covers it. */
export async function ensureAllowance(
  step: (label: string, tx: (w: Write) => Promise<Hash>) => Promise<Hash>,
  owner: Address,
  spender: Address,
  amount: bigint,
  label: string,
) {
  if (!DEPLOYMENT) throw new Error("not deployed");
  const { token } = DEPLOYMENT;
  const allowance = await readContract(wagmiConfig, {
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) return;
  await step(label, (w) => w({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] }));
}
