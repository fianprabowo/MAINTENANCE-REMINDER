"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  maxHeight?: number;
  error?: boolean;
  disabled?: boolean;
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  required,
  className,
  maxHeight = 260,
  error,
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const scrollToSelected = useCallback(() => {
    if (!listRef.current || !value) return;
    const idx = options.findIndex((o) => o.value === value);
    if (idx < 0) return;
    const el = listRef.current.children[0]?.children[idx] as HTMLElement;
    if (el) {
      el.scrollIntoView({ block: "center" });
    }
  }, [options, value]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(scrollToSelected);
    }
  }, [open, scrollToSelected]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      {required && (
        <input
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 opacity-0"
          value={value}
          required={required}
          onChange={() => { }}
          aria-hidden="true"
        />
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`flex w-full items-center justify-between rounded-2xl border bg-white px-4 py-3.5 text-left text-sm outline-none transition-all dark:bg-(--color-surface) ${disabled
            ? "cursor-not-allowed border-(--color-border)/70 opacity-50"
            : "cursor-pointer"
          } ${!disabled && open
            ? "border-(--color-primary) ring-4 ring-(--color-primary)/15"
            : !disabled && error
              ? "border-red-300 hover:bg-red-50/50 dark:border-red-800/60 dark:hover:bg-red-950/20"
              : !disabled
                ? "border-(--color-border)/70 hover:border-(--color-border) hover:bg-(--color-primary-soft)/50"
                : "border-(--color-border)/70"
          } ${!selected ? "text-(--color-text-muted)" : "font-medium text-(--color-text)"}`}
      >
        <span className="flex items-center gap-2 truncate">
          {selected ? (
            <>
              {selected.icon && <span>{selected.icon}</span>}
              {selected.label}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-(--color-text-muted) transition-transform duration-200 ${open ? "rotate-180" : ""
            }`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-(--color-border) bg-white shadow-xl shadow-black/8 dark:bg-(--color-bg) dark:shadow-black/30"
        >
          <div
            className="overflow-y-auto overscroll-contain py-1.5"
            style={{ maxHeight }}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors ${isSelected
                      ? "bg-(--color-primary-soft)/60 font-semibold text-(--color-text) hover:bg-(--color-primary-soft)/80"
                      : "text-(--color-text) hover:bg-(--color-primary-soft)/50 active:bg-(--color-primary-soft)/60"
                    }`}
                >
                  {option.icon && <span className="text-base">{option.icon}</span>}
                  <span className="flex-1">{option.label}</span>
                  {isSelected && (
                    <CheckIcon className="h-4 w-4 text-(--color-primary)" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
