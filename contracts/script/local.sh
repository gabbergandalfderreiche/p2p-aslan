#!/usr/bin/env bash
# Local test setup: deploys everything onto a running anvil node, funds two test wallets and lists
# two demo matches.
#
#   1. anvil
#   2. bash script/local.sh
#   3. (in web/) npm run sync-contracts && NEXT_PUBLIC_NETWORK=local npm run dev
#
# Uses anvil's public test keys. NEVER send real funds to these addresses on any real network.
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=${RPC:-http://127.0.0.1:8545}
DEPLOYER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # anvil #0
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
USER_A_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d # anvil #1, the frontend's test wallet
USER_B_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a # anvil #2
BOT=0x90F79bf6EB2c4f870365E785982E1f101E93b906 # anvil #3: curator / result bot
BOT_PK=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

echo "==> Deploying (deployer is timelock admin, 60s timelock, mock UMA oracle with 60s liveness)"
ADMIN=$DEPLOYER CURATOR=$BOT TIMELOCK_DELAY=60 \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key $DEPLOYER_PK

field() { sed -n "s/.*\"$1\": *\"\(0x[0-9a-fA-F]*\)\".*/\1/p" deployments/31337.json; }
TOKEN=$(field token)
MATCH_BETS=$(field matchBets)

echo "==> Test dollars from the faucet for both test wallets"
for pk in $USER_A_PK $USER_B_PK; do
  cast send --rpc-url "$RPC" --private-key "$pk" "$TOKEN" "faucet()" >/dev/null
done

NOW=$(cast block --rpc-url "$RPC" latest --field timestamp)
echo "==> Two demo matches (kickoff in 10 minutes and in 2 days)"
cast send --rpc-url "$RPC" --private-key $BOT_PK "$MATCH_BETS" "addMatch(uint64,uint40,string,string,string)" \
  900001 $((NOW + 600)) "FC Zürich" "FC Basel" "Demo" >/dev/null
cast send --rpc-url "$RPC" --private-key $BOT_PK "$MATCH_BETS" "addMatch(uint64,uint40,string,string,string)" \
  900002 $((NOW + 172800)) "Young Boys" "Servette" "Demo" >/dev/null

echo "Done. Token: $TOKEN  MatchBets: $MATCH_BETS"
echo "Decide demo match 900001 (jump past kickoff + 2h first: cast rpc evm_increaseTime 8000; cast rpc evm_mine):"
echo "  RPC_URL=$RPC KEEPER_PRIVATE_KEY=$BOT_PK DEPLOYMENT=contracts/deployments/31337.json RESULT_OVERRIDE=900001:HOME node keeper/src/results.mjs"
