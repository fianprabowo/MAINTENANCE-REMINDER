import { supabase } from "../client";
import { requireUser } from "../auth-helpers";

export const SERVICE_RECEIPTS_BUCKET = "service-receipts";

const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

function extFromFile(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".png") || file.type === "image/png") return "png";
  if (name.endsWith(".webp") || file.type === "image/webp") return "webp";
  if (name.endsWith(".heic") || file.type === "image/heic") return "heic";
  if (name.endsWith(".heif") || file.type === "image/heif") return "heif";
  return "jpg";
}

function contentTypeForExt(ext: string): string {
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "image/jpeg";
  }
}

/**
 * Path convention (must match storage RLS):
 *   {user_id}/{vehicle_id}/{record_id}/nota.{ext}
 */
export function buildServiceReceiptPath(
  userId: string,
  vehicleId: string,
  recordId: string,
  file: File,
): string {
  const ext = extFromFile(file);
  return `${userId}/${vehicleId}/${recordId}/nota.${ext}`;
}

/**
 * Upload nota ke bucket private. Menggunakan upsert agar replace aman
 * saat user ganti file pada edit servis.
 */
export async function uploadServiceReceipt(params: {
  vehicleId: string;
  recordId: string;
  file: File;
}): Promise<string> {
  const user = await requireUser();
  const path = buildServiceReceiptPath(user.id, params.vehicleId, params.recordId, params.file);
  const ext = extFromFile(params.file);

  const { error } = await supabase.storage
    .from(SERVICE_RECEIPTS_BUCKET)
    .upload(path, params.file, {
      upsert: true,
      contentType: contentTypeForExt(ext),
      cacheControl: "3600",
    });

  if (error) throw new Error(error.message || "Gagal mengunggah nota ke storage");
  return path;
}

export async function removeServiceReceipt(path: string): Promise<void> {
  const trimmed = path.trim();
  if (!trimmed) return;
  await requireUser();
  const { error } = await supabase.storage.from(SERVICE_RECEIPTS_BUCKET).remove([trimmed]);
  if (error) throw new Error(error.message || "Gagal menghapus nota dari storage");
}

/** Signed URL untuk preview/download (bucket private). */
export async function createServiceReceiptSignedUrl(
  path: string,
  expiresInSec = SIGNED_URL_TTL_SEC,
): Promise<string> {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Path nota kosong");
  await requireUser();
  const { data, error } = await supabase.storage
    .from(SERVICE_RECEIPTS_BUCKET)
    .createSignedUrl(trimmed, expiresInSec);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Gagal membuat link nota");
  }
  return data.signedUrl;
}

export async function updateServiceRecordReceiptPath(
  vehicleId: string,
  recordId: string,
  receiptPath: string | null,
): Promise<void> {
  const user = await requireUser();
  const { data: v } = await supabase.from("vehicles").select("user_id").eq("id", vehicleId).maybeSingle();
  if (!v || v.user_id !== user.id) throw new Error("Kendaraan tidak ditemukan");

  const { error } = await supabase
    .from("service_records")
    .update({ receipt_path: receiptPath })
    .eq("id", recordId)
    .eq("vehicle_id", vehicleId);

  if (error) throw new Error(error.message);
}
