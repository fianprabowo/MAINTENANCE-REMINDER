"use client";

import { useTranslation, type TranslationKey } from "@/lib/i18n";

interface StatusBadgeProps {
  status: "good" | "warning" | "critical";
}

// Label di-mapping ke i18n key. Styling tidak ikut locale — cukup aman
// di-static.
//
// Warna via `--zone-*` mode-aware tokens (lihat globals.css):
//   • Grayscale mode: opacity tier (safe=40%/warn=70%/alarm=100%) untuk
//     encode urgency via visual weight, bukan hue. Font-weight juga
//     bertingkat: good=regular, warning=medium, critical=bold.
//   • Color mode: green/amber/red semantic.
// Critical pakai INVERTED chip bg (zone-alarm sebagai bg + color-bg text)
// supaya menonjol seperti "loud" alarm — analog dengan red badge original.
//
// Pengecualian: `good` SELALU hijau (juga di grayscale mode) — keputusan
// produk supaya status "OK" langsung terbaca positif. Warning/critical
// tetap ikut mode.
const statusConfig: Record<
  StatusBadgeProps["status"],
  { bg: string; text: string; dot: string; labelKey: TranslationKey }
> = {
  good: {
    bg: "bg-green-100 dark:bg-green-500/15",
    text: "text-green-700 dark:text-green-400",
    dot: "bg-green-500 dark:bg-green-400",
    labelKey: "status.ok",
  },
  warning: {
    bg: "bg-(--color-surface-alt)",
    text: "text-(--color-text)",
    dot: "bg-(--zone-warn)",
    labelKey: "status.warning",
  },
  critical: {
    bg: "bg-(--zone-alarm)",
    text: "text-(--color-bg) font-bold",
    dot: "bg-(--color-bg)",
    labelKey: "status.critical",
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${config.bg} ${config.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {t(config.labelKey)}
    </span>
  );
}
