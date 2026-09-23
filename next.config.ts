import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // useOffline disabled — it was triggering Next.js global-error
  // ("This page couldn't load") on client navigations in this app.
};

export default nextConfig;
