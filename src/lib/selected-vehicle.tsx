"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";

const STORAGE_KEY_PREFIX = "maintenance-reminder:selectedVehicle:";

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

interface SelectedVehicleContextValue {
  /** `null` = belum / tidak ada pilihan; `ready` false saat belum baca localStorage */
  selectedVehicleId: string | null;
  setSelectedVehicleId: (id: string | null) => void;
  ready: boolean;
}

const SelectedVehicleContext = createContext<SelectedVehicleContextValue | undefined>(undefined);

export function SelectedVehicleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedVehicleId, setSelectedVehicleIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setSelectedVehicleIdState(null);
      setReady(true);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(user.id));
      setSelectedVehicleIdState(raw && raw.length > 0 ? raw : null);
    } catch {
      setSelectedVehicleIdState(null);
    }
    setReady(true);
  }, [user]);

  const setSelectedVehicleId = useCallback(
    (id: string | null) => {
      setSelectedVehicleIdState(id);
      if (!user) return;
      try {
        if (id) localStorage.setItem(storageKey(user.id), id);
        else localStorage.removeItem(storageKey(user.id));
      } catch {
        /* ignore quota / private mode */
      }
    },
    [user],
  );

  const value = useMemo(
    () => ({ selectedVehicleId, setSelectedVehicleId, ready }),
    [selectedVehicleId, setSelectedVehicleId, ready],
  );

  return (
    <SelectedVehicleContext.Provider value={value}>{children}</SelectedVehicleContext.Provider>
  );
}

export function useSelectedVehicle() {
  const ctx = useContext(SelectedVehicleContext);
  if (!ctx) throw new Error("useSelectedVehicle must be used within SelectedVehicleProvider");
  return ctx;
}
