/** Max stored image size after WebP conversion (500 KB). */
export const MENU_IMAGE_MAX_BYTES = 500 * 1024;

/** Largest original photo we accept before compressing (phone cameras). */
export const IMAGE_SOURCE_MAX_BYTES = 20 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function assertMenuImageSize(file: File): void {
  if (!file.type.startsWith("image/") && file.type !== "") {
    throw new Error("Choose an image file.");
  }
  if (file.size > IMAGE_SOURCE_MAX_BYTES) {
    throw new Error(
      `Photo is too large (${formatBytes(file.size)}). Max ${formatBytes(IMAGE_SOURCE_MAX_BYTES)}.`,
    );
  }
}

/**
 * Shrink and convert to WebP, lowering size and quality until it fits
 * MENU_IMAGE_MAX_BYTES. Returns null when the browser cannot decode the file.
 */
export async function fileToWebpBlob(
  file: File,
  maxEdge = 960,
  quality = 0.82,
): Promise<Blob | null> {
  assertMenuImageSize(file);
  if (file.type === "image/webp" && file.size <= MENU_IMAGE_MAX_BYTES) {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    let edge = maxEdge;
    let q = quality;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/webp", q),
      );
      if (!blob) return null;
      if (blob.size <= MENU_IMAGE_MAX_BYTES) return blob;
      edge = Math.round(edge * 0.8);
      q = Math.max(0.5, q - 0.08);
    }
    throw new Error(
      `Photo is still over ${formatBytes(MENU_IMAGE_MAX_BYTES)} after compressing. Try a simpler photo.`,
    );
  } finally {
    bitmap.close();
  }
}

export async function uploadMenuImage(
  orgId: string,
  menuItemId: string,
  file: File,
): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/client");
  const webp = await fileToWebpBlob(file);
  if (!webp) throw new Error("Could not read this photo. Try another one.");
  const supabase = createClient();
  const path = `${orgId}/${menuItemId}-${Date.now()}.webp`;
  const { error } = await supabase.storage
    .from("menu-images")
    .upload(path, webp, {
      contentType: "image/webp",
      upsert: true,
    });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
  return data.publicUrl;
}
