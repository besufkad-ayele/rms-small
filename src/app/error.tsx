"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-stone px-4 text-ink">
      <h1 className="font-display text-2xl">This page couldn’t load</h1>
      <p className="max-w-md text-center text-sm text-ink/60">
        Something went wrong. Try again, or go to sign in / create account.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-teal px-5 py-2.5 text-sm font-semibold text-white"
        >
          Reload
        </button>
        <Link
          href="/login"
          className="rounded-xl border border-ink/15 px-5 py-2.5 text-sm font-semibold"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-xl border border-ink/15 px-5 py-2.5 text-sm font-semibold"
        >
          Create account
        </Link>
      </div>
    </div>
  );
}
