export type IntervalId = "1h" | "4h" | "1d";

export const INTERVALS: IntervalId[] = ["1h", "4h", "1d"];

export const INTERVAL_LABEL: Record<IntervalId, string> = {
  "1h": "۱ ساعته",
  "4h": "۴ ساعته",
  "1d": "روزانه",
};

export const RISK_FRACTION = 0.005;
export const ATR_STOP_MULT = 1.5;
export const REWARD_R = 2;
export const MIN_BARS = 210;

export type Candle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Side = "long" | "short";
export type Phase = "signal" | "watch" | "riding" | "idle";

export type Evaluation = {
  candleTime: number;
  close: number;
  prevClose: number;
  ema20: number;
  prevEma20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  atr: number;
  stackLong: boolean;
  stackShort: boolean;
  priceLong: boolean;
  priceShort: boolean;
  crossUp: boolean;
  crossDown: boolean;
  rsiLong: boolean;
  rsiShort: boolean;
  signal: Side | null;
};

export type PositionPlan = {
  side: Side;
  entry: number;
  stop: number;
  takeProfit: number;
  atr: number;
  riskDist: number;
  rewardDist: number;
  riskCash: number;
  actualRiskCash: number;
  qty: number;
  notional: number;
  stopPct: number;
  rewardPct: number;
  leverage: number;
  capped: boolean;
};

export type ChartPoint = {
  t: number;
  c: number;
  e20: number;
  e50: number;
  e200: number;
};

export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: values.length }, () => null);
  if (period < 1 || values.length < period) return out;
  const alpha = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i] ?? 0;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    const value = values[i] ?? prev;
    prev = value * alpha + prev * (1 - alpha);
    out[i] = prev;
  }
  return out;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Wilder RSI. First value sits on the candle that closes the seed window. */
export function rsi(closes: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: closes.length }, () => null);
  if (closes.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFrom(avgGain, avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

/** Wilder ATR. True range of the first bar is high-low; later bars use the prior close. */
export function atr(candles: Candle[], period = 14): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: candles.length }, () => null);
  if (candles.length < period) return out;
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (!candle) continue;
    if (i === 0) {
      trs.push(candle.high - candle.low);
      continue;
    }
    const prevClose = candles[i - 1]?.close ?? candle.close;
    trs.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevClose),
        Math.abs(candle.low - prevClose),
      ),
    );
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i] ?? 0;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i++) {
    prev = (prev * (period - 1) + (trs[i] ?? prev)) / period;
    out[i] = prev;
  }
  return out;
}

export function evaluateCandles(candles: Candle[]): Evaluation | null {
  if (candles.length < MIN_BARS) return null;
  const closes = candles.map((candle) => candle.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const i = candles.length - 1;
  const p = i - 1;
  const e20 = ema20[i];
  const e20p = ema20[p];
  const e50 = ema50[i];
  const e200 = ema200[i];
  const rv = rsi14[i];
  const av = atr14[i];
  const close = closes[i];
  const prevClose = closes[p];
  const candle = candles[i];
  if (
    e20 == null ||
    e20p == null ||
    e50 == null ||
    e200 == null ||
    rv == null ||
    av == null ||
    close == null ||
    prevClose == null ||
    !candle ||
    !Number.isFinite(av) ||
    av < 0
  ) {
    return null;
  }

  const crossUp = prevClose <= e20p && close > e20;
  const crossDown = prevClose >= e20p && close < e20;
  const stackLong = e50 > e200;
  const stackShort = e50 < e200;
  const priceLong = close > e200;
  const priceShort = close < e200;
  const rsiLong = rv > 50;
  const rsiShort = rv < 50;

  let signal: Side | null = null;
  if (stackLong && priceLong && crossUp && rsiLong) signal = "long";
  else if (stackShort && priceShort && crossDown && rsiShort) signal = "short";

  return {
    candleTime: candle.openTime,
    close,
    prevClose,
    ema20: e20,
    prevEma20: e20p,
    ema50: e50,
    ema200: e200,
    rsi: rv,
    atr: av,
    stackLong,
    stackShort,
    priceLong,
    priceShort,
    crossUp,
    crossDown,
    rsiLong,
    rsiShort,
    signal,
  };
}

export function classify(ev: Evaluation): { phase: Phase; side: Side | "none" } {
  if (ev.signal === "long") return { phase: "signal", side: "long" };
  if (ev.signal === "short") return { phase: "signal", side: "short" };
  if (ev.stackLong && ev.priceLong && ev.rsiLong && ev.close <= ev.ema20) {
    return { phase: "watch", side: "long" };
  }
  if (ev.stackShort && ev.priceShort && ev.rsiShort && ev.close >= ev.ema20) {
    return { phase: "watch", side: "short" };
  }
  if (ev.stackLong && ev.priceLong && ev.rsiLong && ev.close > ev.ema20) {
    return { phase: "riding", side: "long" };
  }
  if (ev.stackShort && ev.priceShort && ev.rsiShort && ev.close < ev.ema20) {
    return { phase: "riding", side: "short" };
  }
  return { phase: "idle", side: "none" };
}

export function planPosition(
  ev: Evaluation,
  capital: number,
  spotCap: boolean,
): PositionPlan | null {
  if (!ev.signal || !(capital > 0) || !(ev.atr > 0) || !(ev.close > 0)) return null;
  const riskDist = ATR_STOP_MULT * ev.atr;
  const rewardDist = REWARD_R * riskDist;
  if (!(riskDist > 0)) return null;
  const entry = ev.close;
  const long = ev.signal === "long";
  const stop = long ? entry - riskDist : entry + riskDist;
  const takeProfit = long ? entry + rewardDist : entry - rewardDist;
  if (!(stop > 0) || !(takeProfit > 0)) return null;
  const riskCash = capital * RISK_FRACTION;
  let qty = riskCash / riskDist;
  let capped = false;
  if (spotCap) {
    const maxQty = capital / entry;
    if (qty > maxQty) {
      qty = maxQty;
      capped = true;
    }
  }
  if (!(qty > 0)) return null;
  const notional = qty * entry;
  return {
    side: ev.signal,
    entry,
    stop,
    takeProfit,
    atr: ev.atr,
    riskDist,
    rewardDist,
    riskCash,
    actualRiskCash: qty * riskDist,
    qty,
    notional,
    stopPct: (riskDist / entry) * 100,
    rewardPct: (rewardDist / entry) * 100,
    leverage: notional / capital,
    capped,
  };
}

export function chartSeries(candles: Candle[], count = 160): ChartPoint[] {
  if (candles.length < MIN_BARS) return [];
  const closes = candles.map((candle) => candle.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const start = Math.max(199, candles.length - count);
  const points: ChartPoint[] = [];
  for (let i = start; i < candles.length; i++) {
    const a = e20[i];
    const b = e50[i];
    const c = e200[i];
    const close = closes[i];
    const candle = candles[i];
    if (a == null || b == null || c == null || close == null || !candle) continue;
    points.push({ t: candle.openTime, c: close, e20: a, e50: b, e200: c });
  }
  return points;
}
