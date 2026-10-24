import type { IntervalId, PositionPlan } from "@/lib/strategy";
import { INTERVAL_LABEL } from "@/lib/strategy";

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : abs >= 0.0001 ? 6 : 8;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.001 ? 6 : 8;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export function formatUsdt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatTehran(ts: number, withTime: boolean): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: withTime ? "2-digit" : undefined,
    minute: withTime ? "2-digit" : undefined,
    hourCycle: "h23",
  }).format(new Date(ts));
}

export function formatAxisTime(ts: number, interval: IntervalId): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Tehran",
    day: "2-digit",
    month: "2-digit",
    hourCycle: "h23",
  };
  if (interval !== "1d") {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return new Intl.DateTimeFormat("en-GB", options).format(new Date(ts)).replace(",", "");
}

export function ticketText(
  name: string,
  base: string,
  interval: IntervalId,
  plan: PositionPlan,
  capital: number,
): string {
  const side = plan.side === "long" ? "خرید" : "فروش استقراضی";
  return [
    `میزان | ${side} ${name} (${base}USDT)`,
    `تایم‌فریم: ${INTERVAL_LABEL[interval]}`,
    `ورود (بسته‌شدن کندل): ${formatPrice(plan.entry)}`,
    `حد ضرر (۱٫۵×ATR): ${formatPrice(plan.stop)} (${plan.stopPct.toFixed(2)}%)`,
    `حد سود (۲× فاصله ضرر): ${formatPrice(plan.takeProfit)} (${plan.rewardPct.toFixed(2)}%)`,
    `ATR(14): ${formatPrice(plan.atr)}`,
    `سرمایه: ${formatUsdt(capital)} USDT`,
    `ریسک معامله: ${formatUsdt(plan.actualRiskCash)} USDT`,
    `حجم: ${formatQty(plan.qty)} ${base}`,
    `ارزش معامله: ${formatUsdt(plan.notional)} USDT`,
    `اهرم ضمنی: ${plan.leverage.toFixed(2)}×`,
    plan.capped ? "حجم به سقف اسپات محدود شد." : "اندازه دقیقاً با ریسک ۰٫۵٪.",
    "بدون افزایش پله‌ای و بدون مارتینگل.",
  ].join("\n");
}
