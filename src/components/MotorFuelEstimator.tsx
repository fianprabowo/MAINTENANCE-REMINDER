"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { MotorSizeClass } from "@/lib/motor-fuel-calc";
import { recordVehicleFuelFill } from "@/lib/supabase";

/* ──────────────────────────────────────────────────────────────────
 * Format / parse helpers
 * ──────────────────────────────────────────────────────────────── */

function digitsOnly(raw: string, maxLen: number) {
  return raw.replace(/\D/g, "").slice(0, maxLen);
}

function todayYmd(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localYmdToIso(ymd: string): string {
  const [ys, ms, ds] = ymd.split("-");
  const y = parseInt(ys ?? "", 10);
  const mo = parseInt(ms ?? "", 10);
  const day = parseInt(ds ?? "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) {
    return new Date().toISOString();
  }
  return new Date(y, mo - 1, day, 12, 0, 0, 0).toISOString();
}

const formatKm = (n: number | null | undefined): string =>
  n != null ? `${n.toLocaleString("id-ID")} km` : "—";

/* ──────────────────────────────────────────────────────────────────
 * Style tokens — netral; warna dipakai hanya untuk primary CTA
 * ──────────────────────────────────────────────────────────────── */

const PRIMARY_BTN =
  "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-(--color-primary) px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-(--color-primary)/30 transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

const SECONDARY_BTN =
  "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm font-semibold text-(--color-text) transition-all duration-200 hover:bg-(--color-surface-alt) active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

const INPUT =
  "w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2.5 text-sm tabular-nums outline-none transition-colors duration-150 focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/20";

const LABEL = "text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)";

/* ──────────────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────────────── */

type Props = {
  vehicleId: string;
  // Disimpan untuk konsistensi tipe call-site & kemungkinan pemakaian future
  // (mis. pesan/kalkulasi yang size-aware). Tidak dipakai di UI saat ini.
  motorSizeClass?: MotorSizeClass;
  latestKm: number | null;
  lastFuelFillMileage: number | null;
  // Prop dipertahankan demi backward-compat di call-site; tidak ditampilkan.
  lastFuelFillAt?: string | null;
  onApplied?: () => void;
  onRequestUpdateMileage?: () => void;
};

export default function MotorFuelEstimator({
  vehicleId,
  latestKm,
  lastFuelFillMileage,
  onApplied,
  onRequestUpdateMileage,
}: Props) {
  /* Manual input state */
  const [manualKm, setManualKm] = useState("");
  const [manualDate, setManualDate] = useState(todayYmd);

  /* Busy flags — discrete agar tombol lain tetap responsif */
  const [fillNowBusy, setFillNowBusy] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);

  const odometerAheadOfFill =
    lastFuelFillMileage != null && latestKm != null && latestKm < lastFuelFillMileage;

  /* ──────────────────────────────────────────────────────────────
   * Handlers
   * ──────────────────────────────────────────────────────────── */

  const recordFill = useCallback(
    async (mileage: number, filled_at?: string) => {
      await recordVehicleFuelFill(vehicleId, {
        mileage_at_fill: mileage,
        filled_at,
        tank_full: true,
      });
      onApplied?.();
    },
    [vehicleId, onApplied],
  );

  const handleFillNow = useCallback(async () => {
    if (latestKm == null) {
      toast.error("Belum ada KM odometer. Catat KM dulu.");
      onRequestUpdateMileage?.();
      return;
    }
    setFillNowBusy(true);
    try {
      await recordFill(latestKm);
      toast.success("Berhasil disimpan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setFillNowBusy(false);
    }
  }, [latestKm, recordFill, onRequestUpdateMileage]);

  const handleManualSave = useCallback(async () => {
    const km = parseInt(manualKm, 10);
    if (!Number.isFinite(km) || km < 0) {
      toast.error("Masukkan KM saat isi (angka ≥ 0)");
      return;
    }
    if (latestKm != null && km > latestKm) {
      toast.error("KM saat isi tidak boleh lebih besar dari odometer terkini");
      return;
    }
    if (!manualDate.trim()) {
      toast.error("Pilih tanggal isi");
      return;
    }
    setManualBusy(true);
    try {
      await recordFill(km, localYmdToIso(manualDate));
      toast.success("Berhasil disimpan");
      setManualKm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setManualBusy(false);
    }
  }, [manualKm, manualDate, latestKm, recordFill]);

  const anyBusy = fillNowBusy || manualBusy;
  const manualValid = manualKm.trim().length > 0 && manualDate.trim().length > 0;

  /* ──────────────────────────────────────────────────────────────
   * Render
   * ──────────────────────────────────────────────────────────── */

  return (
    <div className="rounded-xl border border-(--color-border)/60 bg-(--color-surface) p-4 shadow-sm">
      {/* Title — tanpa paragraf panjang */}
      <p className={LABEL}>Estimasi bensin</p>
      <p className="mt-1 text-xs text-(--color-text-secondary)">
        Gunakan untuk menghitung konsumsi bensin
      </p>

      {/* ── Ringkasan compact — single mini-card, hanya 2 metrik ── */}
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-(--color-surface-alt)/60 p-3 text-sm">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
            KM sekarang
          </dt>
          <dd className="mt-0.5 font-bold tabular-nums text-(--color-text)">
            {formatKm(latestKm)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
            Terakhir isi
          </dt>
          <dd className="mt-0.5 font-bold tabular-nums text-(--color-text)">
            {formatKm(lastFuelFillMileage)}
          </dd>
        </div>
      </dl>

      {/* Inline warnings — tidak nge-card */}
      {latestKm == null && onRequestUpdateMileage ? (
        <button
          type="button"
          onClick={onRequestUpdateMileage}
          className="mt-3 text-xs font-semibold text-(--color-primary) underline-offset-2 transition-colors hover:underline"
        >
          + Tambah KM odometer
        </button>
      ) : null}
      {odometerAheadOfFill ? (
        <p className="mt-3 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          Odometer terkini lebih kecil dari KM isi terakhir — periksa riwayat KM atau catatan isi.
        </p>
      ) : null}

      {/* ── Quick Action — fokus utama, satu tombol primary ───── */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => void handleFillNow()}
          disabled={anyBusy}
          className={PRIMARY_BTN}
        >
          {fillNowBusy ? "Menyimpan…" : "Isi penuh sekarang"}
        </button>
        <p className="mt-1.5 text-center text-[11px] text-(--color-text-muted)">
          Simpan KM sekarang & set tangki 100%
        </p>
      </div>

      {/* ── Manual Input — inline, tidak nge-card berlapis ───── */}
      <div className="mt-5">
        <p className="text-xs font-semibold text-(--color-text-secondary)">
          Atau isi manual
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="fuel-manual-km" className={LABEL}>
              KM saat isi
            </label>
            <input
              id="fuel-manual-km"
              type="text"
              inputMode="numeric"
              value={manualKm}
              onChange={(e) => setManualKm(digitsOnly(e.target.value, 9))}
              className={`${INPUT} mt-1`}
              placeholder="Contoh: 12400"
              disabled={anyBusy}
            />
          </div>
          <div>
            <label htmlFor="fuel-manual-date" className={LABEL}>
              Tanggal
            </label>
            <input
              id="fuel-manual-date"
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className={`${INPUT} mt-1`}
              disabled={anyBusy}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleManualSave()}
          disabled={!manualValid || anyBusy}
          className={`${SECONDARY_BTN} mt-3`}
        >
          {manualBusy ? "Menyimpan…" : "Simpan isi bensin"}
        </button>
      </div>
    </div>
  );
}
