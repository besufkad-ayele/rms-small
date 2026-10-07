import { createAdminClient, createClient } from "@/lib/supabase/server";

export type AdminClient = ReturnType<typeof createAdminClient>;

export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as const };

  const admin = createAdminClient();
  const adminEmail = (
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL || "admin@aramis.product"
  ).toLowerCase();
  if (user.email?.toLowerCase() === adminEmail && user.email_confirmed_at) {
    await admin
      .from("profiles")
      .update({ is_platform_admin: true, email: user.email })
      .eq("id", user.id);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_platform_admin) {
    return { error: "Not a platform admin" as const };
  }
  return { user, admin, profile };
}

type PageResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

/** PostgREST caps responses at 1000 rows; page through up to `maxRows`. */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PageResult<T>,
  maxRows = 50_000,
): Promise<{ rows: T[]; error: string | null }> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return { rows, error: null };
}

/** `…/storage/v1/object/public/<bucket>/<path>` → `<path>` */
export function storagePathFromUrl(
  url: string | null | undefined,
  bucket: string,
): string | null {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return url.includes("://") ? null : url;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

async function listStorageEntries(
  admin: AdminClient,
  bucket: string,
  prefix: string,
) {
  const files: string[] = [];
  const folders: string[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) folders.push(full);
      else files.push(full);
    }
    if (data.length < 1000) break;
  }
  return { files, folders };
}

/** Copy every object under `fromPrefix` to `toPrefix` in the same bucket. */
export async function copyStorageFolder(
  admin: AdminClient,
  bucket: string,
  fromPrefix: string,
  toPrefix: string,
  opts?: { skipFolders?: string[] },
): Promise<{ copied: number; error: string | null }> {
  const { files, folders } = await listStorageEntries(admin, bucket, fromPrefix);
  let copied = 0;
  for (const file of files) {
    const dest = `${toPrefix}${file.slice(fromPrefix.length)}`;
    const { error } = await admin.storage.from(bucket).copy(file, dest);
    if (error && !/already exists|duplicate/i.test(error.message)) {
      return { copied, error: error.message };
    }
    copied += 1;
  }
  for (const folder of folders) {
    const name = folder.slice(fromPrefix.length).replace(/^\//, "").split("/")[0];
    if (name && opts?.skipFolders?.includes(name)) continue;
    const dest = `${toPrefix}${folder.slice(fromPrefix.length)}`;
    const nested = await copyStorageFolder(admin, bucket, folder, dest);
    copied += nested.copied;
    if (nested.error) return { copied, error: nested.error };
  }
  return { copied, error: null };
}

/** Recursively remove every object under `prefix` in `bucket`. */
export async function removeStorageFolder(
  admin: AdminClient,
  bucket: string,
  prefix: string,
  opts?: { skipFolders?: string[] },
): Promise<number> {
  let removed = 0;
  const files: string[] = [];
  const folders: string[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const entry of data) {
      const full = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        if (!opts?.skipFolders?.includes(entry.name)) folders.push(full);
      } else files.push(full);
    }
    if (data.length < 1000) break;
  }
  for (let i = 0; i < files.length; i += 500) {
    const chunk = files.slice(i, i + 500);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (!error) removed += chunk.length;
  }
  for (const folder of folders) {
    removed += await removeStorageFolder(admin, bucket, folder);
  }
  return removed;
}
