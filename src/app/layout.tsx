import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Fraunces } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { OfflineSyncProvider } from "@/components/offline/OfflineSyncProvider";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aramis Product",
  description: "Counter system for cafés and restaurants.",
  applicationName: "Aramis Product",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Aramis",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1d1a",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AuthProvider>
          <OfflineSyncProvider>{children}</OfflineSyncProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
