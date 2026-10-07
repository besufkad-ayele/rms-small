/**
 * Country calling code plus a fixed national length.
 * Ethiopia (the default) is +251 and 9 digits, e.g. 911234567.
 */
export type PhoneCountry = {
  iso: string;
  name: string;
  dial: string;
  digits: number;
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "ET", name: "Ethiopia", dial: "251", digits: 9 },
  { iso: "AE", name: "United Arab Emirates", dial: "971", digits: 9 },
  { iso: "CN", name: "China", dial: "86", digits: 11 },
  { iso: "DE", name: "Germany", dial: "49", digits: 11 },
  { iso: "DJ", name: "Djibouti", dial: "253", digits: 8 },
  { iso: "EG", name: "Egypt", dial: "20", digits: 10 },
  { iso: "ER", name: "Eritrea", dial: "291", digits: 7 },
  { iso: "FR", name: "France", dial: "33", digits: 9 },
  { iso: "GB", name: "United Kingdom", dial: "44", digits: 10 },
  { iso: "IN", name: "India", dial: "91", digits: 10 },
  { iso: "IT", name: "Italy", dial: "39", digits: 10 },
  { iso: "KE", name: "Kenya", dial: "254", digits: 9 },
  { iso: "KW", name: "Kuwait", dial: "965", digits: 8 },
  { iso: "NG", name: "Nigeria", dial: "234", digits: 10 },
  { iso: "QA", name: "Qatar", dial: "974", digits: 8 },
  { iso: "RW", name: "Rwanda", dial: "250", digits: 9 },
  { iso: "SA", name: "Saudi Arabia", dial: "966", digits: 9 },
  { iso: "SD", name: "Sudan", dial: "249", digits: 9 },
  { iso: "SO", name: "Somalia", dial: "252", digits: 9 },
  { iso: "SS", name: "South Sudan", dial: "211", digits: 9 },
  { iso: "TZ", name: "Tanzania", dial: "255", digits: 9 },
  { iso: "UG", name: "Uganda", dial: "256", digits: 9 },
  { iso: "US", name: "United States", dial: "1", digits: 10 },
  { iso: "ZA", name: "South Africa", dial: "27", digits: 9 },
];

export const DEFAULT_PHONE_ISO = "ET";

export type PhoneAssessment = {
  iso: string;
  national: string;
  e164: string;
  error: string | null;
};

export function countryByIso(iso: string): PhoneCountry {
  return (
    PHONE_COUNTRIES.find((c) => c.iso === iso) ??
    PHONE_COUNTRIES.find((c) => c.iso === DEFAULT_PHONE_ISO)!
  );
}

function matchDial(digits: string): PhoneCountry | null {
  const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  return sorted.find((c) => digits.startsWith(c.dial)) ?? null;
}

/** Turn a stored or pasted number into a country and national digits. */
export function parseStoredPhone(value: string | null | undefined): {
  iso: string;
  national: string;
} {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { iso: DEFAULT_PHONE_ISO, national: "" };

  const looksInternational = raw.startsWith("+") || digits.length > 10;
  if (looksInternational) {
    const country = matchDial(digits);
    if (country) {
      let national = digits.slice(country.dial.length).replace(/^0+/, "");
      national = national.slice(0, country.digits);
      return { iso: country.iso, national };
    }
  }

  if (digits.startsWith("0")) {
    return {
      iso: DEFAULT_PHONE_ISO,
      national: digits.replace(/^0+/, "").slice(0, 9),
    };
  }

  return { iso: DEFAULT_PHONE_ISO, national: digits.slice(0, 9) };
}

export function assessPhone(input: {
  iso: string;
  national: string;
  required?: boolean;
}): PhoneAssessment {
  const country = countryByIso(input.iso);
  let national = input.national.replace(/\D/g, "");
  if (national.startsWith("0")) national = national.replace(/^0+/, "");
  national = national.slice(0, country.digits);

  if (!national) {
    return {
      iso: country.iso,
      national: "",
      e164: "",
      error: input.required ? "Phone is required." : null,
    };
  }
  if (national.length !== country.digits) {
    return {
      iso: country.iso,
      national,
      e164: "",
      error: `Enter ${country.digits} digits after +${country.dial}.`,
    };
  }
  return {
    iso: country.iso,
    national,
    e164: `+${country.dial}${national}`,
    error: null,
  };
}

export function requirePhoneE164(value: string): string {
  const parsed = parseStoredPhone(value);
  const assessed = assessPhone({ ...parsed, required: true });
  if (assessed.error || !assessed.e164) {
    throw new Error(assessed.error || "Enter a valid phone number.");
  }
  return assessed.e164;
}

/** Empty stays empty. A partial number is rejected. */
export function optionalPhoneE164(value: string): string {
  if (!sanitizePhoneRaw(value)) return "";
  return requirePhoneE164(value);
}

function sanitizePhoneRaw(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}
