"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { MileageLog } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";

/**
 * Mileage trend chart menggunakan Lightweight Charts (TradingView engine).
 *
 * Kenapa pindah dari recharts ke lightweight-charts:
 *   - Native pinch-zoom, mouse wheel zoom, drag pan, double-click reset
 *     — semua built-in tanpa custom event handling.
 *   - Canvas-based → smooth 60fps di low-end mobile (recharts SVG lebih
 *     berat DOM & react-render per gesture frame).
 *   - Same engine yang TradingView.com & Binance chart embed pakai →
 *     literal "seperti kripto" UX.
 *   - Bundle lebih kecil dari recharts (~30 KB vs ~90 KB gzipped).
 *
 * Trade-off:
 *   - Imperative API: create chart via ref + useEffect, bukan JSX
 *     declarative. Ini pattern yang sedikit "un-React", tapi terisolasi
 *     di component ini saja.
 *   - Canvas render → tidak bisa styling via CSS variable langsung.
 *     Workaround: read `getComputedStyle(document.documentElement)` untuk
 *     ambil CSS token values → pass ke chart options object.
 *   - Theme change (dark/light + color/mono mode) tidak otomatis propagate
 *     ke canvas. Solusi: MutationObserver di `<html>` class list → re-apply
 *     chart color options saat class berubah.
 *
 * Feature yang dapat GRATIS dari lightweight-charts:
 *   - Pinch-zoom (2-finger) center-anchored di titik cubit
 *   - Wheel zoom cursor-anchored (desktop)
 *   - Drag pan (single finger / mouse drag)
 *   - Kinetic pan (flick + inertia)
 *   - Double-click axis = reset zoom
 *   - Crosshair tooltip
 *   - Auto time-axis label formatting
 *   - Auto Y-scale ke visible range
 *
 * Time range preset buttons (1M/3M/6M/1Y/All) dipertahankan sebagai quick
 * navigation shortcut — konsisten dengan Binance/Coinbase mobile pattern.
 */
interface MileageChartProps {
  logs: MileageLog[];
}

type RangePreset = "1M" | "3M" | "6M" | "1Y" | "ALL";

/** Approximation ke bulan (30 hari) — presisi kalendar bukan requirement. */
const MS_PER_APPROX_MONTH = 30 * 86_400_000;

const PRESET_MONTHS: Record<Exclude<RangePreset, "ALL">, number> = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
};

/**
 * Baca CSS variable dari root document. Return-nya trimmed string.
 * Fallback dipanggil kalau CSS belum loaded / variable undefined.
 *
 * Kita pakai ini instead of hardcoded warna supaya chart otomatis
 * ikut theme (light/dark) dan color mode (grayscale/color).
 */
function readCssToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * Kumpulan chart options yang mode-aware. Di-panggil saat mount + tiap
 * `<html>` class change (theme/color-mode toggle) supaya canvas ikut
 * update.
 */
function readThemeOptions() {
  return {
    layout: {
      background: {
        type: ColorType.Solid,
        color: readCssToken("--color-surface", "#f5f7fa"),
      },
      textColor: readCssToken("--color-text", "#1a1d26"),
      fontFamily:
        "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    grid: {
      vertLines: { color: readCssToken("--color-border", "#e5e7eb") },
      horzLines: { color: readCssToken("--color-border", "#e5e7eb") },
    },
    timeScale: {
      borderColor: readCssToken("--color-border", "#e5e7eb"),
    },
    rightPriceScale: {
      borderColor: readCssToken("--color-border", "#e5e7eb"),
    },
  } as const;
}

export default function MileageChart({ logs }: MileageChartProps) {
  const { t } = useTranslation();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Track user-initiated zoom untuk kontrol visibility "Reset" button.
  // Lightweight-charts tidak expose "isZoomed" state — kita derive via
  // event subscription (visibleTimeRangeChange).
  const [isZoomed, setIsZoomed] = useState(false);
  // Active preset — di-set langsung saat user tap tombol (optimistic).
  const [activePreset, setActivePreset] = useState<RangePreset | null>(
    "ALL",
  );
  // Track apakah user LAGI aktif interact dengan chart canvas (touch/mouse
  // drag/wheel). rangeHandler cuma update activePreset kalau flag ini true.
  // Kalau user tap button preset (bukan canvas), flag false → state stay.
  // Ini lebih reliable dibanding time-based suppress karena tidak ada race
  // dengan async chart render.
  const userGesturingRef = useRef(false);

  // Convert logs → lightweight-charts data format.
  //
  // Constraints dari lightweight-charts:
  //   - Time HARUS unique per point (duplicate timestamps → runtime error)
  //   - Series HARUS sorted ascending by time
  //
  // Kita dedupe by keeping LAST log per second (paling akurat, karena
  // urutan input logs biasanya ascending juga — asumsi Supabase order).
  const chartData = useMemo(() => {
    const bySecond = new Map<number, number>();
    for (const log of logs) {
      const time = Math.floor(new Date(log.created_at).getTime() / 1000);
      // Last write wins — kalau ada 2 log dalam detik yang sama, ambil
      // yang mileage-nya lebih tinggi (asumsi monotonically increasing).
      const existing = bySecond.get(time);
      if (existing === undefined || log.mileage > existing) {
        bySecond.set(time, log.mileage);
      }
    }
    return Array.from(bySecond.entries())
      .map(([time, value]) => ({
        time: time as UTCTimestamp,
        value,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
  }, [logs]);

  // Ref untuk latest chartData — dipakai di rangeHandler untuk avoid stale
  // closure. Mount effect deps `[]` cuma capture chartData mount-time,
  // padahal handler perlu latest values untuk detect preset match.
  const chartDataRef = useRef(chartData);
  useEffect(() => {
    chartDataRef.current = chartData;
  }, [chartData]);

  // ────────────────── Chart lifecycle (mount / unmount) ──────────────────
  //
  // Setup sekali saat mount. Data & theme di-handle via effects terpisah
  // supaya tidak recreate chart tiap logs berubah (would flicker).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      ...readThemeOptions(),
      width: el.clientWidth,
      height: 224, // matches h-56 tailwind
      autoSize: false, // handled manually via ResizeObserver
      crosshair: {
        mode: CrosshairMode.Magnet, // snap ke nearest data point
        vertLine: {
          width: 1,
          style: 3, // Dashed
          color: readCssToken("--color-text-muted", "#9ca3af"),
          labelBackgroundColor: readCssToken("--color-text", "#1a1d26"),
        },
        horzLine: {
          width: 1,
          style: 3,
          color: readCssToken("--color-text-muted", "#9ca3af"),
          labelBackgroundColor: readCssToken("--color-text", "#1a1d26"),
        },
      },
      handleScale: {
        // Semua gesture enabled by default — explicit untuk clarity.
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false, // biarkan browser scroll page vertikal
      },
    });

    const series = chart.addSeries(LineSeries, {
      color: readCssToken("--color-primary", "#1a1d26"),
      lineWidth: 2,
      // Format price di crosshair label — "12,345 km" dengan separator locale-aware.
      // Note: lightweight-charts pakai `priceFormat.formatter` untuk custom.
      priceFormat: {
        type: "custom",
        formatter: (value: number) =>
          `${Math.round(value).toLocaleString()} km`,
        minMove: 1,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Track visible range → detect (a) zoom state, (b) active preset saat
    // user manual gesture.
    //
    // API v5: subscribeVisibleTimeRangeChange returns void; unsubscribe
    // butuh dipanggil dengan handler reference yang sama.
    //
    // Kalau `userGesturingRef` false berarti perubahan range berasal dari
    // programmatic call (applyRange / fitContent di data effect) —
    // activePreset sudah di-set langsung di sana, tidak perlu override.
    const rangeHandler = (range: { from: unknown; to: unknown } | null) => {
      // Always read latest chartData via ref — avoid stale closure.
      const data = chartDataRef.current;
      // Always update isZoomed — cheap & no state conflict.
      if (!range || data.length < 2) {
        setIsZoomed(false);
        return;
      }
      const first = data[0]!.time as number;
      const last = data[data.length - 1]!.time as number;
      const rangeFrom = range.from as number;
      const rangeTo = range.to as number;
      const totalSpan = last - first;
      const visibleSpan = rangeTo - rangeFrom;
      const isFullView = visibleSpan >= totalSpan * 0.95;
      setIsZoomed(!isFullView);

      // ⚡ Cuma auto-detect kalau user LAGI gesture di canvas.
      // Programmatic apply (via button click) tidak trigger canvas events,
      // jadi flag tetap false → state activePreset yang sudah di-set di
      // applyRange tetap dipakai.
      if (!userGesturingRef.current) return;

      // Manual gesture — derive activePreset dari visible range.
      if (isFullView) {
        setActivePreset("ALL");
        return;
      }

      // Range harus "menempel" ke data terbaru (bukan di-pan ke masa lampau).
      // Toleransi 7 hari — longgar untuk absorb padding + user precision.
      const endsRecent = Math.abs(rangeTo - last) < 7 * 86_400;
      if (!endsRecent) {
        setActivePreset(null);
        return;
      }

      // Compare span ke setiap preset. Toleransi 7 hari.
      const presetEntries = Object.entries(PRESET_MONTHS) as [
        Exclude<RangePreset, "ALL">,
        number,
      ][];
      let matched: RangePreset | null = null;
      for (const [key, months] of presetEntries) {
        const targetSec = (months * MS_PER_APPROX_MONTH) / 1000;
        if (Math.abs(visibleSpan - targetSec) < 7 * 86_400) {
          matched = key;
          break;
        }
      }
      setActivePreset(matched);
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(rangeHandler);

    // ────── User gesture detection ──────
    // Track kapan user aktif berinteraksi dengan chart canvas. Kalau ada
    // touch/mouse/wheel event, flag naik → rangeHandler boleh override
    // activePreset. Kalau tidak (mis. button tap), flag tetap false.
    //
    // touchstart/touchend/touchcancel di element — touches confined to
    // element boundaries by browser.
    //
    // mousedown di element, tapi mouseup di WINDOW — user bisa drag keluar
    // chart bounds sebelum release. Kalau kita bind mouseup ke element,
    // release-outside miss → flag stuck true → next button tap salah.
    //
    // Wheel tidak punya "end" event native — pakai debounce 200ms.
    let wheelEndTimeout: number | null = null;
    const startGesture = () => {
      userGesturingRef.current = true;
    };
    const endGesture = () => {
      userGesturingRef.current = false;
    };
    const onWheel = () => {
      userGesturingRef.current = true;
      if (wheelEndTimeout !== null) window.clearTimeout(wheelEndTimeout);
      wheelEndTimeout = window.setTimeout(endGesture, 200);
    };
    el.addEventListener("touchstart", startGesture, { passive: true });
    el.addEventListener("touchend", endGesture, { passive: true });
    el.addEventListener("touchcancel", endGesture, { passive: true });
    el.addEventListener("mousedown", startGesture);
    // mouseup + mouseleave di window supaya release-outside-chart tetap
    // ter-catch → flag tidak stuck true.
    window.addEventListener("mouseup", endGesture);
    el.addEventListener("wheel", onWheel, { passive: true });

    // Resize handling via ResizeObserver — chart canvas harus resize kalau
    // container width berubah (rotate, split view, dll).
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.floor(entry.contentRect.width);
        if (width > 0) {
          chart.applyOptions({ width });
        }
      }
    });
    resizeObserver.observe(el);

    // Theme sync via MutationObserver di `<html>` class list. Trigger saat
    // user toggle dark mode / color mode → re-apply theme options.
    const themeObserver = new MutationObserver(() => {
      const chartApi = chartRef.current;
      const seriesApi = seriesRef.current;
      if (!chartApi || !seriesApi) return;
      chartApi.applyOptions(readThemeOptions());
      seriesApi.applyOptions({
        color: readCssToken("--color-primary", "#1a1d26"),
      });
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(rangeHandler);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      el.removeEventListener("touchstart", startGesture);
      el.removeEventListener("touchend", endGesture);
      el.removeEventListener("touchcancel", endGesture);
      el.removeEventListener("mousedown", startGesture);
      window.removeEventListener("mouseup", endGesture);
      el.removeEventListener("wheel", onWheel);
      if (wheelEndTimeout !== null) window.clearTimeout(wheelEndTimeout);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — data & theme handled via other effects

  // ────────────────── Data sync (whenever logs change) ──────────────────
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    series.setData(chartData);
    // Fit content = show all data. Kalau user sudah zoomed sebelumnya,
    // reset ke fit view — asumsi user "expect fresh view" saat data changed.
    // Sync activePreset ke "ALL" supaya toolbar highlight match apa yang
    // ditampilkan chart (menghindari mismatch: chart full view tapi tombol
    // "3M" highlighted).
    chart.timeScale().fitContent();
    setActivePreset("ALL");
  }, [chartData]);

  // ────────────────── Range preset handlers ──────────────────
  // Simple flow karena kita tidak perlu race dengan rangeHandler:
  //   1. setActivePreset(preset) — state langsung update.
  //   2. Apply chart range. rangeHandler fire, tapi `userGesturingRef`
  //      false (user tap button, bukan canvas) → skip override.
  //
  // Anchor `to` ke data terakhir (bukan `Date.now()`) supaya kalau user's
  // latest entry sudah lama, tap "1M" tidak render 1 bulan kosong di kanan.
  const applyRange = useCallback(
    (preset: RangePreset) => {
      const chart = chartRef.current;
      if (!chart || chartData.length < 2) return;

      setActivePreset(preset);

      if (preset === "ALL") {
        chart.timeScale().fitContent();
        return;
      }

      const dataEnd = chartData[chartData.length - 1]!.time as number;
      const monthSec = (PRESET_MONTHS[preset] * MS_PER_APPROX_MONTH) / 1000;
      const startSeconds = dataEnd - monthSec;
      chart.timeScale().setVisibleRange({
        from: startSeconds as UTCTimestamp,
        to: dataEnd as UTCTimestamp,
      });
    },
    [chartData],
  );

  const resetZoom = useCallback(() => {
    setActivePreset("ALL");
    chartRef.current?.timeScale().fitContent();
  }, []);

  // ────────────────── Render ──────────────────

  if (!logs || logs.length < 2) {
    return (
      <div className="py-8 text-center">
        <div className="mb-2 text-3xl">📈</div>
        <p className="text-sm text-(--color-text-muted)">
          {t("mileageChart.noData")}
        </p>
      </div>
    );
  }

  const presetLabels: Record<RangePreset, string> = {
    "1M": t("mileageChart.range1M"),
    "3M": t("mileageChart.range3M"),
    "6M": t("mileageChart.range6M"),
    "1Y": t("mileageChart.range1Y"),
    ALL: t("mileageChart.rangeAll"),
  };

  return (
    <div>
      {/* Toolbar — preset buttons + reset.
          Active preset di-highlight via inverted bg (bg-text + text-bg),
          konsisten dengan Binance/Coinbase mobile pattern. Preset auto-
          match visible range (lihat rangeHandler) — jadi kalau user pinch
          ke rentang yang match 3M, tombol 3M ikut highlight otomatis. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["1M", "3M", "6M", "1Y", "ALL"] as RangePreset[]).map((preset) => {
            const active = activePreset === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => applyRange(preset)}
                aria-pressed={active}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-all active:scale-95 ${
                  active
                    ? "bg-(--color-text) text-(--color-bg) shadow-sm"
                    : "bg-(--color-surface-alt) text-(--color-text-secondary) hover:text-(--color-text)"
                }`}
              >
                {presetLabels[preset]}
              </button>
            );
          })}
        </div>
        {isZoomed && activePreset === null && (
          <button
            type="button"
            onClick={resetZoom}
            className="rounded-full bg-(--color-surface-alt) px-2.5 py-1 text-[10px] font-bold text-(--color-text) transition-all hover:bg-(--color-border)/60 active:scale-95"
          >
            {t("mileageChart.reset")}
          </button>
        )}
      </div>

      {/* Chart container.
          `touch-pan-y` = allow browser vertical page scroll pada single-
          finger vertical swipe (chart tidak consume). Horizontal pan +
          pinch tetap passed ke lightweight-charts. Kalau pakai `touch-none`,
          user tidak bisa scroll page ke bawah kalau finger kebetulan
          mendarat di chart — bad mobile UX.
          Height fixed via inline style karena lightweight-charts pakai
          numeric height option — hindari mismatch dengan Tailwind h-56. */}
      <div
        ref={containerRef}
        className="w-full touch-pan-y select-none"
        style={{ height: 224 }}
      />

      {/* Affordance subtle — kasih tahu user chart bisa di-gesture. */}
      <p className="mt-1.5 text-center text-[10px] text-(--color-text-muted)">
        {t("mileageChart.zoomHint")}
      </p>
    </div>
  );
}
