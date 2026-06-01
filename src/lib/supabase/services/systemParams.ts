import { createClient } from "@supabase/supabase-js";

/**
 * Layer flag aplikasi (`public.system_parameter`).
 *
 * - Sengaja tidak memakai singleton client app, agar:
 *   1) Aman dipanggil dari Server Component / Route Handler tanpa nyangkut auth state browser.
 *   2) Kalau env tidak terset (mis. saat `next build`), helper return null tanpa nge-crash.
 * - Tabel `system_parameter` dapat di-SELECT publik (RLS), tulis hanya via service_role.
 * - Tipe kolom `value` adalah `text`. Untuk flag boolean, konvensinya simpan string `'true'` / `'false'`.
 * - Default fail-safe: kalau row tidak ada / value bukan `'true'` (case-insensitive) / error koneksi
 *   → `isFeatureEnabled` mengembalikan `false`.
 */

function makeReadOnlyClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "maintenance-reminder/system-parameter" } },
  });
}

/** Parse value string ke boolean dengan toleran whitespace + casing. Default false. */
function parseBoolFlag(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  return raw.trim().toLowerCase() === "true";
}

/** Ambil nilai mentah flag (string apa adanya). `null` bila row tidak ada / error / env belum terset. */
export async function fetchSystemFlag(key: string): Promise<string | null> {
  const client = makeReadOnlyClient();
  if (!client) return null;
  const { data, error } = await client
    .from("system_parameter")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return null;
  const raw = (data?.value as unknown) ?? null;
  return typeof raw === "string" ? raw : null;
}

/**
 * Cek apakah flag bernilai `'true'` (lenient: trim + lowercase).
 * Default false (fail-safe) bila row tidak ada / nilai bukan 'true' / error koneksi.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const raw = await fetchSystemFlag(key);
  return parseBoolFlag(raw);
}

/** Ambil banyak flag boolean sekaligus dalam satu round-trip. */
export async function isFeaturesEnabled<K extends string>(
  keys: readonly K[],
): Promise<Record<K, boolean>> {
  const out = Object.fromEntries(keys.map((k) => [k, false])) as Record<K, boolean>;
  const client = makeReadOnlyClient();
  if (!client || keys.length === 0) return out;
  const { data, error } = await client
    .from("system_parameter")
    .select("key, value")
    .in("key", keys as readonly string[]);
  if (error || !data) return out;
  for (const row of data as Array<{ key: string; value: string | null }>) {
    if ((keys as readonly string[]).includes(row.key) && parseBoolFlag(row.value)) {
      out[row.key as K] = true;
    }
  }
  return out;
}
