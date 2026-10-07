import type { AdminClient } from "@/lib/platform-admin";

export function slugifyName(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "restaurant";
}

export async function ensureOrgPublicSlug(
  admin: AdminClient,
  orgId: string,
  name: string,
  current: string | null,
) {
  if (current) return current;
  const slug = slugifyName(name);
  for (let i = 0; i < 8; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const { data } = await admin
      .from("organizations")
      .select("id")
      .eq("public_slug", candidate)
      .maybeSingle();
    if (!data || data.id === orgId) {
      await admin
        .from("organizations")
        .update({ public_slug: candidate })
        .eq("id", orgId);
      return candidate;
    }
  }
  const fallback = `${slug}-${orgId.slice(0, 6)}`;
  await admin
    .from("organizations")
    .update({ public_slug: fallback })
    .eq("id", orgId);
  return fallback;
}
