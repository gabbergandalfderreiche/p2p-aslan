// Result bot for MatchBets: lists upcoming matches, reports final results to UMA, settles bets.
//
// Each run:
//   1. list   – upcoming matches of the chosen competitions (football-data.org) that are not onchain yet
//   2. report – for listed matches past kickoff + 2h without a result: fetch the final score and
//               assert it to UMA (with the bond); cancelled/postponed matches are reported as VOID
//   3. settle – close assertions whose liveness is over, then pay out every bet that can be settled
//
// Nothing here can decide a result on its own: every report is an UMA assertion that anyone can
// dispute during the liveness period, and a wrong one costs the bot its bond.
//
// Environment:
//   RPC_URL              required
//   KEEPER_PRIVATE_KEY   required unless DRY_RUN=1 (must be the MatchBets curator to list matches)
//   DEPLOYMENT           path to deployments/<chainId>.json (default: contracts/deployments/84532.json)
//   FOOTBALL_DATA_TOKEN  API key from football-data.org (free plan works); without it steps 1–2 are skipped
//   COMPETITIONS         football-data.org codes (default: BL1,PL,PD,SA,FL1,CL)
//   DAYS_AHEAD           how far ahead to list matches (default 7, max 10)
//   RESULT_OVERRIDE      local testing only: "matchId:HOME|DRAW|AWAY|VOID,..." instead of the API
//   DRY_RUN=1            check and log only, never send
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, formatUnits, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const matchBetsAbi = parseAbi([
  "function curator() view returns (address)",
  "function bondCurrency() view returns (address)",
  "function bond() view returns (uint256)",
  "function liveness() view returns (uint64)",
  "function RESULT_DELAY() view returns (uint256)",
  "function RESULT_TIMEOUT() view returns (uint256)",
  "function matchCount() view returns (uint256)",
  "function matchIds(uint256 start, uint256 count) view returns (uint64[])",
  "function getMatch(uint64 matchId) view returns ((uint40 kickoff, uint8 result, uint8 asserted, uint40 assertedAt, bytes32 assertionId, string home, string away, string competition))",
  "function addMatch(uint64 matchId, uint40 kickoff, string home, string away, string competition)",
  "function assertResult(uint64 matchId, uint8 result) returns (bytes32)",
  "function settleResult(uint64 matchId)",
  "function betCount() view returns (uint256)",
  "function getBet(uint256 id) view returns ((address creator, uint96 creatorStake, address taker, uint96 takerStake, uint64 matchId, uint8 creatorPick, uint8 takerPick, uint8 status, uint8 payout, uint16 feeBps))",
  "function payoutOf(uint256 id) view returns (uint8)",
  "function settle(uint256 id)",
]);

const bondAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allocateTo(address to, uint256 amount)", // UMA TestnetERC20 / local mock: free test tokens
]);

const Result = { HOME: 1, DRAW: 2, AWAY: 3, VOID: 4 };
const ACTIVE = 2; // MatchBets.Status.Active
const LIST_MARGIN = 30 * 60; // do not list matches kicking off within 30 minutes
const SUSPENDED_GRACE = 24 * 3600; // a suspended match may resume the same day

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = process.env;
const DRY_RUN = env.DRY_RUN === "1";

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function loadDeployment() {
  const path = resolve(root, env.DEPLOYMENT ?? "contracts/deployments/84532.json");
  if (!existsSync(path)) {
    log(`No deployment at ${path} yet – nothing to do.`);
    process.exit(0);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

// ---------------------------------------------------------------- football-data.org

const API = "https://api.football-data.org/v4";

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { "X-Auth-Token": env.FOOTBALL_DATA_TOKEN } });
  if (!res.ok) throw new Error(`football-data.org ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const isoDay = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);

/** Result after regular time; extra time and penalties do not count (see the claim in MatchBets). */
function resultOf(m, now) {
  if (m.status === "FINISHED") {
    const score = m.score?.regularTime ?? m.score?.fullTime;
    if (score?.home == null || score?.away == null) return null;
    return score.home > score.away ? Result.HOME : score.home < score.away ? Result.AWAY : Result.DRAW;
  }
  if (m.status === "CANCELLED" || m.status === "POSTPONED") return Result.VOID;
  if (m.status === "SUSPENDED" && now > Date.parse(m.utcDate) / 1000 + SUSPENDED_GRACE) return Result.VOID;
  return null; // still running, awarded (needs a human) or unknown
}

function overrides() {
  const map = new Map();
  for (const part of (env.RESULT_OVERRIDE ?? "").split(",").filter(Boolean)) {
    const [id, label] = part.split(":");
    if (!Result[label]) throw new Error(`RESULT_OVERRIDE: unknown result ${label}`);
    map.set(BigInt(id), Result[label]);
  }
  return map;
}

// ---------------------------------------------------------------- main

async function main() {
  const d = loadDeployment();
  if (!d.matchBets) {
    log("Deployment has no MatchBets contract – nothing to do.");
    return;
  }
  const chain =
    d.chainId === baseSepolia.id
      ? baseSepolia
      : defineChain({
          id: d.chainId,
          name: "local",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [env.RPC_URL] } },
        });
  const client = createPublicClient({ chain, transport: http(env.RPC_URL) });
  const account = env.KEEPER_PRIVATE_KEY ? privateKeyToAccount(env.KEEPER_PRIVATE_KEY) : null;
  if (!account && !DRY_RUN) throw new Error("KEEPER_PRIVATE_KEY missing (or set DRY_RUN=1)");
  const wallet = account ? createWalletClient({ account, chain, transport: http(env.RPC_URL) }) : null;
  const mb = { address: d.matchBets, abi: matchBetsAbi };

  async function send(label, request) {
    if (DRY_RUN) return log(`[dry run] would ${label}`);
    const { request: req } = await client.simulateContract({ ...request, account });
    const hash = await wallet.writeContract(req);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted (${hash})`);
    log(`${label} ✓ ${hash}`);
  }

  const block = await client.getBlock();
  const now = Number(block.timestamp);
  const [curator, resultDelay, resultTimeout, liveness, count] = await Promise.all([
    client.readContract({ ...mb, functionName: "curator" }),
    client.readContract({ ...mb, functionName: "RESULT_DELAY" }),
    client.readContract({ ...mb, functionName: "RESULT_TIMEOUT" }),
    client.readContract({ ...mb, functionName: "liveness" }),
    client.readContract({ ...mb, functionName: "matchCount" }),
  ]);
  const ids = count > 0n ? await client.readContract({ ...mb, functionName: "matchIds", args: [0n, count] }) : [];
  const matches = new Map(
    await Promise.all(ids.map(async (id) => [id, await client.readContract({ ...mb, functionName: "getMatch", args: [id] })])),
  );
  log(`MatchBets ${d.matchBets} on chain ${d.chainId}: ${ids.length} matches listed`);
  const haveApi = Boolean(env.FOOTBALL_DATA_TOKEN);

  // 1. list upcoming matches
  if (haveApi && account && account.address.toLowerCase() !== curator.toLowerCase()) {
    log(`Skipping listing: bot ${account.address} is not the curator ${curator}`);
  } else if (haveApi) {
    const days = Math.min(Number(env.DAYS_AHEAD ?? 7), 10);
    const comps = env.COMPETITIONS ?? "BL1,PL,PD,SA,FL1,CL";
    const { matches: upcoming } = await api(
      `/matches?competitions=${comps}&dateFrom=${isoDay(now)}&dateTo=${isoDay(now + days * 86400)}`,
    );
    for (const m of upcoming) {
      const kickoff = Math.floor(Date.parse(m.utcDate) / 1000);
      if (matches.has(BigInt(m.id)) || kickoff < now + LIST_MARGIN) continue;
      if (m.status !== "SCHEDULED" && m.status !== "TIMED") continue;
      const home = m.homeTeam?.shortName || m.homeTeam?.name;
      const away = m.awayTeam?.shortName || m.awayTeam?.name;
      if (!home || !away) continue; // teams not known yet (e.g. cup draws)
      await send(`list ${m.id} ${home} – ${away}`, {
        ...mb,
        functionName: "addMatch",
        args: [BigInt(m.id), kickoff, home, away, m.competition?.name ?? ""],
      });
    }
  }

  // 2. report results
  const manual = overrides();
  const due = ids.filter((id) => {
    const m = matches.get(id);
    return (
      m.result === 0 &&
      m.assertionId === `0x${"0".repeat(64)}` &&
      now >= m.kickoff + Number(resultDelay) &&
      now <= m.kickoff + Number(resultTimeout)
    );
  });
  const results = new Map();
  for (const id of due) if (manual.has(id)) results.set(id, manual.get(id));
  const fromApi = due.filter((id) => !results.has(id));
  if (fromApi.length && haveApi) {
    // The API accepts many ids per call, which keeps us far below the free plan's 10 calls/minute.
    for (let i = 0; i < fromApi.length; i += 50) {
      const { matches: found } = await api(`/matches?ids=${fromApi.slice(i, i + 50).join(",")}`);
      for (const m of found) {
        const r = resultOf(m, now);
        if (r) results.set(BigInt(m.id), r);
        else log(`match ${m.id}: status ${m.status}, no result yet`);
      }
    }
  } else if (fromApi.length) {
    log(`${fromApi.length} matches wait for a result, but FOOTBALL_DATA_TOKEN is not set`);
  }

  if (results.size && account) {
    const bondCurrency = await client.readContract({ ...mb, functionName: "bondCurrency" });
    const bond = await client.readContract({ ...mb, functionName: "bond" });
    const token = { address: bondCurrency, abi: bondAbi };
    const needed = bond * BigInt(results.size);
    const balance = await client.readContract({ ...token, functionName: "balanceOf", args: [account.address] });
    // Testnets only: the bond currency is a free test token. On mainnet the bot must be funded.
    if (balance < needed) {
      await send(`mint ${formatUnits(needed - balance, 18)} test bond tokens`, {
        ...token,
        functionName: "allocateTo",
        args: [account.address, needed - balance],
      });
    }
    const allowance = await client.readContract({ ...token, functionName: "allowance", args: [account.address, d.matchBets] });
    if (allowance < needed) {
      await send("approve bond", { ...token, functionName: "approve", args: [d.matchBets, needed] });
    }
  }
  const label = Object.fromEntries(Object.entries(Result).map(([k, v]) => [v, k]));
  for (const [id, r] of results) {
    const m = matches.get(id);
    await send(`report ${id} ${m.home} – ${m.away}: ${label[r]}`, { ...mb, functionName: "assertResult", args: [id, r] });
  }

  // 3. settle assertions and bets
  for (const id of ids) {
    const m = matches.get(id);
    if (m.assertionId === `0x${"0".repeat(64)}` || now < m.assertedAt + Number(liveness)) continue;
    await send(`confirm result of ${id}`, { ...mb, functionName: "settleResult", args: [id] });
  }
  const betCount = await client.readContract({ ...mb, functionName: "betCount" });
  for (let id = 1n; id <= betCount; id++) {
    const bet = await client.readContract({ ...mb, functionName: "getBet", args: [id] });
    if (bet.status !== ACTIVE) continue;
    const payout = await client.readContract({ ...mb, functionName: "payoutOf", args: [id] });
    if (payout !== 0) await send(`pay out bet ${id}`, { ...mb, functionName: "settle", args: [id] });
  }
  log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
