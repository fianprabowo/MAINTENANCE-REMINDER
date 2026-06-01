"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useMileageModal } from "@/lib/mileage-modal";
import { useSelectedVehicle } from "@/lib/selected-vehicle";

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
    </svg>
  );
}

function OverviewIcon({ active }: { active: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function PlusIcon({ active }: { active: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 3 : 2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? 0 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 1 0-16 0" />
    </svg>
  );
}

export default function BottomNav() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { openMileageModal, mileageModalOpen } = useMileageModal();
  const { selectedVehicleId, ready: selectionReady } = useSelectedVehicle();

  if (!user) return null;

  if (pathname === "/access") return null;

  const isHome = pathname === "/dashboard";
  const isOverview = pathname === "/overview";
  // Reminder is a per-vehicle route, so we match the trailing segment
  // shape rather than a fixed path. `pathname?.endsWith("/reminder")` is
  // true for `/vehicles/<id>/reminder` and would also match any future
  // route ending in `/reminder` — acceptable since we don't have any
  // other top-level "reminder"-ish routes today.
  const isReminder = !!pathname?.startsWith("/vehicles/") && !!pathname?.endsWith("/reminder");
  const isProfile = pathname === "/profile";

  const handlePlus = () => {
    if (!selectionReady) return;
    if (!selectedVehicleId) {
      router.push("/overview");
      return;
    }
    void openMileageModal();
  };

  // Reminder follows the same "needs vehicle context" pattern as the +KM
  // button: if no vehicle is selected we route the user to the overview
  // (where they can pick / add one) rather than dead-ending.
  const handleReminder = () => {
    if (!selectionReady) return;
    if (!selectedVehicleId) {
      router.push("/overview");
      return;
    }
    router.push(`/vehicles/${selectedVehicleId}/reminder`);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-2 pb-[max(16px,env(safe-area-inset-bottom))] pointer-events-none sm:px-4">
      {/*
        Glass effect breakdown — multi-layer to read as glass even when
        backdrop-blur has nothing to blur (uniform page bg).

        Backdrop layer (real glass when content scrolls behind):
          • bg-white/55 dark:bg-zinc-900/45  → translucent fill
          • backdrop-blur-2xl backdrop-saturate-150  → frosted blur +
            saturation boost (Apple's trick to keep blurred content vivid)

        Faux-refraction layer (works on flat bg too):
          • before:* gradient (top → middle) = the bright "lip" of the
            glass where ambient light catches the rim
          • after:* gradient (middle → bottom) = the dark, weightier base
            of the glass that gives the pill physical depth
          • Both pseudos are pointer-events-none so taps still pass to the
            buttons underneath.

        CSS painting order gotcha:
          Absolutely-positioned pseudos paint *after* non-positioned
          children by default — meaning the overlays would cover the
          icons. Fix: `[&>*]:relative` promotes every direct child into
          the same positioned-painting bucket; tree order then takes over
          and children (which come after ::before/::after in DOM) paint
          on top. This is why we need `relative` on the pill itself too.

        Edge polish:
          • border-white/40 dark:border-white/10  → outer rim
          • ring-1 ring-inset ring-white/30  → uniform inner highlight
          • shadow stays soft so the float doesn't feel heavy
      */}
      <div className="pointer-events-auto relative flex w-full max-w-md items-center justify-between gap-0 overflow-hidden rounded-full border border-white/40 bg-white/55 px-1 py-2 shadow-lg shadow-black/10 ring-1 ring-inset ring-white/30 backdrop-blur-2xl backdrop-saturate-150 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/45 before:via-white/10 before:to-transparent after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-1/2 after:rounded-b-full after:bg-gradient-to-b after:from-transparent after:to-black/[0.06] sm:gap-0.5 sm:px-2 dark:border-white/10 dark:bg-zinc-900/45 dark:shadow-black/40 dark:ring-white/5 dark:before:from-white/15 dark:before:via-white/[0.03] dark:after:to-black/30 [&>*]:relative [&_a]:touch-manipulation [&_a]:transition-transform [&_a]:duration-150 [&_a]:ease-out [&_a:active]:scale-[0.98]">
        <Link
          href="/dashboard"
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 transition-colors ${
            isHome
              ? "text-(--color-primary)"
              : "text-(--color-text-muted) hover:text-(--color-text-secondary)"
          }`}
        >
          <HomeIcon active={isHome} />
          <span className="max-w-[4rem] truncate text-[9px] font-semibold sm:text-[10px]">Home</span>
        </Link>

        <Link
          href="/overview"
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 transition-colors ${
            isOverview
              ? "text-(--color-primary)"
              : "text-(--color-text-muted) hover:text-(--color-text-secondary)"
          }`}
        >
          <OverviewIcon active={isOverview} />
          <span className="max-w-[4rem] truncate text-[9px] font-semibold sm:text-[10px]">Overview</span>
        </Link>

        <button
          type="button"
          onClick={handlePlus}
          aria-label="Input kilometer"
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 transition-colors ${
            mileageModalOpen
              ? "text-(--color-primary)"
              : "text-(--color-text-muted) hover:text-(--color-text-secondary)"
          }`}
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md transition-all sm:h-10 sm:w-10 ${
              mileageModalOpen
                ? "bg-(--color-primary) shadow-(--color-primary)/25 ring-2 ring-white/40"
                : "bg-(--color-primary) shadow-(--color-primary)/20 hover:brightness-110 active:scale-95"
            }`}
          >
            <PlusIcon active={mileageModalOpen} />
          </span>
          <span className="max-w-[4rem] truncate text-[9px] font-semibold sm:text-[10px]">KM</span>
        </button>

        <button
          type="button"
          onClick={handleReminder}
          aria-label="Buka reminder"
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 transition-colors ${
            isReminder
              ? "text-(--color-primary)"
              : "text-(--color-text-muted) hover:text-(--color-text-secondary)"
          }`}
        >
          <BellIcon active={isReminder} />
          <span className="max-w-[4rem] truncate text-[9px] font-semibold sm:text-[10px]">Reminder</span>
        </button>

        <Link
          href="/profile"
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 transition-colors ${
            isProfile
              ? "text-(--color-primary)"
              : "text-(--color-text-muted) hover:text-(--color-text-secondary)"
          }`}
        >
          <ProfileIcon active={isProfile} />
          <span className="max-w-[4rem] truncate text-[9px] font-semibold sm:text-[10px]">Profile</span>
        </Link>
      </div>
    </div>
  );
}
