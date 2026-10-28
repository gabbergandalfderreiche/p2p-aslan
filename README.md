# P2P Bet (working title)

Bets between friends on Base, without a bookmaker. Two people bet against each other on a football
match; a smart contract holds both stakes and pays the winner once the result is confirmed through
UMA's Optimistic Oracle. Custom claims ("it rains tomorrow") work too, decided by the two sides.

**Testnet beta only:** bets use `tUSD`, a free test token with no value, on Base Sepolia. Real-money
betting offered to the public needs a licence in Switzerland (Geldspielgesetz) and similar rules
apply in the EU, so the deploy script refuses to run on mainnet.

## Layout

| Folder | What |
|---|---|
| `contracts/` | Foundry project: `MatchBets.sol` (football bets via UMA), `BetEscrow.sol` (custom bets), `TestDollar.sol` (play money with a daily faucet), deploy script, tests |
| `keeper/` | Result bot: lists matches from football-data.org, reports results to UMA, pays out bets (GitHub Action every 15 min) |
| `web/` | Next.js 16 app (de/en), wagmi + viem, Base Account / browser wallet / WalletConnect |
| `brand-inbox/` | Handoffs from the marketing chat (not committed) |

## Football bets (`MatchBets`)

- The curator (the result bot) lists matches from football-data.org. It cannot decide them.
- Creator picks home / draw / away, the taker another outcome or "anything else"; each side sets its stake. Joining closes at kickoff.
- After kickoff + 2 h the bot asserts the result after regular time to UMA with a bond. Undisputed for 2 h → it stands; disputes go to UMA's vote, a rejected assertion can be redone.
- Then anyone (normally the bot) settles: winner takes the pot. Neither pick happened, match void, or no confirmed result within 14 days → refunds.

## Custom bets (`BetEscrow`)

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
