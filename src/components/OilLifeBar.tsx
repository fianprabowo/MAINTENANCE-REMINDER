"use client";

export type OilLifeBarVariant = "engine" | "gearbox";

function zoneStyle(p: number): { fill: string; label: string; desc: string } {
  if (p >= 60) return { fill: "bg-emerald-500", label: "Aman", desc: "Masih dalam zona interval referensi." };
  if (p >= 30) return { fill: "bg-amber-500", label: "Waspada", desc: "Rencanakan ganti oli segera." };
  return { fill: "bg-red-500", label: "Segera ganti", desc: "Interval sudah mendekati atau melewati batas." };
}

function VariantIcon({ variant }: { variant: OilLifeBarVariant }) {
  const isEngine = variant === "engine";
  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-inner ${
        isEngine
          ? "bg-sky-500/15 ring-1 ring-sky-500/25 dark:bg-sky-400/10 dark:ring-sky-400/20"
          : "bg-violet-500/15 ring-1 ring-violet-500/25 dark:bg-violet-400/10 dark:ring-violet-400/20"
      }`}
      aria-hidden
    >
      {isEngine ? "🛢️" : "⚙️"}
    </div>
  );
}

export default function OilLifeBar({
  percent,
  label,
  sublabel,
  variant = "engine",
  density = "default",
  insightHint,
}: {
  percent: number | null;
  label: string;
  sublabel?: string;
  variant?: OilLifeBarVariant;
  /** `compact`: ringkas untuk Home — tanpa legenda zona & deskripsi panjang */
  density?: "default" | "compact";
  /** Teks kecil di bawah (mis. “Tap untuk detail”) */
  insightHint?: string;
}) {
  const p = percent == null ? null : Math.max(0, Math.min(100, percent));
  const zone = p == null ? null : zoneStyle(p);
  const compact = density === "compact";
  const ring = compact
    ? "ring-(--color-border)/30"
    : variant === "engine"
      ? "ring-sky-500/20 dark:ring-sky-400/15"
      : "ring-violet-500/20 dark:ring-violet-400/15";
  const tint = compact
    ? "from-(--color-surface) to-(--color-surface)"
    : variant === "engine"
      ? "from-sky-500/[0.07] via-(--color-surface) to-(--color-surface)"
      : "from-violet-500/[0.08] via-(--color-surface) to-(--color-surface)";

  return (
    <div
      className={`overflow-hidden border border-(--color-border)/70 bg-gradient-to-br ${tint} ring-1 ${ring} ${compact ? "rounded-2xl p-4 shadow-none" : "rounded-3xl p-5 shadow-sm"}`}
    >
      <div className={`flex items-start ${compact ? "gap-3" : "gap-4"}`}>
        <div className="shrink-0">
          {compact ? (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--color-surface-alt) text-xl ring-1 ring-(--color-border)/50"
              aria-hidden
            >
              {variant === "engine" ? "🛢️" : "⚙️"}
            </div>
          ) : (
            <VariantIcon variant={variant} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-(--color-text-muted)">{label}</p>
          {!compact && (
            <p className="mt-0.5 text-base font-extrabold tracking-tight text-(--color-text)">
              Estimasi sisa interval
            </p>
          )}
          {sublabel && (
            <p
              className={`leading-snug text-(--color-text-secondary) ${compact ? "mt-1 text-sm font-semibold text-(--color-text)" : "mt-1.5 text-xs leading-relaxed"}`}
            >
              {sublabel}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {p == null ? (
            <span className={`font-black tabular-nums text-(--color-text-muted) ${compact ? "text-2xl" : "text-2xl"}`}>
              —
            </span>
          ) : (
            <>
              <p
                className={`font-black tabular-nums tracking-tight text-(--color-text) ${compact ? "text-2xl" : "text-3xl"}`}
              >
                {p}%
              </p>
              {zone && (
                <p
                  className={`mt-1 text-[11px] font-bold ${p >= 60 ? "text-emerald-600 dark:text-emerald-400" : p >= 30 ? "text-amber-700 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}
                >
                  {zone.label}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className={compact ? "mt-3" : "mt-5"}>
        <div className="relative h-4 overflow-hidden rounded-full bg-(--color-border)/45 ring-1 ring-(--color-border)/30">
          {p == null ? (
            <div className="h-full w-full animate-pulse bg-(--color-border)/35" />
          ) : (
            <div
              className={`h-full rounded-full shadow-sm transition-all duration-700 ease-out ${zone?.fill ?? "bg-(--color-border)"}`}
              style={{ width: `${p}%` }}
            />
          )}
        </div>
        <div className="mt-2 flex justify-between gap-2 text-[10px] font-semibold text-(--color-text-muted)">
          <span>Perlu ganti</span>
          <span>Baru ganti</span>
        </div>
      </div>

      {!compact && p != null && zone && (
        <p className="mt-4 rounded-2xl bg-(--color-bg)/60 px-3 py-2.5 text-xs leading-relaxed text-(--color-text-secondary) ring-1 ring-(--color-border)/40">
          {zone.desc}
        </p>
      )}

      {insightHint && (
        <p className="mt-3 text-center text-[10px] font-semibold text-(--color-text-muted)">{insightHint}</p>
      )}

      {!compact && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300/90">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ≥60% aman
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-900 dark:text-amber-200/85">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            30–59% waspada
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/12 px-2.5 py-1 text-[10px] font-semibold text-red-800 dark:text-red-300/90">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {"<"}30% segera
          </span>
        </div>
      )}
    </div>
  );
}
