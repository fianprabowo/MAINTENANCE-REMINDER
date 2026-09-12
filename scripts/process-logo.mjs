// One-off script: bikin transparent PNG dari source RISMA logo yang aslinya
// dark-gray-on-black JPEG (nyaris invisible; range pixel 0-18/255).
// Hasil: `public/brand/risma-logo.png` — logo pixels solid hitam,
// background transparent, edges anti-aliased.
//
// Cara pakai:
//   1. Taruh source di `public/brand/risma-logo.source.jpg` (atau update
//      `input` path di bawah).
//   2. Jalanin: `node scripts/process-logo.mjs`
//   3. Hasilnya di `public/brand/risma-logo.png`.
//
// Note: source file TIDAK di-commit ke git — hanya output PNG-nya yang
// checked in. Kalau source-nya update, dev harus provide ulang.
//
// Pipeline:
//   1. Grayscale input → 1-channel luminance
//   2. Threshold (8) → binarize: bg (< 8) → 0, logo (≥ 8) → 255
//   3. Slight blur → anti-aliased edges (no jaggies di curved shapes)
//   4. Buat black RGB canvas seukuran source
//   5. Join grayscale-mask sebagai alpha channel → RGBA PNG

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const input = path.join(repoRoot, "public/brand/risma-logo.source.jpg");
const output = path.join(repoRoot, "public/brand/risma-logo.png");

async function main() {
  if (!fs.existsSync(input)) {
    console.error(`Source not found: ${input}`);
    console.error(
      "Place the source JPEG at that path, then re-run this script.",
    );
    process.exit(1);
  }

  const src = sharp(input);
  const meta = await src.metadata();
  const { width, height } = meta;
  if (!width || !height) {
    throw new Error("Source image missing width/height metadata");
  }

  console.log(`Source: ${width}×${height} ${meta.format}`);

  // Step 1: Extract binary alpha mask directly from grayscale.
  //   Actual pixel distribution di source (dari `inspect-logo.mjs`):
  //     - Bg: 85% pure 0, 99% ≤ 5.
  //     - Logo: values 10-18 (cluster di 13-14).
  //     - Max grayscale value: 18/255 (source ini nyaris pitch-black).
  //   Karena range super compressed, `.threshold(8)` cukup untuk pisah
  //   bg vs logo tanpa perlu linear stretch dulu:
  //     - pixels < 8  → 0 (bg → transparent)
  //     - pixels ≥ 8  → 255 (logo → opaque)
  //   Blur setelah threshold bikin edge gradient → alpha anti-aliased,
  //   menghindari "jaggies" di curved shapes (RISMA wordmark punya banyak
  //   kurva).
  const alphaMask = await sharp(input)
    .grayscale()
    .threshold(8) // low threshold: bg noise gone, logo pixels stay
    .blur(0.7) // smooth edges for anti-alias
    .toColourspace("b-w") // single-channel guarantee
    .raw()
    .toBuffer({ resolveWithObject: true });

  console.log(
    `Mask: ${alphaMask.info.width}×${alphaMask.info.height} ${alphaMask.info.channels}ch`,
  );

  // Step 2: Build a solid-black RGB canvas at same dimensions.
  const blackCanvas = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .raw()
    .toBuffer();

  // Step 3: Combine black RGB + alpha mask → RGBA PNG.
  await sharp(blackCanvas, {
    raw: { width, height, channels: 3 },
  })
    .joinChannel(alphaMask.data, {
      raw: {
        width: alphaMask.info.width,
        height: alphaMask.info.height,
        channels: 1,
      },
    })
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
