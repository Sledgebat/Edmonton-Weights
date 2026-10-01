"use client";

import { useEffect, useRef, useState } from "react";

/** NHL headshot (see LICENSING.md); hides itself if the image can't load. */
export function Headshot({ src, size = 128 }: { src: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // The image may fail before React hydrates and attaches onError, so check once on mount.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) {
      const id = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(id);
    }
  }, []);
  if (failed) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- remote NHL asset; next/image adds nothing here */
    <img
      ref={ref}
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="h-28 w-28 rounded-full border-4 border-header-accent bg-white/10 object-cover sm:h-32 sm:w-32"
    />
  );
}
