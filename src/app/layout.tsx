import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Fraunces } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { OfflineSyncProvider } from "@/components/offline/OfflineSyncProvider";
import { ServiceWorkerRegistrar } from "@/components/offline/ServiceWorkerRegistrar";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
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
  icons: {
    icon: [
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
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
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='aramis-theme';var m=localStorage.getItem(k)||'system';var d=m==='dark'||(m!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.dataset.theme=d?'dark':'light';e.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ServiceWorkerRegistrar />
        <ThemeProvider>
          <AuthProvider>
            <OfflineSyncProvider>{children}</OfflineSyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
