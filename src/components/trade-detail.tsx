import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { PriceChart } from "@/components/price-chart";
import { formatPct, formatPrice, formatQty, formatTehran, formatUsdt, ticketText } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  classify,
  planPosition,
  INTERVAL_LABEL,
  type ChartPoint,
  type Evaluation,
  type IntervalId,
} from "@/lib/strategy";
import type { Asset } from "@/lib/universe";

function CheckRow({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <span className="flex items-start gap-2">
        {ok ? (
          <Check className="mt-0.5 size-4 shrink-0 text-long" aria-hidden />
        ) : (
          <X className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
        )}
        <span className={ok ? "text-fg" : "text-muted"}>{label}</span>
      </span>
      <span className="shrink-0 tabular-nums text-muted" dir="ltr">
        {value}
      </span>
    </li>
  );
}

export function TradeDetail({
  asset,
  interval,
  evaluation,
  capital,
  spotCap,
  onSpotCap,
  chart,
  chartLoading,
  chartError,
  aligned,
}: {
  asset: Asset;
  interval: IntervalId;
  evaluation: Evaluation;
  capital: number | null;
  spotCap: boolean;
  onSpotCap: (value: boolean) => void;
  chart: ChartPoint[] | null;
  chartLoading: boolean;
  chartError: string | null;
  aligned: number;
}) {
  const [copied, setCopied] = useState(false);
  const { phase, side } = classify(evaluation);
  const plan = capital != null ? planPosition(evaluation, capital, spotCap) : null;
  const gap = ((evaluation.close - evaluation.ema20) / evaluation.ema20) * 100;
  const phaseCopy =
    phase === "signal"
      ? "هر چهار شرط روی آخرین کندل بسته‌شده برقرار است. ورود، قیمت همان بسته‌شدن است."
      : phase === "watch"
        ? "روند و RSI هم‌جهت‌اند، اما قیمت هنوز از EMA20 عبور نکرده. این سیگنال ورود نیست."
        : phase === "riding"
          ? "روند برقرار است، ولی عبور EMA20 در این کندل اتفاق نیفتاده. ورود دیر محسوب می‌شود."
          : "شرط‌های روند هنوز با هم جمع نشده‌اند.";

  async function copyTicket() {
    if (!plan || capital == null) return;
    const text = ticketText(asset.name, asset.base, interval, plan, capital);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <article className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">
            رتبه بازار {asset.rank} · {INTERVAL_LABEL[interval]}
          </p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight">
            {asset.name}
            <span className="ms-2 text-base font-medium text-muted" dir="ltr">
              {asset.base}
            </span>
          </h2>
          <p className="mt-1 text-sm text-faint">
            کندل {formatTehran(evaluation.candleTime, interval !== "1d")} به وقت تهران
          </p>
        </div>
        <p
          className={cn(
            "rounded-md px-3 py-2 text-sm font-semibold",
            phase === "signal" && side === "long" && "bg-long-dim text-long",
            phase === "signal" && side === "short" && "bg-short-dim text-short",
            phase === "watch" && "bg-surface-2 text-brass",
            phase === "riding" && "bg-surface-2 text-line",
            phase === "idle" && "bg-surface-2 text-faint",
          )}
        >
          {phase === "signal" && side === "long" && "سیگنال خرید"}
          {phase === "signal" && side === "short" && "سیگنال فروش"}
          {phase === "watch" && side === "long" && "آستانه خرید"}
          {phase === "watch" && side === "short" && "آستانه فروش"}
          {phase === "riding" && side === "long" && "روند صعودی"}
          {phase === "riding" && side === "short" && "روند نزولی"}
          {phase === "idle" && "بدون جهت"}
        </p>
      </header>

      <p className="text-sm leading-relaxed text-muted">{phaseCopy}</p>
      {aligned >= 2 && side !== "none" && (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-brass">
          همین جهت در {aligned} تایم‌فریم دیده می‌شود.
        </p>
      )}

      <PriceChart points={chart} interval={interval} loading={chartLoading} error={chartError} />

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-surface px-3">
          <h3 className="border-b border-border py-2 text-sm font-semibold text-long">شرط‌های خرید</h3>
          <ul className="divide-y divide-border text-sm">
            <CheckRow ok={evaluation.stackLong} label="EMA50 بالاتر از EMA200" value={formatPrice(evaluation.ema50)} />
            <CheckRow ok={evaluation.priceLong} label="قیمت بالاتر از EMA200" value={formatPrice(evaluation.ema200)} />
            <CheckRow ok={evaluation.crossUp} label="عبور به بالای EMA20" value={formatPrice(evaluation.ema20)} />
            <CheckRow ok={evaluation.rsiLong} label="RSI بالاتر از ۵۰" value={evaluation.rsi.toFixed(1)} />
          </ul>
        </div>
        <div className="rounded-md border border-border bg-surface px-3">
          <h3 className="border-b border-border py-2 text-sm font-semibold text-short">شرط‌های فروش</h3>
          <ul className="divide-y divide-border text-sm">
            <CheckRow ok={evaluation.stackShort} label="EMA50 پایین‌تر از EMA200" value={formatPrice(evaluation.ema50)} />
            <CheckRow ok={evaluation.priceShort} label="قیمت پایین‌تر از EMA200" value={formatPrice(evaluation.ema200)} />
            <CheckRow ok={evaluation.crossDown} label="عبور به زیر EMA20" value={formatPrice(evaluation.ema20)} />
            <CheckRow ok={evaluation.rsiShort} label="RSI پایین‌تر از ۵۰" value={evaluation.rsi.toFixed(1)} />
          </ul>
        </div>
      </section>

      <p className="text-sm text-muted">
        فاصله از EMA20:{" "}
        <span className="tabular-nums text-fg" dir="ltr">
          {formatPct(gap)}
        </span>
        <span className="mx-2 text-faint">·</span>
        ATR(14):{" "}
        <span className="tabular-nums text-fg" dir="ltr">
          {formatPrice(evaluation.atr)}
        </span>
      </p>

      {phase === "signal" && plan && capital != null && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">برگه معامله</h3>
            <button
              type="button"
              role="switch"
              aria-checked={spotCap}
              onClick={() => onSpotCap(!spotCap)}
              className={cn(
                "h-11 rounded-md border px-3 text-sm",
                spotCap ? "border-brass bg-brass text-brass-ink" : "border-border bg-surface text-fg",
              )}
            >
              سقف اسپات {spotCap ? "روشن" : "خاموش"}
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
            <Cell label="ورود" value={formatPrice(plan.entry)} hint="بسته‌شدن کندل" wide />
            <Cell label="حد ضرر" value={formatPrice(plan.stop)} hint={`${plan.stopPct.toFixed(2)}% · ۱٫۵×ATR`} tone="short" />
            <Cell label="حد سود" value={formatPrice(plan.takeProfit)} hint={`${plan.rewardPct.toFixed(2)}% · ۲ برابر ضرر`} tone="long" />
            <Cell label="ریسک" value={`${formatUsdt(plan.actualRiskCash)} USDT`} hint={plan.capped ? "کمتر از ۰٫۵٪ به‌خاطر سقف" : "۰٫۵٪ سرمایه"} />
            <Cell label="حجم" value={`${formatQty(plan.qty)} ${asset.base}`} hint="بدون پله و بدون مارتینگل" />
            <Cell label="ارزش معامله" value={`${formatUsdt(plan.notional)} USDT`} />
            <Cell label="اهرم ضمنی" value={`${plan.leverage.toFixed(2)}×`} hint={plan.leverage > 1 ? "بیشتر از موجودی اسپات" : "در محدوده سرمایه"} />
          </dl>
          {plan.leverage > 1 && !spotCap && (
            <p className="rounded-md bg-short-dim px-3 py-2 text-sm leading-relaxed text-short">
              حد ضرر آن‌قدر نزدیک است که حجمِ ریسک ۰٫۵٪ از سرمایه بزرگ‌تر می‌شود. برای اسپات، سقف را روشن کنید.
            </p>
          )}
          {plan.capped && (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-sm leading-relaxed text-muted">
              حجم به سرمایه محدود شد. ریسک واقعی این معامله {formatUsdt(plan.actualRiskCash)} USDT است، نه{" "}
              {formatUsdt(plan.riskCash)}.
            </p>
          )}
          <button
            type="button"
            onClick={() => void copyTicket()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface text-sm font-medium text-fg"
          >
            {copied ? <Check className="size-4 text-long" /> : <Copy className="size-4" />}
            {copied ? "کپی شد" : "کپی مشخصات معامله"}
          </button>
        </section>
      )}

      {phase === "signal" && capital == null && (
        <p className="text-sm text-short">سرمایه را عددی بزرگ‌تر از ۱۰ وارد کنید تا حجم حساب شود.</p>
      )}
      {phase === "signal" && capital != null && !plan && (
        <p className="text-sm text-short">با این ATR حد ضرر یا حد سود نامعتبر می‌شود و معامله ساخته نشد.</p>
      )}
    </article>
  );
}

function Cell({
  label,
  value,
  hint,
  wide,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  wide?: boolean;
  tone?: "long" | "short";
}) {
  return (
    <div className={cn("bg-bg-raised px-3 py-3", wide && "col-span-2")}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-base font-semibold tabular-nums",
          tone === "long" && "text-long",
          tone === "short" && "text-short",
        )}
        dir="ltr"
      >
        {value}
      </dd>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}
