"use client";

import Link from "next/link";

/** Catches crashes in the root layout (AuthProvider). Must include html/body. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1d1a",
          color: "#f5f0e8",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Aramis couldn’t load</h1>
          <p style={{ opacity: 0.7, fontSize: 14, lineHeight: 1.5 }}>
            A temporary app error occurred. Reload, or open sign in / create
            account.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "center",
              marginTop: 24,
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#2A9D8F",
                color: "#fff",
                border: 0,
                borderRadius: 12,
                padding: "12px 20px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
            <Link
              href="/login"
              style={{
                background: "transparent",
                color: "#f5f0e8",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 12,
                padding: "12px 20px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              style={{
                background: "transparent",
                color: "#f5f0e8",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 12,
                padding: "12px 20px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Create account
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
