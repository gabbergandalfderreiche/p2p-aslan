import { defineChain } from "viem";
import { baseSepolia } from "wagmi/chains";

/**
 * "local" = local anvil node (contracts/script/local.sh), anything else = Base Sepolia testnet.
 * There is deliberately no mainnet option: real-money bets need a legal review first.
 */
export const NETWORK = process.env.NEXT_PUBLIC_NETWORK === "local" ? "local" : "sepolia";

export const localChain = defineChain({
  id: 31337,
  name: "Lokales Testnetz",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8545"] } },
  testnet: true,
});

export const activeChain = NETWORK === "local" ? localChain : baseSepolia;

/** anvil account #1, funded by contracts/script/local.sh. Local only. */
export const LOCAL_TEST_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

const EXPLORER = NETWORK === "local" ? null : "https://sepolia.basescan.org";

export const txUrl = (hash: string) => (EXPLORER ? `${EXPLORER}/tx/${hash}` : null);
export const addressUrl = (address: string) => (EXPLORER ? `${EXPLORER}/address/${address}` : null);

/** Free Base Sepolia test ETH for gas (Coinbase Developer Platform faucet). */
export const ETH_FAUCET = "https://portal.cdp.coinbase.com/products/faucet";
