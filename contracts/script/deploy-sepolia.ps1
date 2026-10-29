# Testnet beta deployment to Base Sepolia (play money only, no real funds).
#
#   powershell -ExecutionPolicy Bypass -File contracts\script\deploy-sepolia.ps1
#
# Needs: a Foundry keystore (cast wallet import p2pbet-deployer --interactive) holding a little
# Base Sepolia ETH from a faucet, $env:ADMIN = your wallet address (controls the timelock) and
# $env:CURATOR = the result bot's address (keeper/, also needs a little Base Sepolia ETH).
# Optional: set $env:ETHERSCAN_API_KEY first to verify the contracts on Basescan.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$forge = Join-Path $env:USERPROFILE ".foundry\bin\forge.exe"
$account = if ($env:KEYSTORE) { $env:KEYSTORE } else { "p2pbet-deployer" }
if (-not $env:ADMIN) { Write-Host "Set `$env:ADMIN to your wallet address first." -ForegroundColor Red; exit 1 }
if (-not $env:CURATOR) { Write-Host "Set `$env:CURATOR to the result bot's wallet address first." -ForegroundColor Red; exit 1 }
if (-not $env:DEPLOYER) { Write-Host "Set `$env:DEPLOYER to the keystore's address first." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "P2P Bet deployment to Base Sepolia (testnet)" -ForegroundColor Yellow
Write-Host "  Deployer        : $env:DEPLOYER (keystore $account)"
Write-Host "  Timelock admin  : $env:ADMIN"
Write-Host "  Result bot      : $env:CURATOR (lists matches, reports results to UMA)"
Write-Host "  Token           : new TestDollar (tUSD, play money; only the crash game may mint)"
Write-Host "  Crash game      : CrashGame (Loewensprung, play money, 1 % house edge)"
Write-Host "  Oracle          : UMA Optimistic Oracle V3, 2h liveness, 100 test-token bond"
Write-Host "  Timelock delay  : 2 days, fee 0 %"
Write-Host ""
$answer = Read-Host "Type DEPLOY to send the transactions"
if ($answer -ne "DEPLOY") { Write-Host "Cancelled."; exit 1 }

$forgeArgs = @(
  "script", "script/Deploy.s.sol",
  "--rpc-url", "https://sepolia.base.org",
  "--broadcast",
  "--account", $account,
  "--sender", $env:DEPLOYER
)
if ($env:ETHERSCAN_API_KEY) { $forgeArgs += @("--verify", "--etherscan-api-key", $env:ETHERSCAN_API_KEY) }

& $forge @forgeArgs
if ($LASTEXITCODE -ne 0) { Write-Host "Deployment failed." -ForegroundColor Red; exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Addresses written to contracts/deployments/84532.json - tell Claude it's deployed." -ForegroundColor Green
