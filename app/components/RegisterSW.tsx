"use client";

import { useEffect } from "react";

/** Registers the service worker that makes the app work offline (in production only). */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* the app works fine without it, just not offline */
    });
  }, []);
  return null;
}
