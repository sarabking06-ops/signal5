import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAxisTime, formatPrice, formatTehran } from "@/lib/format";
import type { ChartPoint, IntervalId } from "@/lib/strategy";
import { INTERVAL_LABEL } from "@/lib/strategy";

type TipPayload = { payload?: ChartPoint };

function ChartTip({
  active,
  payload,
  interval,
}: {
  active?: boolean;
  payload?: TipPayload[];
  interval: IntervalId;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-border bg-bg-raised px-3 py-2 text-xs" dir="ltr">
      <p className="tabular-nums text-muted">{formatTehran(point.t, interval !== "1d")}</p>
      <p className="mt-1 tabular-nums text-fg">Close {formatPrice(point.c)}</p>
      <p className="tabular-nums text-brass">EMA20 {formatPrice(point.e20)}</p>
      <p className="tabular-nums text-line">EMA50 {formatPrice(point.e50)}</p>
      <p className="tabular-nums text-faint">EMA200 {formatPrice(point.e200)}</p>
    </div>
  );
}

export function PriceChart({
  points,
  interval,
  loading,
  error,
}: {
  points: ChartPoint[] | null;
  interval: IntervalId;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">نمودار بسته‌شدن · {INTERVAL_LABEL[interval]}</p>
        <ul className="flex flex-wrap gap-3 text-xs text-muted">
          <li className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-fg" aria-hidden />
            قیمت
          </li>
          <li className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-brass" aria-hidden />
            EMA20
          </li>
          <li className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-line" aria-hidden />
            EMA50
          </li>
          <li className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-faint" aria-hidden />
            EMA200
          </li>
        </ul>
      </div>
      <div className="h-64 w-full min-w-0" dir="ltr">
        {loading && (
          <div className="grid h-full place-items-center text-sm text-muted">نمودار در حال آمدن است</div>
        )}
        {!loading && error && (
          <div className="grid h-full place-items-center px-4 text-center text-sm text-short">{error}</div>
        )}
        {!loading && !error && points && points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={(value: number) => formatAxisTime(value, interval)}
                tick={{ fill: "var(--color-faint)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(value: number) => formatPrice(value)}
                tick={{ fill: "var(--color-faint)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <Tooltip
                content={(props) => (
                  <ChartTip
                    active={props.active}
                    payload={props.payload as TipPayload[] | undefined}
                    interval={interval}
                  />
                )}
              />
              <Line type="monotone" dataKey="e200" stroke="var(--color-faint)" dot={false} strokeWidth={1.25} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="e50" stroke="var(--color-line)" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="e20" stroke="var(--color-brass)" dot={false} strokeWidth={1.75} />
              <Line type="monotone" dataKey="c" stroke="var(--color-fg)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {!loading && !error && (!points || points.length === 0) && (
          <div className="grid h-full place-items-center text-sm text-muted">کندل کافی برای نمودار نیست</div>
        )}
      </div>
    </div>
  );
}
