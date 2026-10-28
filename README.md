# P2P Bet (working title)

Bets between friends on Base, without a bookmaker. One person makes a claim and stakes on it, a
friend stakes the same amount against it, and a smart contract holds both stakes until the two
agree on the result. If they disagree, an arbiter they picked decides, or both get their money back.

**Testnet beta only:** bets use `tUSD`, a free test token with no value, on Base Sepolia. Real-money
betting offered to the public needs a licence in Switzerland (Geldspielgesetz) and similar rules
apply in the EU, so the deploy script refuses to run on mainnet.

## Layout

| Folder | What |
|---|---|
| `contracts/` | Foundry project: `BetEscrow.sol` (the escrow), `TestDollar.sol` (play money with a daily faucet), deploy script, tests |
| `web/` | Next.js 16 app (de/en), wagmi + viem, Base Account / browser wallet / WalletConnect |
| `brand-inbox/` | Handoffs from the marketing chat (not committed) |

## Rules of a bet (`BetEscrow`)

- Both sides report the same result → settled. Reporting that the other side won settles at once.
- Conflicting reports → the arbiter decides within 7 days; without an arbiter, or if it stays silent, both are refunded.
- After the deadline, a single report counts; no report refunds both. Nobody joined → creator refunded.
- Fee 0 %, capped at 2 %, changed only through the 2-day timelock and never for running bets. The owner cannot move stakes.

## Develop

```bash
cd contracts && forge test
```

Local end-to-end (needs anvil):

```bash
anvil
bash contracts/script/local.sh
cd web && npm run sync-contracts && NEXT_PUBLIC_NETWORK=local npm run dev
```

Testnet deployment: `contracts/script/deploy-sepolia.ps1` (Foundry keystore, `$env:ADMIN`, `$env:DEPLOYER`),
then `npm run sync-contracts` in `web/`.
