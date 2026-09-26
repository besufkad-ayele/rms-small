/** Max original upload size before conversion (500 KB). */
export const MENU_IMAGE_MAX_BYTES = 500 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function assertMenuImageSize(file: File): void {
  if (file.size > MENU_IMAGE_MAX_BYTES) {
    throw new Error(
      `Photo is too large (${formatBytes(file.size)}). Max ${formatBytes(MENU_IMAGE_MAX_BYTES)}.`,
    );
  }
}

/** Convert an image file to WebP (optional, never throws hard — returns null on failure). */
export async function fileToWebpBlob(
  file: File,
  maxEdge = 960,
  quality = 0.82,
): Promise<Blob | null> {
  assertMenuImageSize(file);
  try {
    if (file.type === "image/webp" && file.size < 900_000) {
      return file;
    }
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", quality),
    );
    return blob;
  } catch {
    return null;
  }
}

export async function uploadMenuImage(
  orgId: string,
  menuItemId: string,
  file: File,
): Promise<string | null> {
  assertMenuImageSize(file);
  const { createClient } = await import("@/lib/supabase/client");
  const webp = await fileToWebpBlob(file);
  if (!webp) return null;
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
