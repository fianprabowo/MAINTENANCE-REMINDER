"use client";

import { useTranslation, type TranslationKey } from "@/lib/i18n";

interface StatusBadgeProps {
  status: "good" | "warning" | "critical";
}

// Label di-mapping ke i18n key. Styling (warna) tidak ikut locale — cukup
// aman di-static.
const statusConfig: Record<
  StatusBadgeProps["status"],
  { bg: string; text: string; dot: string; labelKey: TranslationKey }
> = {
  good: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    labelKey: "status.ok",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    labelKey: "status.warning",
  },
  critical: {
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
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
