import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  chartSeries,
  evaluateCandles,
  type Candle,
  type ChartPoint,
  type Evaluation,
  type IntervalId,
} from "@/lib/strategy";
import { assembleUniverse, type Asset } from "@/lib/universe";

const VISION = "https://data-api.binance.vision";
const PAPRIKA = "https://api.coinpaprika.com/v1/tickers";

const intervalSchema = z.enum(["1h", "4h", "1d"]);
const baseSchema = z.string().regex(/^[A-Z0-9]{2,20}$/);

const batchSchema = z.object({
  bases: z.array(baseSchema).min(1).max(8),
  interval: intervalSchema,
});

const chartSchema = z.object({
  base: baseSchema,
  interval: intervalSchema,
});

export type ScanHit =
  | { ok: true; base: string; interval: IntervalId; evaluation: Evaluation }
  | { ok: false; base: string; interval: IntervalId; error: string };

type CacheEntry<T> = { at: number; data: T };

const TTL: Record<IntervalId, number> = {
  "1h": 60_000,
  "4h": 180_000,
  "1d": 600_000,
};

let universeCache: CacheEntry<Asset[]> | null = null;
let listedCache: CacheEntry<Set<string>> | null = null;
let listedFlight: Promise<Set<string>> | null = null;
const candleCache = new Map<string, CacheEntry<Candle[]>>();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  let last = "ارتباط با منبع قیمت قطع شد";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });
      if (res.status === 429 || res.status === 418 || res.status >= 500) {
        last = `منبع قیمت موقتاً محدود است (${res.status})`;
        await delay(450 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`داده بازار برنگشت (${res.status})`);
      return await res.json();
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("داده بازار")) throw err;
      last = "ارتباط با منبع قیمت قطع شد";
      if (attempt === 1) break;
      await delay(300);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(last);
}

function parseCandles(payload: unknown): Candle[] {
  if (!Array.isArray(payload)) return [];
  const now = Date.now();
  const candles: Candle[] = [];
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 7) continue;
    const openTime = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const closeTime = Number(row[6]);
    if (![openTime, open, high, low, close, closeTime].every((n) => Number.isFinite(n))) continue;
    if (closeTime >= now) continue;
    if (!(high >= low) || !(close > 0)) continue;
    candles.push({ openTime, closeTime, open, high, low, close });
  }
  return candles;
}

async function listedBases(): Promise<Set<string>> {
  if (listedCache && Date.now() - listedCache.at < 10 * 60_000) return listedCache.data;
  if (!listedFlight) {
    listedFlight = (async () => {
      const payload = await fetchJson(`${VISION}/api/v3/ticker/price`);
      if (!Array.isArray(payload)) throw new Error("فهرست جفت‌ارزها خوانده نشد");
      const set = new Set<string>();
      for (const row of payload) {
        if (!row || typeof row !== "object") continue;
        const symbol = (row as { symbol?: unknown }).symbol;
        if (typeof symbol === "string" && symbol.endsWith("USDT")) set.add(symbol.slice(0, -4));
      }
      if (set.size < 50) throw new Error("فهرست جفت‌ارزها ناقص است");
      listedCache = { at: Date.now(), data: set };
      return set;
    })().finally(() => {
      listedFlight = null;
    });
  }
  return listedFlight;
}

async function loadUniverse(): Promise<Asset[]> {
  if (universeCache && Date.now() - universeCache.at < 10 * 60_000) return universeCache.data;
  const [paprika, bases] = await Promise.all([fetchJson(PAPRIKA), listedBases()]);
  const symbols = [...bases].map((base) => `${base}USDT`);
  const assets = assembleUniverse(paprika, symbols, 100);
  if (assets.length < 20) throw new Error("فهرست ارزها کامل نشد. کمی بعد دوباره اسکن کنید.");
  universeCache = { at: Date.now(), data: assets };
  return assets;
}

async function loadCandles(base: string, interval: IntervalId): Promise<Candle[]> {
  const key = `${base}:${interval}`;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.at < TTL[interval]) return cached.data;
  const listed = await listedBases();
  if (!listed.has(base)) throw new Error("جفت USDT ندارد");
  const payload = await fetchJson(
    `${VISION}/api/v3/klines?symbol=${encodeURIComponent(base)}USDT&interval=${interval}&limit=1000`,
  );
  const candles = parseCandles(payload);
  if (candles.length < 210) throw new Error("کندل کافی نیست");
  candleCache.set(key, { at: Date.now(), data: candles });
  if (candleCache.size > 360) {
    const oldest = [...candleCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) candleCache.delete(oldest[0]);
  }
  return candles;
}

export const getUniverse = createServerFn({ method: "GET" }).handler(async () => {
  return loadUniverse();
});

export const getScanBatch = createServerFn({ method: "POST" })
  .validator((input: unknown) => batchSchema.parse(input))
  .handler(async ({ data }) => {
    const hits: ScanHit[] = await Promise.all(
      data.bases.map(async (base): Promise<ScanHit> => {
        try {
          const candles = await loadCandles(base, data.interval);
          const evaluation = evaluateCandles(candles);
          if (!evaluation) {
            return { ok: false, base, interval: data.interval, error: "داده کافی نیست" };
          }
          return { ok: true, base, interval: data.interval, evaluation };
        } catch (err) {
          const error = err instanceof Error ? err.message : "خوانده نشد";
          return { ok: false, base, interval: data.interval, error };
        }
      }),
    );
    return hits;
  });

export const getChart = createServerFn({ method: "GET" })
  .validator((input: unknown) => chartSchema.parse(input))
  .handler(async ({ data }): Promise<ChartPoint[]> => {
    const candles = await loadCandles(data.base, data.interval);
    return chartSeries(candles, 160);
  });
