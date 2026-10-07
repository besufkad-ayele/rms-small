import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep experimental.useOffline off — it previously triggered Next.js
  // global-error on client navigations. Offline POS uses our own 5s
  // connection checker + Dexie outbox instead (see src/lib/offline/).
  // Interest form uploads go direct to Storage; keep modest headroom
  // for other Server Actions that may still send small FormData.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    proxyClientMaxBodySize: "10mb",
  },
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
