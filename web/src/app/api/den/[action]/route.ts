import { getAddress, isAddress, isHex, type Address } from "viem";
import { account, cashOut, consumeNonce, deposit, DenError, houseAddress, issueNonce, placeBet, pot, publicClient, state, withdraw } from "@/lib/den/game";
import { endSession, loginMessage, newNonce, sessionAddress, startSession } from "@/lib/den/session";
import { persistent } from "@/lib/den/store";

/** Löwensprung API: /api/den/<action>. Everything that touches a balance needs the login cookie. */

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
        const { address, signature, nonce } = await body<{ address: string; signature: string; nonce: string }>(request);
        if (!address || !isAddress(address) || !signature || !isHex(signature) || !nonce) return json({ error: "bad-login" }, 400);
        if (!(await consumeNonce(nonce))) return json({ error: "nonce" }, 400);
        // Works for normal wallets and for smart wallets such as Base Account (ERC-1271 / ERC-6492).
        const ok = await publicClient.verifyMessage({ address, message: loginMessage(address, nonce), signature });
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
