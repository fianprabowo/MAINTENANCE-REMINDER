"use client";

import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";
import { syncThemeColorMeta } from "@/lib/theme";

export default function ThemeToggle() {
  const { t } = useTranslation();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Safari private mode + strict privacy settings bisa throw pada
    // localStorage read/write — fallback ke prefers-color-scheme.
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {
      /* ignore — private mode */
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored === "dark" || (!stored && prefersDark);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    syncThemeColorMeta(isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    // Persist boleh gagal (private mode / quota) — theme tetap ganti di
    // session ini, tapi tidak bertahan across reload. Better than crash.
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore — private mode / quota */
    }
    syncThemeColorMeta(next);
  };

  return (
    <IconButton
      label={t("themeToggle.toggle")}
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="text-base leading-none"
    >
      {dark ? "☀️" : "🌙"}
    </IconButton>
  );
}
