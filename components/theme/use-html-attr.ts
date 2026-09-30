"use client";

import { useSyncExternalStore } from "react";

/** Subscribe to a data attribute on <html>, e.g. useHtmlAttr("data-era", "dynasty"). */
export function useHtmlAttr<T extends string>(name: string, serverValue: T): T {
  return useSyncExternalStore(
    (onChange) => {
      const obs = new MutationObserver(onChange);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: [name] });
      return () => obs.disconnect();
    },
    () => (document.documentElement.getAttribute(name) as T | null) ?? serverValue,
    () => serverValue,
  );
}
