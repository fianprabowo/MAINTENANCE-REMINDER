"use client";

import { useTranslation, type TranslationKey } from "@/lib/i18n";

export type OilLifeBarVariant = "engine" | "gearbox";

/**
 * Zone tokens — untuk label/desc yang butuh terjemahan kita return `key`
 * bukan string mentah, biar caller (React component) yang translate via `t()`
 * di render-time. Ini mengunci perilaku "locale switch langsung refresh".
 *
 * Fill pakai `--zone-safe|warn|alarm` CSS token yang mode-aware:
 *   • Grayscale mode (default): opacity tier dari `--color-text`
 *     (safe=40%, warn=70%, alarm=100%) → bar tipis→tebal untuk encode
 *     urgency via visual weight, bukan hue.
 *   • Full-color mode (opt-in): green/amber/red semantic.
 *
 * Token definitions ada di `src/app/globals.css` (`--zone-*`).
 */
function zoneStyle(p: number): {
  fill: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
} {
  if (p >= 60)
    return {
      fill: "bg-(--zone-safe)",
      labelKey: "oilLifeBar.statusSafe",
      descKey: "oilLifeBar.descSafe",
    };
  if (p >= 30)
    return {
      fill: "bg-(--zone-warn)",
      labelKey: "oilLifeBar.statusWarn",
      descKey: "oilLifeBar.descWarn",
    };
  return {
    fill: "bg-(--zone-alarm)",
    labelKey: "oilLifeBar.statusUrgent",
    descKey: "oilLifeBar.descUrgent",
  };
}

function VariantIcon({ variant }: { variant: OilLifeBarVariant }) {
  const isEngine = variant === "engine";
  // Variant tint di-neutralize (sebelumnya sky/violet). Login tone monochrome —
  // differentiation cukup dari icon (🛢️ vs ⚙️) + label sublabel. Kalau
  // butuh visual distinction lebih strong, pakai icon size/border weight,
  // bukan hue.
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-(--color-surface-alt) text-2xl shadow-inner ring-1 ring-(--color-border)/60"
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
  const { t } = useTranslation();
  const p = percent == null ? null : Math.max(0, Math.min(100, percent));
  const zone = p == null ? null : zoneStyle(p);
  const compact = density === "compact";
  // Ring + tint di-neutralize (sebelumnya sky vs violet per variant). Login
  // tone flat neutral — cukup satu treatment untuk semua variant.
  const ring = "ring-(--color-border)/30";
  const tint = "from-(--color-surface) to-(--color-surface)";

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
              {t("oilLifeBar.subTitle")}
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
                // Grayscale zone label: warna sama untuk semua tier, urgency
                // encoded via font-weight (safe/warn=bold, urgent=black + wider
                // tracking untuk emphasis).
                <p
                  className={`mt-1 text-[11px] ${p < 30 ? "font-black tracking-wider text-(--color-text)" : "font-bold text-(--color-text-secondary)"}`}
                >
                  {t(zone.labelKey)}
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
          <span>{t("oilLifeBar.needsChange")}</span>
          <span>{t("oilLifeBar.justChanged")}</span>
        </div>
      </div>

      {!compact && p != null && zone && (
        <p className="mt-4 rounded-2xl bg-(--color-bg)/60 px-3 py-2.5 text-xs leading-relaxed text-(--color-text-secondary) ring-1 ring-(--color-border)/40">
          {t(zone.descKey)}
        </p>
      )}

      {insightHint && (
        <p className="mt-3 text-center text-[10px] font-semibold text-(--color-text-muted)">{insightHint}</p>
      )}

      {!compact && (
        // Legend chips — dot warna pakai zone token yang sama dengan bar
        // fill supaya legend visually match dengan actual bar state di
        // both modes (grayscale & color).
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-(--color-surface-alt) px-2.5 py-1 text-[10px] font-semibold text-(--color-text-secondary)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--zone-safe)" />
            {t("oilLifeBar.legendSafe")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-(--color-surface-alt) px-2.5 py-1 text-[10px] font-semibold text-(--color-text-secondary)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--zone-warn)" />
            {t("oilLifeBar.legendWarn")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-(--color-surface-alt) px-2.5 py-1 text-[10px] font-semibold text-(--color-text)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--zone-alarm)" />
            {t("oilLifeBar.legendUrgent")}
          </span>
        </div>
      )}
    </div>
  );
}
