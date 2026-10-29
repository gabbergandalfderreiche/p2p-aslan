import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAddress, isAddress, type Address } from "viem";
import { persistent } from "./store";

export { loginMessage } from "./shared";

const COOKIE = "den_session";
const DAYS = 7;

/** Signing secret; in production it must be set (DEN_SECRET), locally a fixed dev value is fine. */
function secret() {
  const s = process.env.DEN_SECRET;
  if (s) return s;
  if (persistent || process.env.VERCEL) throw new Error("DEN_SECRET is not set");
  return "local-dev-secret";
}

const mac = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export const newNonce = () => randomBytes(12).toString("hex");

export async function startSession(address: Address) {
  const exp = Date.now() + DAYS * 86_400_000;
  const body = `${address}.${exp}`;
  (await cookies()).set(COOKIE, `${body}.${mac(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DAYS * 86_400,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The logged-in wallet, or null. */
export async function sessionAddress(): Promise<Address | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [address, exp, sig] = raw.split(".");
  if (!address || !exp || !sig || !isAddress(address) || Number(exp) < Date.now()) return null;
  const expected = Buffer.from(mac(`${address}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return getAddress(address);
}
