import { createPublicClient, createWalletClient, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

/**
 * Sends a little Base Sepolia test ETH to a wallet that has none, so newcomers can pay network fees
 * without hunting for a faucet. Testnet only; the funds have no value.
 *
 * Environment (Vercel → Settings → Environment Variables):
 *   DRIP_PRIVATE_KEY  key of a wallet holding some Base Sepolia ETH; without it the route is off
 *   DRIP_RPC_URL      optional, defaults to the public https://sepolia.base.org
 */
const DRIP = parseEther("0.00005"); // roughly 10 bets at Base Sepolia fees
const EMPTY_BELOW = parseEther("0.00001");
const COOLDOWN_MS = 24 * 3600 * 1000;

// Per server instance only: enough to stop casual repeats, not a real abuse shield (testnet ETH has no value).
const recent = new Map<string, number>();

export async function POST(request: Request) {
  const key = process.env.DRIP_PRIVATE_KEY;
  if (!key) return Response.json({ error: "disabled" }, { status: 503 });

  let address: unknown;
  try {
    ({ address } = await request.json());
  } catch {
    // handled below
  }
  if (typeof address !== "string" || !isAddress(address)) {
    return Response.json({ error: "bad-address" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const keys = [address.toLowerCase(), ip];
  if (keys.some((k) => (recent.get(k) ?? 0) > now - COOLDOWN_MS)) {
    return Response.json({ error: "cooldown" }, { status: 429 });
  }

  const transport = http(process.env.DRIP_RPC_URL || "https://sepolia.base.org");
  const client = createPublicClient({ chain: baseSepolia, transport });
  if ((await client.getBalance({ address })) >= EMPTY_BELOW) {
    return Response.json({ error: "has-gas" }, { status: 409 });
  }

  keys.forEach((k) => recent.set(k, now));
  try {
    const wallet = createWalletClient({ account: privateKeyToAccount(key as `0x${string}`), chain: baseSepolia, transport });
    const hash = await wallet.sendTransaction({ to: address, value: DRIP });
    return Response.json({ hash });
  } catch (e) {
    keys.forEach((k) => recent.delete(k));
    console.error("gas drip failed", e);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
