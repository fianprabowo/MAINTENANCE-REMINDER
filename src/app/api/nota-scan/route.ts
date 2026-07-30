import { NextResponse } from "next/server";
import { parseNotaScanJson } from "@/lib/nota-normalize";

const GEMINI_MODEL = "gemini-2.5-flash";
const PROMPT = `Kamu membaca foto atau PDF NOTA PENJUALAN / invoice / kwitansi bengkel motor di Indonesia.
Ekstrak SEMUA baris item (Part DAN Jasa) beserta kuantitas & harga agar total nota cocok.
Untuk tiap baris: tentukan line_type (part|labor). kind hanya untuk Part.

Aturan ekstraksi:
- Abaikan header toko yang bukan nama bengkel, nomor nota, footer, PPN terpisah, ongkir, dan baris "TOTAL" agregat (bukan item).
- TETAP sertakan baris JASA / upah / ongkos (line_type=labor) — jangan dihapus.
- Nama item: teks deskripsi barang/jasa apa adanya dari nota (boleh ada kode part).
- qty: jumlah (default 1 jika tidak tertulis).
- unit_price: harga satuan dalam Rupiah integer (tanpa Rp, tanpa titik pemisah).
- total: subtotal baris (qty × unit_price). Jika hanya ada satu angka harga, anggap itu total baris dan qty=1.
- workshop: nama bengkel/toko jika terbaca, else null.
- serviced_at: tanggal transaksi dalam YYYY-MM-DD jika terbaca, else null. Konversi format lokal (dd/mm/yyyy, dd-mm-yyyy).
- odometer_km: angka kilometer / KM terakhir / odometer jika tertulis (integer). Contoh "39.888 KM" → 39888. Null jika tidak ada. Jangan samakan dengan harga.

line_type (WAJIB per item):
- "part": sparepart / barang / oli / filter / busi / seal / dll.
- "labor": jasa servis / upah / ongkos jasa / biaya pasang / jasa ganti (bukan barang).

kind — HANYA jika line_type="part" (salah satu slug):
- engine_oil: oli mesin / grade 10W-30 dll + volume liter. Contoh "SPX2 10W30 0,8L".
- gearbox_oil: oli gardan / gearbox / CVT fluid / ATF.
- spark_plug, brake_pad, air_filter, oil_filter, roller_cvt, v_belt, kampas_ganda, chain_set, kampas_kopling, battery, tire, lamp: sesuai nama.
- other: tidak yakin / kode part tanpa deskripsi jelas / seal / gasket / lain-lain.
- Jika line_type="labor" → kind harus null.

PENTING:
- "OIL SEAL" / ukuran 20.8X52X7.5 → line_type=part, kind=other (bukan engine_oil).
- Viscosity 10W30 / 0,8L pada produk oli → kind=engine_oil.
- Filter oli → oil_filter, bukan engine_oil.
- "Jasa ganti oli" → line_type=labor, kind=null (bukan engine_oil).

Balas HANYA JSON valid tanpa markdown:
{"workshop":"string|null","serviced_at":"YYYY-MM-DD|null","odometer_km":39888,"items":[{"name":"...","qty":1,"unit_price":65000,"total":65000,"line_type":"part","kind":"engine_oil"},{"name":"Jasa servis","qty":1,"unit_price":50000,"total":50000,"line_type":"labor","kind":null}]}
Jika tidak ada item terbaca, items = []. odometer_km boleh null.`;

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
      { error: "Scan nota belum dikonfigurasi. Set GEMINI_API_KEY di server." },
      { status: 503 },
    );
  }

  const image = typeof body.image === "string" ? body.image.trim() : "";
  if (!image) {
    return NextResponse.json({ error: "File wajib diisi." }, { status: 400 });
  }

  const rawMime = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
  const mimeType =
    rawMime === "application/pdf" || rawMime.startsWith("image/")
      ? rawMime
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
            error:
              "Kuota Gemini habis untuk model ini. Coba lagi nanti atau buat API key baru di AI Studio.",
            details,
          },
          { status: 429 },
        );
      }

      return NextResponse.json(
        { error: "Gagal membaca nota.", details },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = parseNotaScanJson(text);

    if (!parsed || parsed.items.length === 0) {
      return NextResponse.json(
        {
          error:
            "Baris part tidak terbaca dari file. Pastikan nota jelas (foto terang / PDF teks terbaca), lalu coba lagi.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Gagal memproses foto nota.",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
