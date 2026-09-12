"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button, SectionLabel, TextInput } from "@/components/ui";
import type { MotorSizeClass } from "@/lib/motor-fuel-calc";
import { recordVehicleFuelFill } from "@/lib/supabase";
import { useAppErrorMessage, useTranslation } from "@/lib/i18n";

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
  const { t, formatNumber } = useTranslation();
  const describeAppError = useAppErrorMessage();
  const formatKm = (n: number | null | undefined): string =>
    n != null ? `${formatNumber(n)} km` : "—";

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
      toast.error(t("motorFuelEstimator.toastNoKm"));
      onRequestUpdateMileage?.();
      return;
    }
    setFillNowBusy(true);
    try {
      await recordFill(latestKm);
      toast.success(t("motorFuelEstimator.toastSaved"));
    } catch (err) {
      toast.error(describeAppError(err, t("motorFuelEstimator.toastSaveFailed")));
    } finally {
      setFillNowBusy(false);
    }
  }, [latestKm, recordFill, onRequestUpdateMileage, t, describeAppError]);

  const handleManualSave = useCallback(async () => {
    const km = parseInt(manualKm, 10);
    if (!Number.isFinite(km) || km < 0) {
      toast.error(t("motorFuelEstimator.toastEnterKm"));
      return;
    }
    if (latestKm != null && km > latestKm) {
      toast.error(t("motorFuelEstimator.toastKmTooHigh"));
      return;
    }
    if (!manualDate.trim()) {
      toast.error(t("motorFuelEstimator.toastSelectDate"));
      return;
    }
    setManualBusy(true);
    try {
      await recordFill(km, localYmdToIso(manualDate));
      toast.success(t("motorFuelEstimator.toastSaved"));
      setManualKm("");
    } catch (err) {
      toast.error(describeAppError(err, t("motorFuelEstimator.toastSaveFailed")));
    } finally {
      setManualBusy(false);
    }
  }, [manualKm, manualDate, latestKm, recordFill, t, describeAppError]);

  const anyBusy = fillNowBusy || manualBusy;
  const manualValid = manualKm.trim().length > 0 && manualDate.trim().length > 0;

  /* ──────────────────────────────────────────────────────────────
   * Render
   * ──────────────────────────────────────────────────────────── */

  return (
    <div className="rounded-xl border border-(--color-border)/60 bg-(--color-surface) p-4 shadow-sm">
      {/* Title — tanpa paragraf panjang */}
      <SectionLabel>{t("motorFuelEstimator.title")}</SectionLabel>
      <p className="mt-1 text-xs text-(--color-text-secondary)">
        {t("motorFuelEstimator.subtitle")}
      </p>

      {/* ── Ringkasan compact — single mini-card, hanya 2 metrik ── */}
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-(--color-surface-alt)/60 p-3 text-sm">
        <div>
          <SectionLabel as="dt">{t("motorFuelEstimator.currentKm")}</SectionLabel>
          <dd className="mt-0.5 font-bold tabular-nums text-(--color-text)">
            {formatKm(latestKm)}
          </dd>
        </div>
        <div>
          <SectionLabel as="dt">{t("motorFuelEstimator.lastFill")}</SectionLabel>
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
          {t("motorFuelEstimator.addKm")}
        </button>
      ) : null}
      {odometerAheadOfFill ? (
        <p className="mt-3 text-[11px] font-bold text-(--color-text)">
          {t("motorFuelEstimator.odometerWarning")}
        </p>
      ) : null}

      {/* ── Quick Action — fokus utama, satu tombol primary ───── */}
      <div className="mt-4">
        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          loading={fillNowBusy}
          disabled={anyBusy}
          onClick={() => void handleFillNow()}
        >
          {fillNowBusy ? t("motorFuelEstimator.saving") : t("motorFuelEstimator.fillNow")}
        </Button>
        <p className="mt-1.5 text-center text-[11px] text-(--color-text-muted)">
          {t("motorFuelEstimator.fillNowHint")}
        </p>
      </div>

      {/* ── Manual Input — inline, tidak nge-card berlapis ───── */}
      <div className="mt-5">
        <SectionLabel className="text-(--color-text-secondary)">
          {t("motorFuelEstimator.manualSection")}
        </SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <SectionLabel className="mb-0">{t("motorFuelEstimator.kmAtFill")}</SectionLabel>
            <TextInput
              id="fuel-manual-km"
              type="text"
              inputMode="numeric"
              value={manualKm}
              onChange={(e) => setManualKm(digitsOnly(e.target.value, 9))}
              placeholder={t("motorFuelEstimator.kmPlaceholder")}
              disabled={anyBusy}
              className="tabular-nums"
              trailingSlot={
                <span className="text-xs font-semibold text-(--color-text-muted)">km</span>
              }
            />
          </div>
          <div className="space-y-1.5">
            <SectionLabel className="mb-0">{t("motorFuelEstimator.date")}</SectionLabel>
            <TextInput
              id="fuel-manual-date"
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              disabled={anyBusy}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          fullWidth
          loading={manualBusy}
          disabled={!manualValid || anyBusy}
          className="mt-3"
          onClick={() => void handleManualSave()}
        >
          {manualBusy ? t("motorFuelEstimator.saving") : t("motorFuelEstimator.saveFill")}
        </Button>
      </div>
    </div>
  );
}
