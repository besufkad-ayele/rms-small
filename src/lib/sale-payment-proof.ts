import { assertMenuImageSize, fileToWebpBlob } from "@/lib/menu-image";

const SIGNED_TTL_SEC = 60 * 60 * 24 * 7;

function paymentProofStoragePath(pathOrUrl: string): string {
  const marker = "/payment-proofs/";
  const i = pathOrUrl.indexOf(marker);
  if (i === -1) return pathOrUrl.split("?")[0];
  return decodeURIComponent(pathOrUrl.slice(i + marker.length).split("?")[0]);
}

/** Fresh 7-day signed URL for a storage path or stored payment-proofs URL. */
export async function signPaymentProofPath(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return pathOrUrl;
  const path = paymentProofStoragePath(pathOrUrl);
  if (!path) return pathOrUrl;
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(path, SIGNED_TTL_SEC);
  if (error || !data?.signedUrl) return pathOrUrl;
  return data.signedUrl;
}

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
  const { data, error: signError } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(path, SIGNED_TTL_SEC);
  if (signError || !data?.signedUrl) {
    throw new Error(signError?.message || "Could not create a viewable payment proof URL.");
  }
  return data.signedUrl;
}
