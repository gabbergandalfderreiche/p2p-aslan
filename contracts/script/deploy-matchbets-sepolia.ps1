# Replaces only the football contract (MatchBets) on Base Sepolia; token, timelock and custom bets stay.
#
#   powershell -ExecutionPolicy Bypass -File contracts\script\deploy-matchbets-sepolia.ps1
#
# Uses the bot keystore "p2pbet-bot" (asks for its password); the bot stays curator.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$forge = Join-Path $env:USERPROFILE ".foundry\bin\forge.exe"
$bot = "0xB5BC58F51718aED5C6348fAEF2E9ea9571D3021D"
$env:CURATOR = $bot

Write-Host ""
Write-Host "Replace MatchBets on Base Sepolia (testnet)" -ForegroundColor Yellow
Write-Host "  Deployer + curator : $bot (keystore p2pbet-bot)"
Write-Host "  New rule           : quote per bet; opponent picks one of the two free outcomes"
Write-Host ""
$answer = Read-Host "Type DEPLOY to send the transaction"
if ($answer -ne "DEPLOY") { Write-Host "Cancelled."; exit 1 }

& $forge script script/DeployMatchBets.s.sol --rpc-url https://sepolia.base.org --broadcast --account p2pbet-bot --sender $bot
if ($LASTEXITCODE -ne 0) { Write-Host "Deployment failed." -ForegroundColor Red; exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. contracts/deployments/84532.json updated - tell Claude it's deployed." -ForegroundColor Green
