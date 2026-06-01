export interface User {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface MotorcycleCategory {
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
}

/**
 * Brand+model preset used by the "Tambah motor" dropdown to auto-fill tank
 * capacity and fuel efficiency. `fuel_efficiency_km_l_min/_max` represent the
 * reference range; the UI uses the midpoint as the actual default value.
 */
export interface MotorcycleModel {
  id: string;
  category_id: string;
  brand: string;
  model_name: string;
  tank_capacity_l: number;
  fuel_efficiency_km_l_min: number;
  fuel_efficiency_km_l_max: number;
  sort_order: number;
}

export interface VehicleOilService {
  vehicle_id: string;
  last_engine_oil_km: number | null;
  last_engine_oil_date: string | null;
  last_gearbox_oil_km: number | null;
  last_gearbox_oil_date: string | null;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  user_id: string;
  name: string;
  type: "motorcycle" | "car";
  brand: string;
  year: number;
  /**
   * Tank fuel level percentage (0–100). Derived at read time from
   * `tank_capacity_l`, `fuel_efficiency_km_l`, `last_fuel_fill_mileage`, and
   * `current_mileage_km` so it always reflects the latest odometer reading.
   * The underlying DB column is kept around for backward compatibility but is
   * no longer the source of truth.
   */
  fuel_level: number;
  /** Tank capacity in liters (basis for fuel_level derivation). */
  tank_capacity_l: number | null;
  /** Reference fuel efficiency in km per liter. */
  fuel_efficiency_km_l: number | null;
  /** Latest odometer reading (km) — denormalized from mileage_logs by trigger. */
  current_mileage_km: number | null;
  /** Odometer km when user last recorded a full tank (optional). */
  last_fuel_fill_mileage: number | null;
  /** ISO timestamp when that fill was recorded. */
  last_fuel_fill_at: string | null;
  notes?: string;
  status: "good" | "warning" | "critical";
  motorcycle_category_id?: string | null;
  /** Denormalized label for list cards when joined from DB */
  motorcycle_category_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MileageLog {
  id: string;
  vehicle_id: string;
  mileage: number;
  created_at: string;
}

export interface Reminder {
  id: string;
  vehicle_id: string;
  service_type: "light" | "heavy";
  /**
   * Categorical preset chosen in the UI ("oil_change", "cvt", …). Optional
   * for backward-compat with rows created before migration 002. See
   * `lib/reminder-presets.ts` for the canonical list.
   */
  preset_slug?: string | null;
  km_interval: number;
  date_interval_days: number;
  last_service_km: number;
  last_service_date?: string;
  next_due_km: number;
  next_due_date?: string;
  is_overdue_km?: boolean;
  is_overdue_date?: boolean;
  /**
   * Schedule fields (migration 003). Mutually exclusive aux fields per
   * `schedule_kind`:
   *   once    → schedule_once_at
   *   daily   → none
   *   weekly  → schedule_weekdays (0..6, 0 = Sunday)
   *   monthly → schedule_day_of_month (1..31)
   * `null` everywhere ⇒ legacy `date_interval_days` is the time trigger.
   */
  schedule_kind?: "once" | "daily" | "weekly" | "monthly" | null;
  schedule_once_at?: string | null;
  schedule_weekdays?: number[] | null;
  schedule_day_of_month?: number | null;
  /**
   * Migration 004 — what to do once `next_due_km` is reached.
   *   'once'  → flag as "Telat" once and stay there
   *   'daily' → keep nagging daily until user resolves
   * Defaults to 'once' for backward-compat.
   */
  km_alert_mode?: "once" | "daily";
  /**
   * Migration 005 — anti-spam state for the notification engine.
   *  - `last_notified_at`: when the most recent notification was emitted.
   *  - `last_notified_type`: which kind we last sent.
   * Both reset to null when the reminder snapshot is reset (auto-reset
   * after a matching service record, or manual "tandai sudah servis").
   */
  last_notified_at?: string | null;
  last_notified_type?: "mendekati" | "terlewat" | null;
  created_at: string;
  updated_at: string;
}

/** Notification kinds emitted by the engine. Open enum so future categories
 *  (`service_logged`, `mileage_milestone`, …) don't break consumers. */
export type NotificationKind = "reminder_mendekati" | "reminder_terlewat" | (string & {});

export interface AppNotification {
  id: string;
  user_id: string;
  vehicle_id: string;
  reminder_id?: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Relative path the bell/inbox should navigate to on tap. */
  link_to?: string | null;
  /** ISO timestamp; null ⇒ unread. */
  read_at?: string | null;
  created_at: string;
}

/**
 * Pre-reset snapshot of a reminder, captured before an auto-reset. Used to
 * power the "Undo" toast surfaced after the user logs a service record.
 */
export interface ReminderResetSnapshot {
  id: string;
  reminder_id: string;
  user_id: string;
  service_record_id?: string | null;
  /** Subset of reminder columns we revert on undo. */
  snapshot: {
    km_interval: number;
    last_service_km: number;
    last_service_date: string | null;
    next_due_km: number;
    next_due_date: string | null;
    last_notified_at: string | null;
    last_notified_type: "mendekati" | "terlewat" | null;
  };
  created_at: string;
}

/** Sparepart / biaya per baris (harga integer, Rupiah penuh). */
export interface ServicePartLine {
  name: string;
  price: number;
  /**
   * Tag standar untuk part. Diisi otomatis saat user tap chip "Tambah cepat"
   * di modal servis (mis. `spark_plug`, `air_filter`, `v_belt`). Free-text
   * (user ketik manual) menyisakan ini `null`/`undefined` — tidak akan
   * ditracking di halaman Kondisi Part. Lihat `lib/part-kinds.ts` untuk slug
   * yang valid.
   */
  kind_slug?: string | null;
}

export interface ServiceRecord {
  id: string;
  vehicle_id: string;
  service_type: "light" | "heavy";
  description?: string;
  /** Lokasi / bengkel tempat servis dilakukan (free text, opsional). */
  location?: string;
  /**
   * Penanda eksplisit kalau pada kunjungan servis ini juga dilakukan ganti oli.
   * Dipisahkan menjadi dua flag karena oli mesin dan oli gardan/gearbox bisa
   * diganti bersamaan pada satu servis. Dipakai oleh OilLifeBar untuk derive
   * "last oil change" tanpa bergantung pada keyword di description.
   */
  changed_engine_oil: boolean;
  changed_gearbox_oil: boolean;
  mileage_at_service: number;
  serviced_at: string;
  created_at: string;
  parts: ServicePartLine[];
}

export interface VehicleDetail {
  vehicle: Vehicle;
  motorcycle_category?: MotorcycleCategory | null;
  oil_service?: VehicleOilService | null;
  latest_mileage?: MileageLog;
  reminders: Reminder[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total_items: number;
  total_pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

export interface AuthResponse {
  token: string;
  user: User;
}
