"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import ConfirmDialog from "@/components/ConfirmDialog";

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-(--color-primary)" : "bg-(--color-border)"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function ProfilePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [showLogout, setShowLogout] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDarkMode(stored === "dark" || (!stored && prefersDark));
  }, []);

  const handleThemeToggle = (enabled: boolean) => {
    setDarkMode(enabled);
    document.documentElement.classList.toggle("dark", enabled);
    localStorage.setItem("theme", enabled ? "dark" : "light");
  };

  if (authLoading || !user) return null;

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const memberSince = new Date(user.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex min-h-screen flex-col pb-24">
      <main className="flex-1 px-5 pt-6">
        {/* Avatar + Name centered */}
        <div className="flex flex-col items-center pt-4 pb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-(--color-primary-soft) text-3xl font-bold text-(--color-primary) ring-4 ring-(--color-primary)/10">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="mt-4 text-xl font-bold">{user.name}</h1>
          <p className="mt-0.5 text-sm text-(--color-text-secondary)">
            {user.email || user.phone}
          </p>
        </div>

        {/* Account section */}
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
          Account
        </p>
        <div className="rounded-2xl bg-(--color-surface) shadow-sm">
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <UserIcon className="h-5 w-5 text-(--color-text-muted)" />
            <div className="flex-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-(--color-text-muted)">Full name</p>
            </div>
            <ChevronRight className="h-4 w-4 text-(--color-text-muted)/50" />
          </div>

          {user.email && (
            <>
              <div className="mx-4 border-t border-(--color-border)/60" />
              <div className="flex items-center gap-3.5 px-4 py-3.5">
                <MailIcon className="h-5 w-5 text-(--color-text-muted)" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{user.email}</p>
                  <p className="text-xs text-(--color-text-muted)">Email</p>
                </div>
                <ChevronRight className="h-4 w-4 text-(--color-text-muted)/50" />
              </div>
            </>
          )}

          {user.phone && (
            <>
              <div className="mx-4 border-t border-(--color-border)/60" />
              <div className="flex items-center gap-3.5 px-4 py-3.5">
                <PhoneIcon className="h-5 w-5 text-(--color-text-muted)" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{user.phone}</p>
                  <p className="text-xs text-(--color-text-muted)">Phone</p>
                </div>
                <ChevronRight className="h-4 w-4 text-(--color-text-muted)/50" />
              </div>
            </>
          )}

          <div className="mx-4 border-t border-(--color-border)/60" />
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <ShieldIcon className="h-5 w-5 text-(--color-text-muted)" />
            <div className="flex-1">
              <p className="text-sm font-medium capitalize">{user.role}</p>
              <p className="text-xs text-(--color-text-muted)">Role</p>
            </div>
          </div>

          <div className="mx-4 border-t border-(--color-border)/60" />
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <CalendarIcon className="h-5 w-5 text-(--color-text-muted)" />
            <div className="flex-1">
              <p className="text-sm font-medium">{memberSince}</p>
              <p className="text-xs text-(--color-text-muted)">Member since</p>
            </div>
          </div>
        </div>

        {/* Preferences section */}
        <p className="mt-5 mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
          Preferences
        </p>
        <div className="rounded-2xl bg-(--color-surface) shadow-sm">
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <MoonIcon className="h-5 w-5 text-(--color-text-muted)" />
            <div className="flex-1">
              <p className="text-sm font-medium">Dark Mode</p>
              <p className="text-xs text-(--color-text-muted)">
                {darkMode ? "On" : "Off"}
              </p>
            </div>
            <ToggleSwitch checked={darkMode} onChange={handleThemeToggle} />
          </div>
        </div>

        {/* Logout */}
        <div className="mt-5 rounded-2xl bg-(--color-surface) shadow-sm">
          <button
            onClick={() => setShowLogout(true)}
            className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 transition-colors hover:bg-(--color-surface-alt)"
          >
            <LogoutIcon className="h-5 w-5 text-(--color-critical)" />
            <span className="text-sm font-semibold text-(--color-critical)">Logout</span>
          </button>
        </div>
      </main>

      <ConfirmDialog
        open={showLogout}
        title="Sign Out"
        message="Are you sure you want to sign out? You'll need to log in again to access your vehicles."
        confirmLabel="Sign Out"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={handleLogout}
        onCancel={() => setShowLogout(false)}
      />
    </div>
  );
}
