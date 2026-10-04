"use client";

import { useEffect, useState } from "react";

/**
 * False during SSR and the first client render, true afterwards. Anything that
 * depends on the viewer's time zone, clock or the browser's ICU locale data
 * (dates, "5m ago") must wait for this: the server formats with its own, and a
 * differing string fails hydration.
 */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
