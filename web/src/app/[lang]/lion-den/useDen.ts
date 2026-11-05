"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useConnection, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";
import { LOGIN_STATEMENT, type DenState } from "@/lib/den/shared";
import { activeChain } from "@/lib/network";
import { ensureChain } from "@/lib/wagmi";

export type Account = {
  address: string | null;
  balance: number;
  stats: { wagered: number; won: number; rounds: number; wins: number; best: number };
  history: { round: number; stake: number; cashout: number | null; crash: number; profit: number }[];
};

export async function denApi<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/den/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({ error: "server" }))) as T & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? "server");
  return data;
}

// Animation clock: ticks about 20 times per second while the page is visible.
function subscribeFrame(cb: () => void) {
  const id = setInterval(cb, 50);
  return () => clearInterval(id);
}
const frameNow = () => Math.floor(Date.now() / 50) * 50;
export const useFrameClock = () => useSyncExternalStore(subscribeFrame, frameNow, () => 0);

/** The game account shared by Löwensprung and the Orakel: login by signature, balance, stats. */
export function useDenAccount() {
  const { address, status } = useConnection();
  const { signMessageAsync } = useSignMessage();
  const [me, setMe] = useState<Account | null>(null);
  const [signing, setSigning] = useState(false);
  const [autoError, setAutoError] = useState<unknown>(null);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await denApi<Account>("me"));
    } catch {
      setMe(null);
    }
  }, []);

  // Re-read the account when the wallet changes (log in / switch / log out).
  useEffect(() => {
    const id = setTimeout(() => void refreshMe(), 0);
    return () => clearTimeout(id);
  }, [address, refreshMe]);

  const loggedIn = Boolean(me?.address && address && me.address.toLowerCase() === address.toLowerCase());

  async function login() {
    if (!address) return;
    setSigning(true);
    setAutoError(null);
    try {
      await signIn(address);
    } finally {
      setSigning(false);
    }
  }

  async function signIn(address: `0x${string}`) {
    // Phantom refuses to sign while the site sits on a chain it cannot use (e.g. Base mainnet in testnet mode).
    await ensureChain();
    const { nonce } = await denApi<{ nonce: string }>("nonce");
    const message = createSiweMessage({
      domain: window.location.host,
      uri: window.location.origin,
      address,
      statement: LOGIN_STATEMENT,
      version: "1",
      chainId: activeChain.id,
      nonce,
      issuedAt: new Date(),
    });
    const signature = await signMessageAsync({ message });
    await denApi("login", { message, signature });
    await refreshMe();
  }

  // Connecting and signing in is one step for the player: right after they connect a wallet here
  // (not when the page reconnects on load), ask for the signature unless a session already exists.
  const lastStatus = useRef(status);
  useEffect(() => {
    const was = lastStatus.current;
    lastStatus.current = status;
    if (was !== "connecting" || status !== "connected" || !address) return;
    let stop = false;
    void (async () => {
      const current = await denApi<Account>("me").catch(() => null);
      if (stop) return;
      if (current?.address?.toLowerCase() === address.toLowerCase()) {
        setMe(current);
        return;
      }
      try {
        await login();
      } catch (e) {
        setAutoError(e);
      }
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the connect transition only
  }, [status, address]);

  return { address, me, setMe, loggedIn, login, refreshMe, signing, autoError };
}

/** Live round state (polled), the player's game account and the actions on it. */
export function useDen() {
  const account = useDenAccount();
  const { me, loggedIn, login, refreshMe } = account;
  const [game, setGame] = useState<DenState | null>(null);
  const [offset, setOffset] = useState(0); // server clock minus local clock
  const lastRound = useRef(0);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const sent = Date.now();
        const s = await denApi<DenState>("state");
        const received = Date.now();
        setOffset(s.serverNow - (sent + received) / 2);
        setGame(s);
        // A new round started: the previous one is settled, so balances and history changed.
        if (s.round !== lastRound.current) {
          lastRound.current = s.round;
          void refreshMe();
        }
        timer = setTimeout(poll, s.phase === "flying" ? 400 : 1000);
      } catch {
        timer = setTimeout(poll, 2000);
      }
      if (stop) clearTimeout(timer);
    };
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [refreshMe]);

  const act = async <T,>(path: string, body: unknown) => {
    const res = await denApi<T>(path, body);
    void refreshMe();
    return res;
  };

  return {
    account,
    game,
    offset,
    me,
    loggedIn,
    login,
    refreshMe,
    bet: (stake: number, auto: number | null) => act<{ round: number }>("bet", { stake, auto }),
    cashOut: () => act<{ at: number; payout: number }>("cashout", {}),
    deposit: (hash: string) => act<{ balance: number }>("deposit", { hash }),
    withdraw: (amount: number) => act<{ hash: string }>("withdraw", { amount }),
    logout: () => act("logout", {}),
  };
}
