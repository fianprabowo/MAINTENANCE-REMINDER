export function CardSkeleton() {
  return (
    <div className="animate-pulse flex items-center gap-3.5 rounded-2xl bg-(--color-surface) p-4">
      <div className="h-11 w-11 shrink-0 rounded-xl bg-(--color-border)/50" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-24 rounded-md bg-(--color-border)/50" />
          <div className="h-5 w-14 rounded-full bg-(--color-border)/40" />
        </div>
        <div className="h-3 w-16 rounded-md bg-(--color-border)/40" />
        <div className="h-1.5 w-14 rounded-full bg-(--color-border)/40" />
      </div>
      <div className="h-4 w-4 rounded bg-(--color-border)/30" />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-5 px-5">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-(--color-border)/60" />
        <div className="space-y-2">
          <div className="h-5 w-40 rounded-lg bg-(--color-border)/60" />
          <div className="h-3 w-28 rounded-lg bg-(--color-border)/60" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-(--color-border)/60" />
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="animate-pulse space-y-4 px-5">
      <div className="h-12 w-full rounded-2xl bg-(--color-border)/60" />
      <div className="h-12 w-full rounded-2xl bg-(--color-border)/60" />
      <div className="h-12 w-full rounded-2xl bg-(--color-border)/60" />
      <div className="h-12 w-32 rounded-2xl bg-(--color-border)/60" />
    </div>
  );
}
