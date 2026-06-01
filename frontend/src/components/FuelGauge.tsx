"use client";

/**
 * Semicircular fuel readout (speedometer-style): arc + needle + E/F ticks.
 */
export default function FuelGauge({ level }: { level: number }) {
  const p = Math.min(100, Math.max(0, level));
  const cx = 110;
  const cy = 108;
  const r = 78;
  const angle = Math.PI * (1 - p / 100);
  const nx = cx + r * Math.cos(angle);
  const ny = cy - r * Math.sin(angle);

  return (
    <div className="relative w-full select-none" aria-label={`Bensin ${p} persen`}>
      <svg viewBox="0 0 220 132" className="mx-auto block h-[9.5rem] w-full max-w-[280px]" aria-hidden>
        <defs>
          <linearGradient id="fuelGaugeArc" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="55%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="fuelGaugeGlow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgb(251 191 36 / 0.35)" />
            <stop offset="100%" stopColor="rgb(34 197 94 / 0.08)" />
          </linearGradient>
        </defs>

        {/* Soft glow under arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="url(#fuelGaugeGlow)"
          strokeWidth="28"
          strokeLinecap="round"
          opacity="0.9"
        />

        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="currentColor"
          className="text-(--color-border)"
          strokeWidth="12"
          strokeLinecap="round"
          pathLength={100}
        />

        {/* Filled portion along arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="url(#fuelGaugeArc)"
          strokeWidth="12"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${p} ${100 - p}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />

        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const ta = Math.PI * (1 - tick / 100);
          const x1 = cx + (r - 4) * Math.cos(ta);
          const y1 = cy - (r - 4) * Math.sin(ta);
          const x2 = cx + (r + 6) * Math.cos(ta);
          const y2 = cy - (r + 6) * Math.sin(ta);
          return (
            <line
              key={tick}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              className="text-(--color-text-muted)"
              strokeWidth={tick === 0 || tick === 100 ? 2.5 : 1.5}
              strokeLinecap="round"
            />
          );
        })}

        {/* Pivot cap */}
        <circle cx={cx} cy={cy} r="9" className="fill-(--color-surface) stroke-(--color-border)" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="4" className="fill-(--color-text)" />

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="currentColor"
          className="text-(--color-text)"
          strokeWidth="3.5"
          strokeLinecap="round"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
        <circle cx={nx} cy={ny} r="5" className="fill-(--color-primary)" />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-2 text-[11px] font-extrabold uppercase tracking-wider text-(--color-text-muted)">
        <span>E</span>
        <span>F</span>
      </div>
    </div>
  );
}
