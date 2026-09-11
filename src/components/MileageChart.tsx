"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MileageLog } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";

interface MileageChartProps {
  logs: MileageLog[];
}

export default function MileageChart({ logs }: MileageChartProps) {
  const { t, formatDate } = useTranslation();
  if (!logs || logs.length < 2) {
    return (
      <div className="py-8 text-center">
        <div className="mb-2 text-3xl">📈</div>
        <p className="text-sm text-(--color-text-muted)">
          {t("mileageChart.noData")}
        </p>
      </div>
    );
  }

  const data = [...logs]
    .reverse()
    .map((log) => ({
      // Sumbu X pakai format tanggal locale — otomatis Bahasa Indonesia
      // ketika user pilih Indonesia (mis. "5 Jun" vs "Jun 5").
      date: formatDate(log.created_at, {
        month: "short",
        day: "numeric",
      }),
      km: log.mileage,
    }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "none",
              borderRadius: "16px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
              fontSize: "13px",
            }}
          />
          <Line
            type="monotone"
            dataKey="km"
            stroke="var(--color-primary)"
            strokeWidth={2.5}
            dot={{ fill: "var(--color-primary)", r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
