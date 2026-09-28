"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker in production only.
 * In development, actively unregisters any existing SW and clears caches so
 * Turbopack HMR is never served stale module factories.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      if ("caches" in window) {
        void caches.keys().then((keys) => {
          for (const key of keys) void caches.delete(key);
        });
      }
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.warn("SW register failed", err));
  }, []);

  return null;
}
