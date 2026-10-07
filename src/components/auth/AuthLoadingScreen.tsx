"use client";

import { AramisLogo } from "@/components/brand/AramisLogo";
import { Shimmer } from "@/components/ui/Shimmer";

export function AuthLoadingScreen({
  message = "Opening Aramis…",
}: {
  message?: string;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#071412] px-4 text-[#eef2f0]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#2A9D8F40,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#E9C46A28,_transparent_45%)]" />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <AramisLogo priority tone="onDark" className="h-12" />
        <p className="text-sm text-[#eef2f0]/70">{message}</p>
        <div className="w-full space-y-2.5 rounded-3xl border border-white/8 bg-white/5 p-4">
          <Shimmer onDark className="h-4 w-1/2 mx-auto" />
          <Shimmer onDark className="h-3 w-full" />
          <Shimmer onDark className="h-3 w-5/6 mx-auto" />
          <Shimmer onDark className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
