/**
 * All conversion stays in the editor's browser: no new infrastructure,
 * duplicate original in SQLite, or server-side image-processing dependency.
 * Server image signatures, dimensions, content type and permissions remain
 * authoritative regardless of this client-side preflight.
 */
export const HUB_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const OPTIMIZE_ABOVE_BYTES = 450 * 1024;
const MAX_LONG_SIDE = 1920;
const MIN_SOURCE_SIDE = 200;
const MAX_SOURCE_SIDE = 6000;

export function validateHubUpload(file: Pick<File, "name" | "size" | "type">): string | null {
  if (!file.size) return `"${file.name}" is empty. Select a valid image.`;
  if (file.size > HUB_MAX_SOURCE_BYTES)
    return `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Maximum upload size is 5 MB. Choose a smaller file.`;
  if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type))
    return `"${file.name}" is not supported. Choose PNG, JPEG, WebP or AVIF.`;
  return null;
}

export type PreparedHubImage = { blob: Blob; optimized: boolean };

/** Preserve small files; optimize large, decodable images only when smaller. */
export async function prepareHubUpload(file: File): Promise<PreparedHubImage> {
  if (file.size <= OPTIMIZE_ABOVE_BYTES) return { blob: file, optimized: false };
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    // Image.decode honors browser orientation handling, without sending data.
    try {
      await image.decode();
    } catch {
      // Server remains authoritative for potentially unsupported/corrupt inputs.
      return { blob: file, optimized: false };
    }
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width < MIN_SOURCE_SIDE || height < MIN_SOURCE_SIDE ||
        width > MAX_SOURCE_SIDE || height > MAX_SOURCE_SIDE)
      throw new Error("Image must be between 200 and 6000 pixels on each side.");
    const scale = Math.min(1, MAX_LONG_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, optimized: false };
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const candidate = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (candidate?.type !== "image/webp" || candidate.size === 0 ||
        candidate.size >= file.size)
      return { blob: file, optimized: false };
    return { blob: candidate, optimized: true };
  } finally {
    URL.revokeObjectURL(url);
  }
}
