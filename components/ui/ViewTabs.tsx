"use client";

import { useEffect, useState } from "react";

/**
 * Switches between views that are all built into the page (the site is pre-built, so it can't
 * pick a view on the server). The choice is mirrored in the address, e.g. ?view=wildcard, so a
 * link can open a particular view.
 */
export function ViewTabs({
  param,
  options,
  defaultKey,
  panels,
  label,
  extra,
  variant = "pills",
}: {
  param: string;
  options: { key: string; label: string }[];
  defaultKey: string;
  panels: Record<string, React.ReactNode>;
  label: string;
  extra?: React.ReactNode;
  variant?: "pills" | "segmented";
}) {
  const [current, setCurrent] = useState(defaultKey);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(param);
    if (fromUrl && options.some((o) => o.key === fromUrl) && fromUrl !== defaultKey) {
      const id = setTimeout(() => setCurrent(fromUrl), 0);
      return () => clearTimeout(id);
    }
  }, [param, options, defaultKey]);

  function choose(key: string) {
    setCurrent(key);
    const url = new URL(window.location.href);
    if (key === defaultKey) url.searchParams.delete(param);
    else url.searchParams.set(param, key);
    window.history.replaceState(null, "", url);
  }

  const button = (o: { key: string; label: string }) => {
    const on = current === o.key;
    const cls =
      variant === "segmented"
        ? `rounded-md px-3 py-1.5 text-sm font-semibold ${on ? "bg-raised text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`
        : `rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? "border-button bg-button text-button-fg" : "border-line-strong hover:bg-sunken"}`;
    return (
      <button key={o.key} type="button" aria-pressed={on} onClick={() => choose(o.key)} className={cls}>
        {o.label}
      </button>
    );
  };

  return (
    <>
      <div role="group" aria-label={label} className={variant === "segmented" ? "flex gap-1 rounded-lg bg-sunken p-1" : "flex flex-wrap items-center gap-2"}>
        {options.map(button)}
        {extra}
      </div>
      {options.map((o) => (
        <div key={o.key} hidden={current !== o.key}>
          {panels[o.key]}
        </div>
      ))}
    </>
  );
}
