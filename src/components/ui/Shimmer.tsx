import { cn } from "@/lib/utils";

export function Shimmer({
  className,
  onDark,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <div
      className={cn(onDark ? "shimmer-on-dark" : "shimmer", "rounded-xl", className)}
      aria-hidden
    />
  );
}

export function ShimmerLines({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

export function SectionShimmer({
  variant = "cards",
}: {
  variant?: "cards" | "list" | "packages" | "detail" | "usage";
}) {
  if (variant === "list") {
    return (
      <div className="space-y-3" aria-busy aria-label="Loading">
        <Shimmer className="h-8 w-40 rounded-2xl" />
        <div className="rounded-3xl border border-ink/8 bg-white p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-ink/5 py-3 last:border-0"
            >
              <Shimmer className="h-10 w-10 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Shimmer className="h-3 w-1/2" />
                <Shimmer className="h-2.5 w-1/3" />
              </div>
              <Shimmer className="h-7 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "packages") {
    return (
      <div className="space-y-4" aria-busy aria-label="Loading pricing">
        <div className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
          <Shimmer className="h-6 w-48" />
          <Shimmer className="mt-2 h-3 w-72 max-w-full" />
          <div className="mt-4 grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid gap-2 rounded-2xl bg-stone/40 p-3 sm:grid-cols-[1fr_120px_80px]">
                <div className="space-y-2">
                  <Shimmer className="h-9 w-full" />
                  <Shimmer className="h-9 w-full" />
                </div>
                <Shimmer className="h-9" />
                <Shimmer className="h-9" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-ink/8 bg-white p-4">
              <Shimmer className="h-5 w-32" />
              <Shimmer className="mt-2 h-3 w-48" />
              <div className="mt-3 flex gap-2">
                <Shimmer className="h-5 w-14" />
                <Shimmer className="h-5 w-16" />
                <Shimmer className="h-5 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className="space-y-4" aria-busy aria-label="Loading restaurant">
        <Shimmer className="h-4 w-28" />
        <div className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
          <Shimmer className="h-8 w-56" />
          <Shimmer className="mt-2 h-3 w-40" />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Shimmer key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Shimmer key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        </div>
        <Shimmer className="h-40 rounded-3xl" />
        <Shimmer className="h-56 rounded-3xl" />
      </div>
    );
  }

  if (variant === "usage") {
    return (
      <section
        className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5"
        aria-busy
        aria-label="Loading usage"
      >
        <Shimmer className="h-5 w-44" />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Shimmer key={i} className="h-14 rounded-xl" />
          ))}
        </div>
        <Shimmer className="mt-4 h-36 rounded-2xl" />
      </section>
    );
  }

  return (
    <div className="space-y-4" aria-busy aria-label="Loading">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-ink/8 bg-white p-4">
            <Shimmer className="h-3 w-20" />
            <Shimmer className="mt-3 h-7 w-24" />
            <Shimmer className="mt-2 h-2.5 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
            <Shimmer className="h-5 w-40" />
            <Shimmer className="mt-4 h-24 rounded-2xl" />
            <ShimmerLines lines={4} className="mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlatformPageShimmer() {
  return (
    <div className="flex min-h-dvh bg-stone" aria-busy aria-label="Loading platform">
      <aside className="hidden w-64 shrink-0 bg-[#0b1d1a] p-4 lg:flex lg:flex-col">
        <Shimmer onDark className="h-8 w-32" />
        <Shimmer onDark className="mt-2 h-3 w-24" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer onDark key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-3 py-4 sm:px-5">
        <Shimmer className="mb-4 h-7 w-36" />
        <SectionShimmer />
      </div>
    </div>
  );
}
