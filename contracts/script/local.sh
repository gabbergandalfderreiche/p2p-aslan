#!/usr/bin/env bash
# Local test setup: deploys everything onto a running anvil node and funds two test wallets.
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

echo "==> Deploying (deployer is timelock admin locally, 60s timelock)"
ADMIN=$DEPLOYER TIMELOCK_DELAY=60 \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key $DEPLOYER_PK

TOKEN=$(sed -n 's/.*"token": *"\(0x[0-9a-fA-F]*\)".*/\1/p' deployments/31337.json)
echo "==> Test dollars from the faucet for both test wallets"
for pk in $USER_A_PK $USER_B_PK; do
  cast send --rpc-url "$RPC" --private-key "$pk" "$TOKEN" "faucet()" >/dev/null
done

echo "Done. Token: $TOKEN"
