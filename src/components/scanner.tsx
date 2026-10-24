import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { RefreshCw, Scale, Square, X } from "lucide-react";
import { TradeDetail } from "@/components/trade-detail";
import { formatPct, formatPrice } from "@/lib/format";
import { getChart, getScanBatch, getUniverse, type ScanHit } from "@/lib/market";
import { cn } from "@/lib/cn";
import {
  classify,
  INTERVAL_LABEL,
  INTERVALS,
  type ChartPoint,
  type Evaluation,
  type IntervalId,
  type Phase,
} from "@/lib/strategy";
import type { Asset } from "@/lib/universe";

type Mode = IntervalId | "all";
type SideFilter = "all" | "long" | "short";
type PhaseFilter = "signal" | "watch" | "riding" | "all";
type Status = "loading" | "ready" | "error" | "idle";

type Row = {
  key: string;
  asset: Asset;
  interval: IntervalId;
  evaluation: Evaluation;
  phase: Phase;
  side: "long" | "short" | "none";
};

const PHASE_ORDER: Record<Phase, number> = { signal: 0, watch: 1, riding: 2, idle: 3 };
const TF_ORDER: Record<IntervalId, number> = { "1h": 0, "4h": 1, "1d": 2 };

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return wide;
}

function phaseLabel(phase: Phase, side: Row["side"]) {
  if (phase === "signal" && side === "long") return "خرید";
  if (phase === "signal" && side === "short") return "فروش";
  if (phase === "watch" && side === "long") return "آستانه خرید";
  if (phase === "watch" && side === "short") return "آستانه فروش";
  if (phase === "riding" && side === "long") return "صعودی";
  if (phase === "riding" && side === "short") return "نزولی";
  return "خنثی";
}

export function Scanner() {
  const wide = useWide();
  const [mode, setMode] = useState<Mode>("all");
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [hits, setHits] = useState<ScanHit[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("signal");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [capitalText, setCapitalText] = useState("10000");
  const [spotCap, setSpotCap] = useState(false);
  const [chart, setChart] = useState<ChartPoint[] | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const runRef = useRef(0);
  const hitsRef = useRef<ScanHit[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mizan-capital");
      if (saved) setCapitalText(saved);
      setSpotCap(localStorage.getItem("mizan-spot") === "1");
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("mizan-capital", capitalText);
      localStorage.setItem("mizan-spot", spotCap ? "1" : "0");
    } catch {
      /* ignore quota */
    }
  }, [capitalText, spotCap]);

  useEffect(() => {
    const run = ++runRef.current;
    setStatus("loading");
    setError(null);
    setPartial(false);
    setHits([]);
    hitsRef.current = [];
    setProgress({ done: 0, total: 0 });

    async function go() {
      try {
        const list = await getUniverse();
        if (run !== runRef.current) return;
        setAssets(list);
        const intervals: IntervalId[] = mode === "all" ? [...INTERVALS] : [mode];
        const jobs: { bases: string[]; interval: IntervalId }[] = [];
        for (const interval of intervals) {
          for (let i = 0; i < list.length; i += 8) {
            jobs.push({ bases: list.slice(i, i + 8).map((asset) => asset.base), interval });
          }
        }
        const total = list.length * intervals.length;
        setProgress({ done: 0, total });
        const acc: ScanHit[] = [];
        let done = 0;
        const queue = [...jobs];
        async function worker() {
          for (;;) {
            const job = queue.shift();
            if (!job || run !== runRef.current) return;
            const part = await getScanBatch({ data: job });
            if (run !== runRef.current) return;
            acc.push(...part);
            done += job.bases.length;
            const snapshot = acc.slice();
            hitsRef.current = snapshot;
            setHits(snapshot);
            setProgress({ done, total });
          }
        }
        await Promise.all([worker(), worker(), worker()]);
        if (run !== runRef.current) return;
        if (!acc.some((hit) => hit.ok)) {
          const fail = acc.find((hit) => !hit.ok);
          setStatus("error");
          setError(fail && !fail.ok ? fail.error : "هیچ کندلی خوانده نشد");
          return;
        }
        setStatus("ready");
        setUpdatedAt(Date.now());
      } catch (err) {
        if (run !== runRef.current) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "اسکن ناموفق بود");
      }
    }

    void go();
    return () => {
      runRef.current += 1;
    };
  }, [mode, nonce]);

  const capital = useMemo(() => {
    const value = Number(capitalText.replace(/,/g, "").trim());
    if (!Number.isFinite(value) || value < 10 || value > 1_000_000_000_000) return null;
    return value;
  }, [capitalText]);

  const allRows = useMemo(() => {
    const byBase = new Map(assets.map((asset) => [asset.base, asset]));
    const rows: Row[] = [];
    for (const hit of hits) {
      if (!hit.ok) continue;
      const asset = byBase.get(hit.base);
      if (!asset) continue;
      const state = classify(hit.evaluation);
      rows.push({
        key: `${hit.base}|${hit.interval}`,
        asset,
        interval: hit.interval,
        evaluation: hit.evaluation,
        phase: state.phase,
        side: state.side,
      });
    }
    rows.sort(
      (a, b) =>
        PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
        a.asset.rank - b.asset.rank ||
        TF_ORDER[a.interval] - TF_ORDER[b.interval],
    );
    return rows;
  }, [assets, hits]);

  const filtered = useMemo(() => {
    return allRows.filter((row) => {
      if (phaseFilter !== "all" && row.phase !== phaseFilter) return false;
      if (sideFilter !== "all" && row.side !== sideFilter) return false;
      return true;
    });
  }, [allRows, phaseFilter, sideFilter]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelected(null);
      return;
    }
    if (!selected || !filtered.some((row) => row.key === selected)) {
      const next = filtered.find((row) => row.phase === "signal") ?? filtered[0];
      if (next) setSelected(next.key);
    }
  }, [filtered, selected]);

  const selectedRow = filtered.find((row) => row.key === selected) ?? null;

  useEffect(() => {
    if (!selected) {
      setChart(null);
      setChartError(null);
      return;
    }
    const [base, interval] = selected.split("|");
    if (!base || (interval !== "1h" && interval !== "4h" && interval !== "1d")) return;
    let cancel = false;
    setChartLoading(true);
    setChartError(null);
    getChart({ data: { base, interval } })
      .then((points) => {
        if (!cancel) setChart(points);
      })
      .catch((err: unknown) => {
        if (cancel) return;
        setChart(null);
        setChartError(err instanceof Error ? err.message : "نمودار نیامد");
      })
      .finally(() => {
        if (!cancel) setChartLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [selected]);

  const pool = allRows.filter((row) => sideFilter === "all" || row.side === sideFilter);
  const counts = {
    signal: pool.filter((row) => row.phase === "signal").length,
    watch: pool.filter((row) => row.phase === "watch").length,
    riding: pool.filter((row) => row.phase === "riding").length,
    all: pool.length,
  };
  const longSignals = allRows.filter((row) => row.phase === "signal" && row.side === "long").length;
  const shortSignals = allRows.filter((row) => row.phase === "signal" && row.side === "short").length;
  const failed = hits.filter((hit) => !hit.ok).length;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : status === "loading" ? 6 : 0;

  const aligned =
    selectedRow == null
      ? 0
      : allRows.filter(
          (row) =>
            row.asset.base === selectedRow.asset.base &&
            row.side === selectedRow.side &&
            row.side !== "none" &&
            (row.phase === "signal" || row.phase === "riding"),
        ).length;

  function choose(key: string) {
    setSelected(key);
    if (!wide) setMobileOpen(true);
  }

  function onPrimary() {
    if (status === "loading") {
      runRef.current += 1;
      if (hitsRef.current.some((hit) => hit.ok)) {
        setPartial(true);
        setStatus("ready");
        setUpdatedAt(Date.now());
      } else {
        setStatus("idle");
      }
      return;
    }
    setNonce((value) => value + 1);
  }

  const detail =
    selectedRow == null ? (
      <div className="grid min-h-64 place-items-center rounded-md border border-dashed border-border px-6 text-center text-sm leading-relaxed text-muted">
        {status === "loading"
          ? "سیگنال‌ها که پیدا شوند، برگه معامله همین‌جا باز می‌شود."
          : "در این نما ردیفی نیست. فیلتر را عوض کنید یا اسکن را دوباره بگیرید."}
      </div>
    ) : (
      <TradeDetail
        asset={selectedRow.asset}
        interval={selectedRow.interval}
        evaluation={selectedRow.evaluation}
        capital={capital}
        spotCap={spotCap}
        onSpotCap={setSpotCap}
        chart={chart}
        chartLoading={chartLoading}
        chartError={chartError}
        aligned={aligned}
      />
    );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-md border border-border bg-surface">
              <Scale className="size-5 text-brass" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-semibold leading-none">میزان</h1>
              <p className="mt-1 text-sm text-muted">اسکنر روند صد ارز برتر</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block sm:w-44">
              <span className="mb-1 block text-xs text-muted">سرمایه (USDT)</span>
              <input
                inputMode="decimal"
                value={capitalText}
                onChange={(event) => setCapitalText(event.target.value)}
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm tabular-nums text-fg"
                aria-invalid={capital == null}
              />
            </label>
            <button
              type="button"
              onClick={onPrimary}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold",
                status === "loading"
                  ? "border border-border bg-surface text-fg"
                  : "bg-brass text-brass-ink",
              )}
            >
              {status === "loading" ? <Square className="size-4" /> : <RefreshCw className="size-4" />}
              {status === "loading" ? "توقف" : "اسکن بازار"}
            </button>
          </div>
        </div>
        {status === "loading" && (
          <div className="h-1 bg-surface" aria-hidden>
            <div className="h-full bg-brass transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        )}
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
        <section className="grid gap-3 lg:grid-cols-3" aria-label="قواعد استراتژی">
          <Rule
            title="خرید"
            tone="long"
            body="EMA50 بالاتر از EMA200 باشد و قیمت هم بالای EMA200 بماند. قیمت از زیر EMA20 به بالا عبور کند و RSI(14) بالای ۵۰ باشد."
          />
          <Rule
            title="فروش استقراضی"
            tone="short"
            body="EMA50 پایین‌تر از EMA200 باشد و قیمت هم زیر EMA200 بماند. قیمت از بالای EMA20 به پایین عبور کند و RSI(14) زیر ۵۰ باشد."
          />
          <Rule
            title="مدیریت معامله"
            tone="brass"
            body="حد ضرر ۱٫۵ برابر ATR(14). حد سود دو برابر فاصله حد ضرر. ریسک هر معامله ۰٫۵٪ سرمایه، یک‌بار، بدون پله و بدون مارتینگل."
          />
        </section>

        <p className="text-sm leading-relaxed text-muted">
          فقط آخرین کندل بسته‌شده ملاک است. کندلِ در حال تشکیل کنار گذاشته می‌شود تا سیگنال جابه‌جا نشود. عبور
          EMA20 باید در همین کندل رخ داده باشد.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="تایم‌فریم">
            {INTERVALS.map((interval) => (
              <Chip key={interval} active={mode === interval} onClick={() => setMode(interval)}>
                {INTERVAL_LABEL[interval]}
              </Chip>
            ))}
            <Chip active={mode === "all"} onClick={() => setMode("all")}>
              هر سه
            </Chip>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="نوع وضعیت">
            <Chip active={phaseFilter === "signal"} onClick={() => setPhaseFilter("signal")}>
              سیگنال {counts.signal}
            </Chip>
            <Chip active={phaseFilter === "watch"} onClick={() => setPhaseFilter("watch")}>
              آستانه {counts.watch}
            </Chip>
            <Chip active={phaseFilter === "riding"} onClick={() => setPhaseFilter("riding")}>
              داخل روند {counts.riding}
            </Chip>
            <Chip active={phaseFilter === "all"} onClick={() => setPhaseFilter("all")}>
              همه {counts.all}
            </Chip>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="جهت">
            <Chip active={sideFilter === "all"} onClick={() => setSideFilter("all")}>
              هر دو جهت
            </Chip>
            <Chip active={sideFilter === "long"} onClick={() => setSideFilter("long")}>
              خرید
            </Chip>
            <Chip active={sideFilter === "short"} onClick={() => setSideFilter("short")}>
              فروش
            </Chip>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
          <Stat label="ارزها" value={assets.length ? String(assets.length) : "—"} />
          <Stat label="سیگنال خرید" value={String(longSignals)} tone="long" />
          <Stat label="سیگنال فروش" value={String(shortSignals)} tone="short" />
          <Stat
            label={status === "loading" ? "پیشرفت" : "خوانده‌نشده"}
            value={status === "loading" ? `${progress.done}/${progress.total || "…"}` : String(failed)}
          />
        </dl>

        {capital == null && (
          <p className="text-sm text-short">سرمایه باید عددی بین ۱۰ و ۱۰۰۰ میلیارد USDT باشد.</p>
        )}
        {error && (
          <p className="rounded-md bg-short-dim px-3 py-3 text-sm leading-relaxed text-short" role="alert">
            {error}
          </p>
        )}
        {partial && status === "ready" && (
          <p className="text-sm text-brass">اسکن نیمه‌کاره متوقف شد. عددها فقط برای ارزهایی است که خوانده شدند.</p>
        )}
        {status === "loading" && (
          <p className="text-sm text-muted" aria-live="polite">
            {progress.total === 0
              ? "فهرست صد ارز برتر در حال چیده شدن است."
              : `${progress.done} از ${progress.total} خوانده شد.`}
          </p>
        )}
        {updatedAt != null && status === "ready" && (
          <p className="text-xs text-faint">
            آخرین اسکن {new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(updatedAt)}{" "}
            به وقت تهران
          </p>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="flex min-w-0 flex-col gap-2" aria-label="نتایج">
            {status === "loading" && hits.length === 0 &&
              Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-md border border-border bg-surface" />
              ))}
            {status === "loading" && hits.length > 0 && filtered.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm leading-relaxed text-muted">
                هنوز سیگنال تازه‌ای در کندل بسته‌شده نیست. اسکن ادامه دارد.
              </p>
            )}
            {filtered.map((row) => {
              const gap =
                ((row.evaluation.close - row.evaluation.ema20) / row.evaluation.ema20) * 100;
              const active = row.key === selected;
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => choose(row.key)}
                  aria-pressed={active}
                  className={cn(
                    "w-full rounded-md border p-3 text-start",
                    active ? "border-brass bg-surface-2" : "border-border bg-surface",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-baseline gap-2">
                        <span className="text-xs tabular-nums text-faint">{row.asset.rank}</span>
                        <span className="truncate font-semibold">{row.asset.name}</span>
                        <span className="text-xs text-muted" dir="ltr">
                          {row.asset.base}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        <span dir="ltr">{row.interval.toUpperCase()}</span>
                        <span className="mx-1">·</span>
                        RSI {row.evaluation.rsi.toFixed(1)}
                        <span className="mx-1">·</span>
                        EMA20 {formatPct(gap)}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="font-semibold tabular-nums" dir="ltr">
                        {formatPrice(row.evaluation.close)}
                      </p>
                      <p
                        className={cn(
                          "text-xs tabular-nums",
                          row.asset.change24h >= 0 ? "text-long" : "text-short",
                        )}
                        dir="ltr"
                      >
                        {formatPct(row.asset.change24h)}
                      </p>
                    </div>
                  </div>
                  <p
                    className={cn(
                      "mt-2 inline-flex rounded-sm px-2 py-1 text-xs font-medium",
                      row.phase === "signal" && row.side === "long" && "bg-long-dim text-long",
                      row.phase === "signal" && row.side === "short" && "bg-short-dim text-short",
                      row.phase === "watch" && "bg-bg text-brass",
                      row.phase === "riding" && "bg-bg text-line",
                      row.phase === "idle" && "bg-bg text-faint",
                    )}
                  >
                    {phaseLabel(row.phase, row.side)}
                  </p>
                </button>
              );
            })}
            {status !== "loading" && filtered.length === 0 && !error && (
              <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm leading-relaxed text-muted">
                {phaseFilter === "signal"
                  ? "در کندل بسته‌شده فعلی عبوری با هر چهار شرط نیست. آستانه را ببینید؛ آنجا روند آماده است ولی EMA20 هنوز قطع نشده."
                  : "چیزی با این فیلتر پیدا نشد."}
              </div>
            )}
          </section>

          {wide && (
            <aside className="sticky top-24 min-w-0 rounded-lg border border-border bg-bg-raised p-4">
              {detail}
            </aside>
          )}
        </div>

        <footer className="border-t border-border pt-4 text-xs leading-relaxed text-faint">
          رتبه‌بندی از ارزش بازار است و استیبل‌کوین و ارز بدون جفت تترِ اسپات حذف شده‌اند. کندل‌ها از داده عمومی
          بایننس می‌آیند و میانگین‌ها با هزار کندل آخر حساب می‌شوند. این صفحه ماشین حساب قواعد است، نه توصیه خرید
          یا فروش.
          {failed > 0 && status === "ready" ? ` ${failed} نماد در این دور خوانده نشد.` : ""}
        </footer>
      </main>

      {!wide && (
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/80" />
            <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-lg border border-border bg-bg-raised p-4 pb-8">
              <div className="mb-3 flex items-center justify-between">
                <Dialog.Title className="text-sm font-semibold">جزئیات</Dialog.Title>
                <Dialog.Description className="sr-only">شرط‌ها، نمودار و اندازه معامله</Dialog.Description>
                <Dialog.Close className="grid size-11 place-items-center rounded-md border border-border" aria-label="بستن">
                  <X className="size-4" />
                </Dialog.Close>
              </div>
              {detail}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}

function Rule({ title, body, tone }: { title: string; body: string; tone: "long" | "short" | "brass" }) {
  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <h2
        className={cn(
          "text-sm font-semibold",
          tone === "long" && "text-long",
          tone === "short" && "text-short",
          tone === "brass" && "text-brass",
        )}
      >
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </article>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-11 rounded-md border px-3 text-sm font-medium",
        active ? "border-brass bg-brass text-brass-ink" : "border-border bg-surface text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "long" | "short" }) {
  return (
    <div className="bg-surface px-3 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "long" && "text-long",
          tone === "short" && "text-short",
        )}
        dir="ltr"
      >
        {value}
      </dd>
    </div>
  );
}
