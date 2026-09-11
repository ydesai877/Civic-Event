import type { NextConfig } from "next";

/**
 * Static export.
 *
 * `next build` emits plain HTML, CSS, JS and one JSON file into `out/`. There
 * is no server at runtime, which is what lets this live on GitHub Pages for
 * free. Everything the site needs is decided at build time.
 *
 * basePath: a GitHub Pages project site is served from a subfolder —
 * https://USER.github.io/REPO — so every internal link and asset needs that
 * prefix. The Pages workflow sets NEXT_PUBLIC_BASE_PATH; local dev leaves it
 * empty and serves from the root.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // Next's image optimizer needs a server. Static export has none.
  images: { unoptimized: true },
  // Emit /events/foo/index.html so a plain file server resolves /events/foo.
  trailingSlash: true,
};

export default nextConfig;
