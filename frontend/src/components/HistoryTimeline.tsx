import { MileageLog } from "@/lib/types";

interface HistoryTimelineProps {
  logs: MileageLog[];
}

export default function HistoryTimeline({ logs }: HistoryTimelineProps) {
  if (!logs || logs.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mb-2 text-3xl">📊</div>
        <p className="text-sm text-(--color-text-muted)">No mileage history yet.</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      <div className="absolute left-4 top-3 bottom-3 w-0.5 bg-(--color-border)" />
      {logs.map((log, idx) => (
        <div key={log.id} className="relative flex items-start gap-4 py-3 pl-10">
          <div
            className={`absolute left-2.5 top-4.5 h-3 w-3 rounded-full border-2 border-(--color-surface) ${
              idx === 0 ? "bg-(--color-primary)" : "bg-(--color-border)"
            }`}
          />
          <div className="flex-1">
            <p className="font-bold text-(--color-text)">
              {log.mileage.toLocaleString()} KM
            </p>
            <p className="text-xs text-(--color-text-muted)">
              {new Date(log.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
