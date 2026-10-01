"use client";

import { useState } from "react";
import { useHtmlAttr } from "@/components/theme/use-html-attr";

/**
 * Wraps a score, result or streak. In spoiler-free mode it is blurred by CSS before the page
 * even hydrates (no flash), and becomes a button that reveals it when activated.
 */
export function Spoiler({
  children,
  label = "score",
  className = "",
  as: Tag = "span",
}: {
  children: React.ReactNode;
  /** What is hidden, for screen readers: "score", "result", "streak"... */
  label?: string;
  className?: string;
  as?: "span" | "div";
}) {
  const on = useHtmlAttr<"on" | "off">("data-spoilers", "off") === "on";
  const [revealed, setRevealed] = useState(false);
  const hidden = on && !revealed;
  return (
    <Tag
      className={`spoiler ${className}`}
      data-revealed={revealed ? "" : undefined}
      role={hidden ? "button" : undefined}
      tabIndex={hidden ? 0 : undefined}
      aria-label={hidden ? `Hidden ${label} (spoiler-free mode). Activate to reveal.` : undefined}
      onClick={hidden ? () => setRevealed(true) : undefined}
      onKeyDown={
        hidden
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setRevealed(true);
              }
            }
          : undefined
      }
    >
      {children}
    </Tag>
  );
}
