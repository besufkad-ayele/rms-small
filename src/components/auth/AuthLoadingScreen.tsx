"use client";

export function AuthLoadingScreen({
  message = "Opening Aramis…",
}: {
  message?: string;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink px-4 text-stone">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#2A9D8F40,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#E9C46A28,_transparent_45%)]" />
      <div className="relative flex flex-col items-center gap-5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">
          Aramis Product
        </p>
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-teal/25 border-t-teal"
          aria-hidden
        />
        <p className="text-sm text-stone/70">{message}</p>
      </div>
    </div>
  );
}
