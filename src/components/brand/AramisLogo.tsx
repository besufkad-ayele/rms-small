import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** `full` = icon + wordmark; `mark` = icon only */
  variant?: "full" | "mark";
  /**
   * `onLight` = dark wordmark for light surfaces.
   * `onDark` = white wordmark for dark surfaces (sidebar, etc).
   */
  tone?: "onLight" | "onDark";
  priority?: boolean;
};

/**
 * Aramis brand mark.
 * - `tone="onDark"` → `/Aramis_Logo_on_dark.png` (white wordmark, no light chip needed)
 * - `tone="onLight"` → `/Aramis_Logo.png` (dark wordmark)
 * - `mark` → square app icon
 */
export function AramisLogo({
  className,
  variant = "full",
  tone = "onLight",
  priority = false,
}: LogoProps) {
  if (variant === "mark") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/icons/android-chrome-192x192.png"
        alt="Aramis"
        width={192}
        height={192}
        className={cn("h-9 w-9 object-contain", className)}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
      />
    );
  }

  const src =
    tone === "onDark" ? "/Aramis_Logo_on_dark.png" : "/Aramis_Logo.png";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Aramis"
      width={512}
      height={160}
      className={cn("h-10 w-auto object-contain object-left", className)}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
    />
  );
}
