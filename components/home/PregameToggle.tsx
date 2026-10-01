"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

/**
 * The next-game bar with a "Pre-game breakdown" button beside the other actions. The breakdown
 * stays in the page (so it's searchable and server-rendered) but is hidden until opened.
 */
export function PregameToggle({
  bar,
  actions,
  footer,
  children,
}: {
  bar: React.ReactNode;
  actions: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl bg-header text-header-fg">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          {bar}
          <div className="flex flex-wrap items-center gap-3">
            {actions}
            <button
              type="button"
              className="btn btn-secondary border-header-fg/40 text-header-fg hover:bg-white/10"
              aria-expanded={open}
              aria-controls={id}
              onClick={() => setOpen((o) => !o)}
            >
              Pre-game breakdown
              <ChevronDown size={16} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
        {footer}
      </div>
      <div id={id} hidden={!open} className="space-y-4">
        {children}
      </div>
    </div>
  );
}
