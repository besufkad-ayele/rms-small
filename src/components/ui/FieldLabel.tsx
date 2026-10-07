import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Required fields show an asterisk. Optional fields say so. */
export function FieldLabel({
  children,
  required = false,
  tone = "light",
  className,
}: {
  children: ReactNode;
  required?: boolean;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mb-1 block",
        tone === "dark" ? "text-stone/70" : "text-ink/60",
        className,
      )}
    >
      {children}
      {required ? (
        <abbr title="Required" className="text-coral no-underline">
          {" "}
          *
        </abbr>
      ) : (
        <span className={tone === "dark" ? "text-stone/40" : "text-ink/40"}>
          {" "}
          (optional)
        </span>
      )}
    </span>
  );
}
