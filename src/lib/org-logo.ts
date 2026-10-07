import { fileToWebpBlob } from "@/lib/menu-image";

/** Max edge for org logos (square-friendly mark in the header). */
const LOGO_MAX_EDGE = 512;

export async function uploadOrgLogo(
  orgId: string,
  file: File,
): Promise<string> {
  const { createClient } = await import("@/lib/supabase/client");
  const webp = await fileToWebpBlob(file, LOGO_MAX_EDGE, 0.88);
  if (!webp) throw new Error("Could not read this logo. Try another image.");
  const supabase = createClient();
  const path = `${orgId}/logo.webp`;
  const { error } = await supabase.storage.from("org-logos").upload(path, webp, {
    contentType: "image/webp",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("org-logos").getPublicUrl(path);
  // Bust CDN/browser cache after replace
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function removeOrgLogoFile(orgId: string): Promise<void> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  await supabase.storage.from("org-logos").remove([`${orgId}/logo.webp`]);
}
