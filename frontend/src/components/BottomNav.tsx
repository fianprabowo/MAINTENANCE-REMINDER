"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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

  if (!user) return null;

  const isHome = pathname === "/dashboard";
  const isAdd = pathname === "/vehicles/add";
  const isProfile = pathname === "/profile";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto flex w-full max-w-md items-center justify-around rounded-full bg-(--color-surface) px-4 py-2.5 shadow-lg shadow-black/8 dark:shadow-black/30 border border-(--color-border)/40">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center gap-0.5 px-5 py-1 transition-colors ${
            isHome
              ? "text-(--color-primary)"
              : "text-(--color-text-muted) hover:text-(--color-text-secondary)"
          }`}
        >
          <HomeIcon active={isHome} />
          <span className="text-[10px] font-semibold">Home</span>
        </Link>

        <Link
          href="/vehicles/add"
          className={`-mt-5 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all ${
            isAdd
              ? "bg-(--color-primary) text-white shadow-(--color-primary)/30"
              : "bg-(--color-primary) text-white shadow-(--color-primary)/30 hover:brightness-110 active:scale-95"
          }`}
        >
          <PlusIcon />
        </Link>

        <Link
          href="/profile"
          className={`flex flex-col items-center gap-0.5 px-5 py-1 transition-colors ${
            isProfile
              ? "text-(--color-primary)"
              : "text-(--color-text-muted) hover:text-(--color-text-secondary)"
          }`}
        >
          <ProfileIcon active={isProfile} />
          <span className="text-[10px] font-semibold">Profile</span>
        </Link>
      </div>
    </div>
  );
}
