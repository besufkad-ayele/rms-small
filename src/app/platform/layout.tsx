import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Aramis Owner",
  applicationName: "Aramis Owner",
  manifest: "/platform-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Owner",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b1d1a",
  viewportFit: "cover",
};

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return children;
}
