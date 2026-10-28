import type { Hash } from "viem";
import { waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "./wagmi";

/** Waits until the transaction is mined and throws if it reverted (a receipt alone is not success). */
export async function confirm(hash: Hash) {
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
  if (receipt.status !== "success") throw new Error("reverted");
  return hash;
}

/**
 * Refetch now and twice more shortly after: public RPC nodes can lag a few seconds behind the
 * block that confirmed the transaction, which made fresh changes look missing until a reload.
 */
export function refetchSoon(refetch: () => void) {
  refetch();
  setTimeout(refetch, 3_000);
  setTimeout(refetch, 8_000);
}
