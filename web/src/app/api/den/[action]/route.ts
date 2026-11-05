import { getAddress, isAddress, isHex, recoverMessageAddress, type Address } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { account, cashOut, consumeNonce, deposit, DenError, houseAddress, issueNonce, placeBet, pot, publicClient, state, withdraw } from "@/lib/den/game";
import { endSession, newNonce, sessionAddress, startSession } from "@/lib/den/session";
import { LOGIN_MAX_AGE_MS } from "@/lib/den/shared";
import { persistent } from "@/lib/den/store";
import { commit as oracleCommit, spin as oracleSpin, stats as oracleStats } from "@/lib/oracle/server";

/**
 * Löwensprung API: /api/den/<action>, also for the Orakel slot (oracle-*), which plays on the same
 * game account. Everything that touches a balance needs the login cookie.
 */

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function body<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>;
  } catch {
    return {};
  }
}

async function player(): Promise<Address> {
  const a = await sessionAddress();
  if (!a) throw new DenError("login");
  return a;
}

export async function GET(_request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  try {
    switch (action) {
      case "state":
        return json(await state());
      case "nonce": {
        const nonce = newNonce();
        await issueNonce(nonce);
        return json({ nonce });
      }
      case "me": {
        const a = await sessionAddress();
        if (!a) return json({ address: null });
        return json({ address: a, ...(await account(a)) });
      }
      case "house": {
        let house: string | null = null;
        try {
          house = houseAddress();
        } catch {
          house = null;
        }
        return json({ house, pot: house ? await pot() : 0, persistent });
      }
      case "oracle": {
        const a = await player();
        return json({ ...(await oracleCommit(a)), stats: await oracleStats(a) });
      }
      default:
        return json({ error: "unknown" }, 404);
    }
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  try {
    switch (action) {
      case "login": {
        // Sign-In with Ethereum: the signed text names this site, the wallet, our chain and a fresh nonce.
        const { message, signature } = await body<{ message: string; signature: string }>(request);
        if (!message || !signature || !isHex(signature)) return json({ error: "bad-login" }, 400);
        const siwe = parseSiweMessage(message);
        const address = siwe.address;
        const issued = siwe.issuedAt?.getTime() ?? 0;
        // Behind Vercel's proxy the site's own name arrives as x-forwarded-host; accept any name this request came in under.
        const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host"), new URL(request.url).host].filter(Boolean);
        const reason = !address || !isAddress(address) || !siwe.nonce ? "format" : !hosts.includes(siwe.domain ?? "") ? "domain" : siwe.chainId !== publicClient.chain.id ? "chain" : null;
        if (reason || !address || !siwe.nonce) return json({ error: "bad-login", reason }, 400);
        if (Math.abs(Date.now() - issued) > LOGIN_MAX_AGE_MS) return json({ error: "nonce" }, 400);
        if (!(await consumeNonce(siwe.nonce))) return json({ error: "nonce" }, 400);
        // Normal wallets (Phantom, MetaMask) are checked locally; only smart wallets such as Base Account
        // (ERC-1271 / ERC-6492) need the chain, so a slow RPC cannot block an ordinary login.
        const local = await recoverMessageAddress({ message, signature }).catch(() => null);
        const ok = (local !== null && local.toLowerCase() === address.toLowerCase()) || (await publicClient.verifyMessage({ address, message, signature }));
        if (!ok) return json({ error: "signature" }, 401);
        await startSession(getAddress(address));
        return json({ address: getAddress(address) });
      }
      case "logout":
        await endSession();
        return json({ ok: true });
      case "bet": {
        const { stake, auto } = await body<{ stake: number; auto: number | null }>(request);
        return json(await placeBet(await player(), Number(stake), auto ? Number(auto) : null));
      }
      case "cashout":
        return json(await cashOut(await player()));
      case "deposit": {
        const { hash } = await body<{ hash: string }>(request);
        if (!hash || !isHex(hash) || hash.length !== 66) return json({ error: "bad-hash" }, 400);
        return json(await deposit(await player(), hash));
      }
      case "oracle-spin": {
        const { stake } = await body<{ stake: number }>(request);
        return json(await oracleSpin(await player(), Number(stake)));
      }
      case "withdraw": {
        const { amount } = await body<{ amount: number }>(request);
        return json(await withdraw(await player(), Number(amount)));
      }
      default:
        return json({ error: "unknown" }, 404);
    }
  } catch (e) {
    return fail(e);
  }
}

function fail(e: unknown) {
  if (e instanceof DenError) return json({ error: e.message }, e.message === "login" ? 401 : 409);
  console.error("den api", e);
  return json({ error: "server" }, 500);
}
