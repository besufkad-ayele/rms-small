"use client";

import { useEffect, useId, useState } from "react";
import {
  PHONE_COUNTRIES,
  assessPhone,
  countryByIso,
  parseStoredPhone,
  type PhoneAssessment,
} from "@/lib/phone";
import { cn } from "@/lib/utils";

export function PhoneField({
  defaultValue = "",
  required = false,
  onChange,
  tone = "light",
  id,
}: {
  defaultValue?: string;
  required?: boolean;
  onChange: (state: PhoneAssessment) => void;
  tone?: "light" | "dark";
  id?: string;
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const initial = parseStoredPhone(defaultValue);
  const [iso, setIso] = useState(initial.iso);
  const [national, setNational] = useState(initial.national);

  const country = countryByIso(iso);
  const assessment = assessPhone({ iso, national, required });
  const shownError = assessment.national ? assessment.error : null;

  useEffect(() => {
    onChange(assessPhone({ iso, national, required }));
  }, [iso, national, required, onChange]);

  function commitNational(nextIso: string, raw: string) {
    const nextCountry = countryByIso(nextIso);
    const trimmed = raw.trim();
    if (trimmed.startsWith("+")) {
      const parsed = parseStoredPhone(trimmed);
      setIso(parsed.iso);
      setNational(parsed.national);
      return;
    }
    let digits = raw.replace(/\D/g, "");
    if (digits.length > nextCountry.digits) {
      const parsed = parseStoredPhone(`+${digits}`);
      const matched = countryByIso(parsed.iso);
      if (
        parsed.national &&
        digits.startsWith(matched.dial) &&
        digits.length > nextCountry.digits
      ) {
        setIso(parsed.iso);
        setNational(parsed.national);
        return;
      }
    }
    if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
    setNational(digits.slice(0, nextCountry.digits));
  }

  const control =
    tone === "dark"
      ? "rounded-xl border border-white/15 bg-ink/40 px-3 py-3 text-stone outline-none focus:ring-2 focus:ring-teal/40"
      : "field";

  return (
    <div>
      <div className="flex gap-2">
        <select
          aria-label="Country code"
          className={cn(control, "w-[9.75rem] shrink-0")}
          value={iso}
          onChange={(e) => {
            const next = e.target.value;
            setIso(next);
            setNational((prev) => prev.slice(0, countryByIso(next).digits));
          }}
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.iso} +{c.dial}
            </option>
          ))}
        </select>
        <input
          id={inputId}
          inputMode="numeric"
          autoComplete="tel-national"
          className={cn(control, "min-w-0 flex-1")}
          placeholder={country.iso === "ET" ? "911234567" : `${country.digits} digits`}
          aria-invalid={shownError ? true : undefined}
          value={national}
          onChange={(e) => commitNational(iso, e.target.value)}
        />
      </div>
      <p
        className={cn(
          "mt-1 text-xs",
          shownError
            ? "text-coral"
            : tone === "dark"
              ? "text-stone/45"
              : "text-ink/45",
        )}
      >
        {shownError || `${country.digits} digits after +${country.dial}`}
      </p>
    </div>
  );
}
