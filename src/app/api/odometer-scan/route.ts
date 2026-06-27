import { NextResponse } from "next/server";
import {
  normalizeOdometerKm,
  parseOdometerConfidence,
  parseOdometerJson,
  type OdometerConfidence,
} from "@/lib/odometer-normalize";

const GEMINI_MODEL = "gemini-2.5-flash";
const PROMPT = `Baca angka TOTAL odometer dari foto crop dashboard motor ini.
Foto sudah di-crop hanya ke baris angka digital — baca angka yang terlihat.
Layar sering menampilkan format 39815.6: angka sebelum titik = kilometer, digit setelah titik = meter (abaikan).
Contoh: tampilan 39815.6 → km yang benar adalah 39815 (bukan 398156).
Abaikan label, satuan, atau teks di luar angka.
Balas HANYA JSON valid tanpa markdown:
{"km":39815,"confidence":"high"|"medium"|"low"}
- high: angka jelas dan yakin
- medium: angka terbaca tapi ada sedikit keraguan
- low: angka tidak jelas, buram, atau tebakan`;

type ScanBody = {
  image?: string;
  mimeType?: string;
};

export async function POST(request: Request) {
  let body: ScanBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Odometer scan belum dikonfigurasi. Set GEMINI_API_KEY di server." },
      { status: 503 },
    );
  }

  const image = typeof body.image === "string" ? body.image.trim() : "";
  if (!image) {
    return NextResponse.json({ error: "Gambar wajib diisi." }, { status: 400 });
  }

  const mimeType =
    typeof body.mimeType === "string" && body.mimeType.startsWith("image/")
      ? body.mimeType
      : "image/jpeg";

  const base64 = image.includes(",") ? (image.split(",").pop() ?? image) : image;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      let details = errText.slice(0, 300);
      try {
        const parsed = JSON.parse(errText) as { error?: { code?: number; message?: string } };
        if (parsed.error?.message) details = parsed.error.message;
      } catch {
        /* keep raw slice */
      }

      if (res.status === 429) {
        return NextResponse.json(
          {
            error: "Kuota Gemini habis untuk model ini. Coba lagi nanti atau buat API key baru di AI Studio.",
            details,
          },
          { status: 429 },
        );
      }

      return NextResponse.json(
        { error: "Gagal membaca odometer.", details },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = parseOdometerJson(text);
    const km =
      parsed?.km ??
      normalizeOdometerKm(text.replace(/[^\d.]/g, ""));

    if (km == null) {
      return NextResponse.json(
        { error: "Angka odometer tidak terbaca dari foto. Geser crop ke baris angka TOTAL lalu coba lagi." },
        { status: 422 },
      );
    }

    const confidence: OdometerConfidence =
      parsed?.confidence ?? parseOdometerConfidence(undefined);

    return NextResponse.json({ km, confidence });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Gagal memproses foto.",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
