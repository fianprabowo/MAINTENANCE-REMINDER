import type { AppNotification, MileageLog, MotorcycleCategory, Reminder, ReminderResetSnapshot, ServicePartLine, ServiceRecord, Vehicle, VehicleOilService } from "@/lib/types";

export function mapMotorcycleCategory(row: {
  id: string;
  slug: string;
  name_display: string;
  engine_oil_km_min: number | null;
  engine_oil_km_max: number | null;
  gearbox_oil_km_min: number | null;
  gearbox_oil_km_max: number | null;
  has_engine_oil_interval: boolean;
  has_gearbox_oil_interval: boolean;
  side_oil_note: string | null;
  tips: string | null;
  sort_order: number;
  created_at: string;
}): MotorcycleCategory {
  return {
    id: row.id,
    slug: row.slug,
    name_display: row.name_display,
    engine_oil_km_min: row.engine_oil_km_min,
    engine_oil_km_max: row.engine_oil_km_max,
    gearbox_oil_km_min: row.gearbox_oil_km_min,
    gearbox_oil_km_max: row.gearbox_oil_km_max,
    has_engine_oil_interval: row.has_engine_oil_interval,
    has_gearbox_oil_interval: row.has_gearbox_oil_interval,
    side_oil_note: row.side_oil_note,
    tips: row.tips,
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

export function mapVehicleOilService(row: {
  vehicle_id: string;
  last_engine_oil_km: number | null;
  last_engine_oil_date: string | null;
  last_gearbox_oil_km: number | null;
  last_gearbox_oil_date: string | null;
  updated_at: string;
}): VehicleOilService {
  return {
    vehicle_id: row.vehicle_id,
    last_engine_oil_km: row.last_engine_oil_km,
    last_engine_oil_date: row.last_engine_oil_date,
    last_gearbox_oil_km: row.last_gearbox_oil_km,
    last_gearbox_oil_date: row.last_gearbox_oil_date,
    updated_at: row.updated_at,
  };
}

/**
 * Derive fuel level (% remaining) from the latest odometer reading and the
 * last full-fill anchor. Falls back to the stored snapshot column if the
 * required inputs are missing (e.g. user never recorded an "isi penuh").
 *
 * Behavior notes:
 * - When `current_mileage_km` < `last_fuel_fill_mileage` (odometer rolled back
 *   or bad data), we treat distance as 0 → 100% to avoid scary negative readings.
 * - Result is clamped to [0, 100] and rounded to nearest int for display
 *   parity with how the dashboard / cards render the value.
 */
function deriveFuelLevel(args: {
  storedFuelLevel: number;
  tankCapacityL: number | null;
  efficiencyKmPerL: number | null;
  lastFuelFillMileage: number | null;
  currentMileageKm: number | null;
}): number {
  const { storedFuelLevel, tankCapacityL, efficiencyKmPerL, lastFuelFillMileage, currentMileageKm } = args;

  if (
    tankCapacityL == null ||
    tankCapacityL <= 0 ||
    efficiencyKmPerL == null ||
    efficiencyKmPerL <= 0 ||
    lastFuelFillMileage == null ||
    currentMileageKm == null
  ) {
    return Math.min(100, Math.max(0, Math.round(storedFuelLevel)));
  }

  const distance = Math.max(0, currentMileageKm - lastFuelFillMileage);
  const fuelUsedL = distance / efficiencyKmPerL;
  const remainingL = Math.max(0, tankCapacityL - fuelUsedL);
  const pct = (remainingL / tankCapacityL) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

export function mapVehicle(row: {
  id: string;
  user_id: string;
  name: string;
  type: string;
  brand: string;
  year: number;
  fuel_level: number;
  tank_capacity_l?: number | string | null;
  fuel_efficiency_km_l?: number | string | null;
  current_mileage_km?: number | null;
  last_fuel_fill_mileage?: number | null;
  last_fuel_fill_at?: string | null;
  notes: string | null;
  status: string;
  motorcycle_category_id?: string | null;
  created_at: string;
  updated_at: string;
  motorcycle_categories?: { name_display: string } | null;
}): Vehicle {
  // Postgres NUMERIC ships back as string via PostgREST; coerce defensively.
  const tank =
    row.tank_capacity_l == null
      ? null
      : typeof row.tank_capacity_l === "number"
        ? row.tank_capacity_l
        : Number.parseFloat(row.tank_capacity_l);
  const eff =
    row.fuel_efficiency_km_l == null
      ? null
      : typeof row.fuel_efficiency_km_l === "number"
        ? row.fuel_efficiency_km_l
        : Number.parseFloat(row.fuel_efficiency_km_l);

  const tankSafe = tank != null && Number.isFinite(tank) ? tank : null;
  const effSafe = eff != null && Number.isFinite(eff) ? eff : null;
  const currentKm = row.current_mileage_km ?? null;
  const lastFillKm = row.last_fuel_fill_mileage ?? null;

  const derivedFuelLevel = deriveFuelLevel({
    storedFuelLevel: row.fuel_level,
    tankCapacityL: tankSafe,
    efficiencyKmPerL: effSafe,
    lastFuelFillMileage: lastFillKm,
    currentMileageKm: currentKm,
  });

  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    type: row.type as Vehicle["type"],
    brand: row.brand,
    year: row.year,
    fuel_level: derivedFuelLevel,
    tank_capacity_l: tankSafe,
    fuel_efficiency_km_l: effSafe,
    current_mileage_km: currentKm,
    last_fuel_fill_mileage: lastFillKm,
    last_fuel_fill_at: row.last_fuel_fill_at ?? null,
    notes: row.notes ?? undefined,
    status: row.status as Vehicle["status"],
    motorcycle_category_id: row.motorcycle_category_id ?? null,
    motorcycle_category_name: row.motorcycle_categories?.name_display ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapMileage(row: {
  id: string;
  vehicle_id: string;
  mileage: number;
  created_at: string;
}): MileageLog {
  return {
    id: row.id,
    vehicle_id: row.vehicle_id,
    mileage: row.mileage,
    created_at: row.created_at,
  };
}

export function mapReminder(row: {
  id: string;
  vehicle_id: string;
  service_type: string;
  // Optional in the row type because the column was added in migration 002 —
  // legacy rows from before that migration return undefined here.
  preset_slug?: string | null;
  km_interval: number;
  date_interval_days: number;
  last_service_km: number;
  last_service_date: string | null;
  next_due_km: number;
  next_due_date: string | null;
  // Migration 003 — see lib/reminder-schedule.ts for shape.
  schedule_kind?: string | null;
  schedule_once_at?: string | null;
  schedule_weekdays?: number[] | null;
  schedule_day_of_month?: number | null;
  // Migration 004.
  km_alert_mode?: string | null;
  // Migration 005.
  last_notified_at?: string | null;
  last_notified_type?: string | null;
  created_at: string;
  updated_at: string;
}): Reminder {
  return {
    id: row.id,
    vehicle_id: row.vehicle_id,
    service_type: row.service_type as Reminder["service_type"],
    preset_slug: row.preset_slug ?? null,
    km_interval: row.km_interval,
    date_interval_days: row.date_interval_days,
    last_service_km: row.last_service_km,
    last_service_date: row.last_service_date ?? undefined,
    next_due_km: row.next_due_km,
    next_due_date: row.next_due_date ?? undefined,
    schedule_kind: (row.schedule_kind ?? null) as Reminder["schedule_kind"],
    schedule_once_at: row.schedule_once_at ?? null,
    schedule_weekdays: row.schedule_weekdays ?? null,
    schedule_day_of_month: row.schedule_day_of_month ?? null,
    km_alert_mode: (row.km_alert_mode === "daily" ? "daily" : "once") as Reminder["km_alert_mode"],
    last_notified_at: row.last_notified_at ?? null,
    last_notified_type:
      row.last_notified_type === "mendekati" || row.last_notified_type === "terlewat"
        ? row.last_notified_type
        : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapNotification(row: {
  id: string;
  user_id: string;
  vehicle_id: string;
  reminder_id: string | null;
  kind: string;
  title: string;
  body: string;
  link_to: string | null;
  read_at: string | null;
  created_at: string;
}): AppNotification {
  return {
    id: row.id,
    user_id: row.user_id,
    vehicle_id: row.vehicle_id,
    reminder_id: row.reminder_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link_to: row.link_to,
    read_at: row.read_at,
    created_at: row.created_at,
  };
}

/**
 * Map a `reminder_resets` row. Snapshot is JSONB; we coerce defensively
 * since older snapshots may lack newer fields. Missing fields default to
 * null rather than throwing — undo should keep working across schema
 * evolution within reason.
 */
export function mapReminderReset(row: {
  id: string;
  reminder_id: string;
  user_id: string;
  service_record_id: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
}): ReminderResetSnapshot {
  const s = row.snapshot ?? {};
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const notType = (v: unknown): "mendekati" | "terlewat" | null =>
    v === "mendekati" || v === "terlewat" ? v : null;
  return {
    id: row.id,
    reminder_id: row.reminder_id,
    user_id: row.user_id,
    service_record_id: row.service_record_id,
    snapshot: {
      km_interval: num(s.km_interval),
      last_service_km: num(s.last_service_km),
      last_service_date: str(s.last_service_date),
      next_due_km: num(s.next_due_km),
      next_due_date: str(s.next_due_date),
      last_notified_at: str(s.last_notified_at),
      last_notified_type: notType(s.last_notified_type),
    },
    created_at: row.created_at,
  };
}

function parseNonNegInt(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return Math.max(0, parseInt(raw.trim(), 10));
  }
  return null;
}

function parseServiceParts(raw: unknown): ServicePartLine[] {
  if (!Array.isArray(raw)) return [];
  const out: ServicePartLine[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const price = parseNonNegInt(o.price) ?? 0;
    const qtyRaw = parseNonNegInt(o.qty);
    const unitRaw = parseNonNegInt(o.unit_price);
    const qty = qtyRaw != null && qtyRaw > 0 ? qtyRaw : undefined;
    const unit_price = unitRaw != null && unitRaw > 0 ? unitRaw : undefined;
    const rawKind = o.kind_slug;
    const kind_slug =
      typeof rawKind === "string" && rawKind.trim().length > 0 ? rawKind.trim() : null;
    if (!name && price === 0) continue;
    if (name) {
      const line: ServicePartLine = { name, price, kind_slug };
      if (qty != null) line.qty = qty;
      if (unit_price != null) line.unit_price = unit_price;
      out.push(line);
    }
  }
  return out;
}

export function mapServiceRecord(row: {
  id: string;
  vehicle_id: string;
  service_type: string;
  description: string | null;
  location?: string | null;
  changed_engine_oil?: boolean | null;
  changed_gearbox_oil?: boolean | null;
  mileage_at_service: number;
  serviced_at: string;
  created_at: string;
  parts?: unknown;
  receipt_path?: string | null;
}): ServiceRecord {
  const serviced =
    typeof row.serviced_at === "string" && row.serviced_at.length >= 10
      ? row.serviced_at.slice(0, 10)
      : row.serviced_at;
  const loc = typeof row.location === "string" ? row.location.trim() : "";
  const receipt =
    typeof row.receipt_path === "string" && row.receipt_path.trim().length > 0
      ? row.receipt_path.trim()
      : null;
  return {
    id: row.id,
    vehicle_id: row.vehicle_id,
    service_type: row.service_type as ServiceRecord["service_type"],
    description: row.description ?? undefined,
    location: loc.length > 0 ? loc : undefined,
    changed_engine_oil: row.changed_engine_oil === true,
    changed_gearbox_oil: row.changed_gearbox_oil === true,
    mileage_at_service: row.mileage_at_service,
    serviced_at: serviced,
    created_at: row.created_at,
    parts: parseServiceParts(row.parts),
    receipt_path: receipt,
  };
}

export function enrichReminders(reminders: Reminder[], latestKm: number): Reminder[] {
  const now = new Date();
  return reminders.map((r) => ({
    ...r,
    is_overdue_km: r.next_due_km > 0 && latestKm >= r.next_due_km,
    is_overdue_date: r.next_due_date ? now > new Date(r.next_due_date) : false,
  }));
}
