"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456];

function FixIcons() {
  useEffect(() => {
    // Leaflet default marker URLs break under bundlers; load CDN assets explicitly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  }, []);
  return null;
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom() > 14 ? map.getZoom() : 14);
  }, [center, map]);
  return null;
}

export default function WorkshopMap({
  userLat,
  userLng,
  height = 260,
}: {
  userLat: number | null;
  userLng: number | null;
  height?: number;
}) {
  const center: [number, number] = useMemo(
    () => (userLat != null && userLng != null ? [userLat, userLng] : DEFAULT_CENTER),
    [userLat, userLng],
  );

  return (
    <div
      className="overflow-hidden rounded-3xl border border-(--color-border)/60 shadow-inner"
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={userLat != null ? 14 : 11}
        scrollWheelZoom={false}
        className="h-full w-full rounded-3xl"
        style={{ height }}
      >
        <FixIcons />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter center={center} />
        {userLat != null && userLng != null && (
          <Marker position={[userLat, userLng]}>
            <Popup>
              <span className="text-sm font-semibold">Your location</span>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
