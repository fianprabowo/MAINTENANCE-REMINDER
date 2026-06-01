"use client";

type Zone = "good" | "warn" | "bad";

// Status thresholds per spec:
//   ≥ 50%  → Aman
//   20–49% → Waspada
//   < 20%  → Segera isi bensin
function zoneFromFuel(p: number): Zone {
  if (p >= 50) return "good";
  if (p >= 20) return "warn";
  return "bad";
}

const zoneUi: Record<Zone, { stroke: string; label: string; sub: string }> = {
  good: {
    stroke: "stroke-emerald-500",
    label: "Aman",
    sub: "Masih nyaman untuk jalan",
  },
  warn: {
    stroke: "stroke-amber-500",
    label: "Waspada",
    sub: "Pertimbangkan isi ulang",
  },
  bad: {
    stroke: "stroke-red-500",
    label: "Segera",
    sub: "Segera isi bensin",
  },
};

/** Hero ring untuk level bensin (mobil / motor tanpa data interval oli di hero). */
export default function FuelLevelHero({ level }: { level: number }) {
  const p = Math.min(100, Math.max(0, level));
  const zone = zoneFromFuel(p);
  const ui = zoneUi[zone];
  const r = 52;
  const c = 58;
  const circumference = 2 * Math.PI * r;
  const dash = (circumference * p) / 100;

  return (
    <div
      className="rounded-2xl border border-(--color-border)/70 bg-(--color-surface) p-6 shadow-md"
      aria-label={`Level bensin ${p} persen`}
    >
      <p className="text-center text-[11px] font-bold uppercase tracking-wider text-(--color-text-muted)">
        Level bensin
      </p>

      <div className="relative mx-auto mt-4 flex h-[9.5rem] w-[9.5rem] items-center justify-center">
        <svg viewBox="0 0 116 116" className="h-full w-full -rotate-90" aria-hidden>
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-(--color-border)/55"
          />
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className={ui.stroke}
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: "stroke-dasharray 0.7s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className={`text-4xl font-black tabular-nums tracking-tight ${
              zone === "good"
                ? "text-emerald-600 dark:text-emerald-400"
                : zone === "warn"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400"
            }`}
          >
            {p}%
          </span>
          <span className="mt-1 text-xs font-bold text-(--color-text-secondary)">{ui.label}</span>
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-(--color-text-secondary)">{ui.sub}</p>
    </div>
  );
}
