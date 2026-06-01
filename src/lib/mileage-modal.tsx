"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelectedVehicle } from "@/lib/selected-vehicle";
import { getLatestMileageKm } from "@/lib/supabase";
import AddMileageModal from "@/components/AddMileageModal";

type MileageModalContextValue = {
  openMileageModal: () => Promise<void>;
  mileageModalOpen: boolean;
};

const MileageModalContext = createContext<MileageModalContextValue | null>(null);

export function useMileageModal() {
  const v = useContext(MileageModalContext);
  if (!v) throw new Error("useMileageModal must be used within MileageModalProvider");
  return v;
}

export function MileageModalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { selectedVehicleId, ready } = useSelectedVehicle();
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [minMileage, setMinMileage] = useState(0);

  const openMileageModal = useCallback(async () => {
    if (!ready) return;
    if (!selectedVehicleId) {
      router.push("/overview");
      return;
    }
    const km = await getLatestMileageKm(selectedVehicleId);
    setMinMileage(km);
    setVehicleId(selectedVehicleId);
    setOpen(true);
  }, [ready, selectedVehicleId, router]);

  const value = useMemo(
    () => ({ openMileageModal, mileageModalOpen: open }),
    [openMileageModal, open],
  );

  return (
    <MileageModalContext.Provider value={value}>
      {children}
      <AddMileageModal
        open={open}
        onClose={() => setOpen(false)}
        vehicleId={vehicleId}
        minMileage={minMileage}
        title="Perbarui kilometer"
        onSaved={async () => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("mr:vehicle-data-changed"));
          }
        }}
      />
    </MileageModalContext.Provider>
  );
}
