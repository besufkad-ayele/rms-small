import {
  assertMenuImageSize,
  fileToWebpBlob,
  MENU_IMAGE_MAX_BYTES,
} from "@/lib/menu-image";

export { MENU_IMAGE_MAX_BYTES as SALE_PROOF_MAX_BYTES };

/** Upload a transfer screenshot for a non-cash sale (owner can review). */
export async function uploadSalePaymentProof(
  orgId: string,
  file: File,
): Promise<string> {
  assertMenuImageSize(file);
  const { createClient } = await import("@/lib/supabase/client");
  const webp = await fileToWebpBlob(file, 1280, 0.8);
  if (!webp) throw new Error("Could not process payment image.");
  const supabase = createClient();
  const path = `${orgId}/sales/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const { error } = await supabase.storage
    .from("payment-proofs")
    .upload(path, webp, {
      contentType: "image/webp",
      upsert: false,
    });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("payment-proofs").getPublicUrl(path);
  return data.publicUrl;
}
