import { Attribution } from "ox/erc8021";
import { useWriteContract } from "wagmi";

/**
 * Base Builder Code (from dashboard.base.org → Settings → Project Settings). Base uses it to
 * attribute our transactions to Hamstr, which is a requirement for its builder grants.
 * Without the env var transactions are sent exactly as before.
 */
const BUILDER_CODE = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE;

/** ERC-8021 suffix appended to the calldata; the contracts ignore trailing bytes. */
export const DATA_SUFFIX = BUILDER_CODE ? Attribution.toDataSuffix({ codes: [BUILDER_CODE] }) : undefined;

/** useWriteContract that tags every transaction with the Builder Code. */
export function useAttributedWrite() {
  const write = useWriteContract();
  const mutateAsync = ((args: Parameters<typeof write.mutateAsync>[0]) =>
    write.mutateAsync({ ...args, dataSuffix: DATA_SUFFIX })) as typeof write.mutateAsync;
  return { ...write, mutateAsync };
}
