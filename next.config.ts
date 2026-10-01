import type { NextConfig } from "next";

/**
 * The site is published as plain files (a static export) rebuilt on a schedule, so it can be
 * hosted for free. On GitHub Pages it lives under /<repo-name>, which the build passes in.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  experimental: {
    // One build worker, so the polite NHL request limit applies to the whole build, and the
    // SQLite file has a single writer.
    cpus: 1,
    staticGenerationMaxConcurrency: 4,
    staticGenerationRetryCount: 1,
  },
};

export default nextConfig;
