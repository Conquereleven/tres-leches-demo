/** Dev-only: derives the Journal portrait's drawing stages from the approved original.
 *  No new artwork is invented; every pixel comes from alicia.webp. Re-run only if that file changes. */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const source = readFileSync("public/brand/reference/alicia.webp").toString(
  "base64",
);
const browser = await chromium.launch();
const page = await browser.newPage();
const layers = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = "data:image/webp;base64," + b64;
  await img.decode();
  const w = img.naturalWidth,
    h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, w, h).data;
  // The approved portrait is ink on a transparent sheet: flatten onto white before measuring tone.
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = src[i * 4 + 3] / 255;
    lum[i] =
      (0.2126 * src[i * 4] +
        0.7152 * src[i * 4 + 1] +
        0.0722 * src[i * 4 + 2]) *
        a +
      255 * (1 - a);
  }
  const blur = (input, r) => {
    const tmp = new Float32Array(w * h),
      out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0,
          n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k;
          if (xx >= 0 && xx < w) {
            s += input[y * w + xx];
            n++;
          }
        }
        tmp[y * w + x] = s / n;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0,
          n = 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k;
          if (yy >= 0 && yy < h) {
            s += tmp[yy * w + x];
            n++;
          }
        }
        out[y * w + x] = s / n;
      }
    return out;
  };
  const emit = (ink) => {
    const out = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const a = Math.max(0, Math.min(1, ink[i]));
      for (let c = 0; c < 3; c++) out.data[i * 4 + c] = 38;
      out.data[i * 4 + 3] = Math.round(a * 255);
    }
    ctx.putImageData(out, 0, 0);
    return canvas.toDataURL("image/webp", 0.86).split(",")[1];
  };
  // Stage A — contour: edges of the softened portrait read as the first construction lines.
  const soft = blur(lum, 2);
  const contour = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = (dx, dy) => soft[(y + dy) * w + x + dx];
      const gx =
        p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
      const gy =
        p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
      const m = Math.hypot(gx, gy);
      contour[y * w + x] =
        Math.pow(Math.max(0, Math.min(1, (m - 34) / 80)), 0.85) * 0.7;
    }
  // Stage B — detail: the artist's own dark linework, without mid-tone shading.
  const detail = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++)
    detail[i] =
      Math.pow(Math.max(0, Math.min(1, (135 - lum[i]) / 135)), 0.9) * 0.92;
  return { w, h, contour: emit(contour), detail: emit(detail) };
}, source);
await browser.close();
writeFileSync(
  "public/brand/approved/journal-alicia-contour.webp",
  Buffer.from(layers.contour, "base64"),
);
writeFileSync(
  "public/brand/approved/journal-alicia-detail.webp",
  Buffer.from(layers.detail, "base64"),
);
console.log(JSON.stringify({ width: layers.w, height: layers.h }));
