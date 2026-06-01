"use client";

import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  return (
    <nav className="flex items-center justify-end px-5 py-4">
      <ThemeToggle />
    </nav>
  );
}
