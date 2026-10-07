const hits = new Map<string, number[]>();

export function allowRequest(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function publicOrderKey(slug: string, phone: string): string {
  return `${slug}:${phone.replace(/\D/g, "")}`;
}
