import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen } from "@/components/legal/StatusScreen";

export const metadata: Metadata = {
  title: "Page not found · Aramis Product",
  description: "This address is not a page on Aramis.",
};

export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title="This page is not on Aramis"
      actions={
        <>
          <Link
            href="/"
            className="rounded-xl bg-teal px-5 py-2.5 text-sm font-semibold text-white"
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
        The address may be mistyped, or the page was moved. Nothing in your
        restaurant data was changed by opening this link.
      </p>
      <p>Useful places:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Home, to sign in or request access</li>
        <li>Staff sign in, if an owner already made you a login</li>
        <li>FAQ, for trial, offline, and privacy questions</li>
      </ul>
    </StatusScreen>
  );
}
