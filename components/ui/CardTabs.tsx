"use client";

import { useId, useState } from "react";

/**
 * Small tabs inside a card (unlike ViewTabs, the choice isn't put in the address). Every panel
 * is in the page; only the chosen one shows.
 */
export function CardTabs({ label, tabs }: { label: string; tabs: { key: string; label: string; panel: React.ReactNode }[] }) {
  const [current, setCurrent] = useState(tabs[0]?.key);
  const id = useId();
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 rounded-lg bg-sunken p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${id}-${t.key}-tab`}
            aria-selected={current === t.key}
            aria-controls={`${id}-${t.key}`}
            onClick={() => setCurrent(t.key)}
            className={`rounded-md px-3 py-1 text-sm font-semibold ${current === t.key ? "bg-raised text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} id={`${id}-${t.key}`} role="tabpanel" aria-labelledby={`${id}-${t.key}-tab`} hidden={current !== t.key} className="mt-3">
          {t.panel}
        </div>
      ))}
    </div>
  );
}
