"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusScreen } from "@/components/legal/StatusScreen";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [when, setWhen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error(error);
    setWhen(
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date()),
    );
  }, [error]);

  async function copyReference() {
    if (!error.digest) return;
    try {
      await navigator.clipboard.writeText(error.digest);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <StatusScreen
      code="Error"
      title="This page couldn’t finish loading"
      actions={
        <>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-teal px-5 py-2.5 text-sm font-semibold text-white"
          >
            Reload
          </button>
          <Link
            href="/"
            className="rounded-xl border border-ink/15 bg-paper px-5 py-2.5 text-sm font-semibold"
          >
            Home
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-ink/15 bg-paper px-5 py-2.5 text-sm font-semibold"
          >
            Sign in
          </Link>
          <Link
            href="/faq"
            className="rounded-xl border border-ink/15 bg-paper px-5 py-2.5 text-sm font-semibold"
          >
            FAQ
          </Link>
        </>
      }
    >
      <p>
        Aramis hit a problem while building this screen. Your restaurant’s saved
        cloud data is unchanged. Sales and edits already stored on this device
        stay here until they sync — don’t clear site data while the connection
        banner says something is pending.
      </p>
      <div className="rounded-2xl border border-ink/10 bg-paper p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
          What we can tell you
        </p>
        <dl className="mt-2 space-y-1.5">
          <div>
            <dt className="inline font-medium text-ink">What happened. </dt>
            <dd className="inline">This screen failed before it could be shown.</dd>
          </div>
          {when ? (
            <div>
              <dt className="inline font-medium text-ink">When. </dt>
              <dd className="inline">{when}</dd>
            </div>
          ) : null}
          {error.digest ? (
            <div>
              <dt className="inline font-medium text-ink">Reference. </dt>
              <dd className="inline font-mono text-[13px]">{error.digest}</dd>
            </div>
          ) : (
            <div>
              <dt className="inline font-medium text-ink">Reference. </dt>
              <dd className="inline">No reference code was attached to this error.</dd>
            </div>
          )}
        </dl>
        {error.digest ? (
          <button
            type="button"
            onClick={() => void copyReference()}
            className="mt-3 text-sm font-medium text-teal underline"
          >
            {copied ? "Reference copied" : "Copy reference"}
          </button>
        ) : null}
      </div>
      <div>
        <p className="font-medium text-ink">What to do</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Reload this page once.</li>
          <li>If you were taking an order, open the counter again after sign-in and confirm the ticket synced.</li>
          <li>If it keeps failing, note the reference and open the FAQ.</li>
        </ol>
      </div>
    </StatusScreen>
  );
}
