/** Tahun produksi: 20 tahun ke belakang sampai tahun berjalan (inklusif). */
export function getVehicleManufactureYearOptions(): { value: string; label: string }[] {
  const current = new Date().getFullYear();
  const oldest = current - 20;
  const out: { value: string; label: string }[] = [];
  for (let y = current; y >= oldest; y--) {
    out.push({ value: String(y), label: String(y) });
  }
  return out;
}
