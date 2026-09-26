import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep experimental.useOffline off — it previously triggered Next.js
  // global-error on client navigations. Offline POS uses our own 5s
  // connection checker + Dexie outbox instead (see src/lib/offline/).
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
  ],
};

export default nextConfig;
