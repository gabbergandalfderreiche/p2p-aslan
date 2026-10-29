import "server-only";
import { Redis } from "@upstash/redis";

/**
 * The few key-value operations Löwensprung needs. On Vercel this is Upstash Redis (Storage →
 * Upstash, which sets KV_REST_API_URL / KV_REST_API_TOKEN); without it an in-memory store is used,
 * which is fine for `npm run dev` but loses everything on restart.
 */
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { nx?: boolean; px?: number }): Promise<boolean>;
  del(key: string): Promise<void>;
  incrby(key: string, by: number): Promise<number>;
  hsetnx(key: string, field: string, value: unknown): Promise<boolean>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hincrby(key: string, field: string, by: number): Promise<number>;
  lpush(key: string, value: unknown, keep: number): Promise<void>;
  lrange<T>(key: string, count: number): Promise<T[]>;
}

function upstash(url: string, token: string): Store {
  const r = new Redis({ url, token });
  return {
    get: (k) => r.get(k),
    async set(k, v, o) {
      const res = await (o?.nx
        ? o.px
          ? r.set(k, v, { nx: true, px: o.px })
          : r.set(k, v, { nx: true })
        : o?.px
          ? r.set(k, v, { px: o.px })
          : r.set(k, v));
      return res === "OK";
    },
    async del(k) {
      await r.del(k);
    },
    incrby: (k, by) => r.incrby(k, by),
    async hsetnx(k, f, v) {
      return (await r.hsetnx(k, f, v)) === 1;
    },
    async hgetall<T>(k: string) {
      return ((await r.hgetall<Record<string, T>>(k)) ?? {}) as Record<string, T>;
    },
    hincrby: (k, f, by) => r.hincrby(k, f, by),
    async lpush(k, v, keep) {
      await r.lpush(k, v);
      await r.ltrim(k, 0, keep - 1);
    },
    lrange: (k, count) => r.lrange(k, 0, count - 1),
  };
}

function memory(): Store {
  const kv = new Map<string, { v: unknown; until?: number }>();
  const alive = (k: string) => {
    const e = kv.get(k);
    if (e?.until && e.until < Date.now()) kv.delete(k);
    return kv.get(k);
  };
  const hash = (k: string) => (alive(k)?.v as Record<string, unknown>) ?? {};
  const list = (k: string) => (alive(k)?.v as unknown[]) ?? [];
  return {
    async get<T>(k: string) {
      return (alive(k)?.v as T) ?? null;
    },
    async set(k, v, o) {
      if (o?.nx && alive(k)) return false;
      kv.set(k, { v, until: o?.px ? Date.now() + o.px : undefined });
      return true;
    },
    async del(k) {
      kv.delete(k);
    },
    async incrby(k, by) {
      const n = Number(alive(k)?.v ?? 0) + by;
      kv.set(k, { v: n });
      return n;
    },
    async hsetnx(k, f, v) {
      const h = hash(k);
      if (f in h) return false;
      kv.set(k, { v: { ...h, [f]: v } });
      return true;
    },
    async hgetall<T>(k: string) {
      return hash(k) as Record<string, T>;
    },
    async hincrby(k, f, by) {
      const h = hash(k);
      const n = Number(h[f] ?? 0) + by;
      kv.set(k, { v: { ...h, [f]: n } });
      return n;
    },
    async lpush(k, v, keep) {
      kv.set(k, { v: [v, ...list(k)].slice(0, keep) });
    },
    async lrange<T>(k: string, count: number) {
      return list(k).slice(0, count) as T[];
    },
  };
}

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// One in-memory store per server process; survives hot reloads in dev.
const g = globalThis as unknown as { __denStore?: Store };
export const store: Store = url && token ? upstash(url, token) : (g.__denStore ??= memory());
export const persistent = Boolean(url && token);
