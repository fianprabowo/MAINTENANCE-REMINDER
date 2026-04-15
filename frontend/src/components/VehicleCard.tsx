import Link from "next/link";
import { Vehicle } from "@/lib/types";
import StatusBadge from "./StatusBadge";

interface VehicleCardProps {
  vehicle: Vehicle;
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function FuelIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17" />
      <path d="M15 10h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2v0a1 1 0 0 0 1-1V9l-3-3" />
      <path d="M3 22h12" />
      <path d="M7 9h4" />
    </svg>
  );
}

function FuelBar({ level }: { level: number }) {
  const color =
    level > 50 ? "bg-(--color-good)" : level > 20 ? "bg-(--color-warning)" : "bg-(--color-critical)";

  return (
    <div className="flex items-center gap-1.5">
      <FuelIcon className="h-3 w-3 text-(--color-text-muted)" />
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-(--color-border)/60">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, level))}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-(--color-text-muted)">{level}%</span>
    </div>
  );
}

export default function VehicleCard({ vehicle }: VehicleCardProps) {
  const typeIcon = vehicle.type === "car" ? "🚗" : "🏍️";

  return (
    <Link href={`/vehicles/${vehicle.id}`}>
      <div className="group flex items-center gap-3.5 rounded-2xl bg-(--color-surface) p-4 shadow-sm transition-all hover:shadow-md active:scale-[0.99]">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-surface-alt) text-2xl leading-none">
          {typeIcon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-(--color-text) group-hover:text-(--color-primary) transition-colors">
              {vehicle.name}
            </h3>
            <StatusBadge status={vehicle.status} />
          </div>

          <p className="mt-0.5 text-xs text-(--color-text-muted)">
            {vehicle.brand} · {vehicle.year}
          </p>

          <div className="mt-1.5">
            <FuelBar level={vehicle.fuel_level} />
          </div>
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-(--color-text-muted)/40" />
      </div>
    </Link>
  );
}
