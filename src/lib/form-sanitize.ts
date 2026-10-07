/** Strip control characters, collapse whitespace, and trim. */
export function sanitizeText(value: string, max = 200): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function requireText(label: string, value: string, max = 200): string {
  const clean = sanitizeText(value, max);
  if (!clean) throw new Error(`${label} is required.`);
  return clean;
}

export function optionalText(value: string, max = 200): string {
  return sanitizeText(value, max);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireEmail(value: string): string {
  const email = sanitizeText(value, 254).toLowerCase();
  if (!EMAIL.test(email)) throw new Error("Enter a valid email.");
  return email;
}

export function optionalEmail(value: string): string {
  const email = sanitizeText(value, 254).toLowerCase();
  if (!email) return "";
  if (!EMAIL.test(email)) throw new Error("Enter a valid email, or leave it blank.");
  return email;
}

/** Optional website. Bare domains get https://. */
export function optionalWebsite(value: string): string {
  const raw = sanitizeText(value, 200);
  if (!raw) return "";
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    throw new Error("Enter a valid website, or leave it blank.");
  }
  if (!url.hostname.includes(".")) {
    throw new Error("Enter a valid website, or leave it blank.");
  }
  return url.toString();
}

export function requireNumber(
  label: string,
  value: number,
  opts?: { min?: number; max?: number },
): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a number.`);
  const min = opts?.min ?? 0;
  if (value < min) {
    throw new Error(
      min === 0
        ? `${label} must be zero or more.`
        : `${label} must be at least ${min}.`,
    );
  }
  if (opts?.max != null && value > opts.max) {
    throw new Error(`${label} must be ${opts.max} or less.`);
  }
  return value;
}
