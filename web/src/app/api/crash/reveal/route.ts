import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { crashGameAbi, deployments } from "@/generated/contracts";

/**
 * Reveals a crash round right after the bet, so players only sign once. Anyone may reveal on the
 * contract; this just pays the gas from our drip wallet (DRIP_PRIVATE_KEY, see app/api/gas).
 */
const PENDING = 1; // CrashGame.State.Pending

export async function POST(request: Request) {
  const key = process.env.DRIP_PRIVATE_KEY;
  const crash = deployments[baseSepolia.id]?.crash;
  if (!key || !crash) return Response.json({ error: "disabled" }, { status: 503 });

  let id: bigint;
  try {
    const body = (await request.json()) as { id?: string };
    id = BigInt(body.id ?? "");
  } catch {
    return Response.json({ error: "bad-id" }, { status: 400 });
  }

  const transport = http(process.env.DRIP_RPC_URL || "https://sepolia.base.org", { retryCount: 3 });
  const client = createPublicClient({ chain: baseSepolia, transport });
  const game = { address: crash, abi: crashGameAbi } as const;

  const round = await client.readContract({ ...game, functionName: "getRound", args: [id] });
  if (round.state !== PENDING) return Response.json({ error: "not-pending" }, { status: 409 });

  // The crash point comes from the block after the bet; wait until that block is finished.
  for (let i = 0; i < 10 && (await client.getBlockNumber()) <= round.betBlock + 1n; i++) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  try {
    const wallet = createWalletClient({ account: privateKeyToAccount(key as `0x${string}`), chain: baseSepolia, transport });
    const hash = await wallet.writeContract({ ...game, functionName: "reveal", args: [id] });
    return Response.json({ hash });
  } catch (e) {
    console.error("crash reveal failed", e);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
