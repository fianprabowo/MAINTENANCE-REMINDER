// One-off script: siapkan RISMA wordmark untuk `public/brand/risma-logo.png`.
// Source-nya sudah PNG transparan (logo hitam, bg alpha 0) tapi dengan
// padding transparan lebar di sekelilingnya.
//
// Cara pakai:
//   1. Taruh source di `public/brand/risma-logo.source.png` (atau update
//      `input` path di bawah).
//   2. Jalanin: `node scripts/process-logo.mjs`
//   3. Hasilnya di `public/brand/risma-logo.png`.
//
// Note: source file TIDAK di-commit ke git — hanya output PNG-nya yang
// checked in. Kalau source-nya update, dev harus provide ulang.
//
// Pipeline:
//   1. Trim padding transparan → bounding box = wordmark saja
//   2. Resize ke lebar OUTPUT_WIDTH (cukup tajam untuk w-48/w-56 di 3x DPR)
//   3. Tulis RGBA PNG (alpha anti-aliased dari source dipertahankan)
//
// Setelah output berubah, update `width`/`height` di semua `<Image
// src="/brand/risma-logo.png">` sesuai dimensi yang di-print script.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const input = path.join(repoRoot, "public/brand/risma-logo.source.png");
const output = path.join(repoRoot, "public/brand/risma-logo.png");
const OUTPUT_WIDTH = 960;

async function main() {
  if (!fs.existsSync(input)) {
    console.error(`Source not found: ${input}`);
    console.error("Place the source PNG at that path, then re-run this script.");
    process.exit(1);
  }

  const meta = await sharp(input).metadata();
  console.log(`Source: ${meta.width}×${meta.height} ${meta.format} (alpha: ${meta.hasAlpha})`);
  if (!meta.hasAlpha) {
    throw new Error("Source must be a transparent PNG (black logo on alpha 0)");
  }

  // Trim dulu ke buffer terpisah — sharp menjalankan resize sebelum trim
  // kalau di-chain dalam satu pipeline.
  const trimmed = await sharp(input).trim({ threshold: 1 }).png().toBuffer();

  await sharp(trimmed)
    .resize({ width: OUTPUT_WIDTH })
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);

  const outStat = await sharp(output).metadata();
  console.log(
    `Wrote: ${output} (${outStat.width}×${outStat.height}, ${outStat.channels}ch, ${outStat.format})`,
  );
}

main().catch((err) => {
  console.error("Failed to process logo:", err);
  process.exit(1);
});
