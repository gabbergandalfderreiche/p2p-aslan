"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useConnection, useSignMessage } from "wagmi";
import { loginMessage, type DenState } from "@/lib/den/shared";

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
  const { address } = useConnection();
  const { signMessageAsync } = useSignMessage();
  const [me, setMe] = useState<Account | null>(null);

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
    const { nonce } = await denApi<{ nonce: string }>("nonce");
    const signature = await signMessageAsync({ message: loginMessage(address, nonce) });
    await denApi("login", { address, signature, nonce });
    await refreshMe();
  }

  return { address, me, setMe, loggedIn, login, refreshMe };
}

/** Live round state (polled), the player's game account and the actions on it. */
export function useDen() {
  const { me, loggedIn, login, refreshMe } = useDenAccount();
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
