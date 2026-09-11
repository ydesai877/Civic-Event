/**
 * Prefix a file in `public/` with the site's base path.
 *
 * A GitHub Pages project site is served from a subfolder, so `/logos/x.svg`
 * is really `/Civic-Event/logos/x.svg`. Next.js rewrites its own bundles and
 * <Link> hrefs, but NOT the `src` of an image, so anything pointing into
 * public/ has to be prefixed by hand or it 404s in production.
 *
 * NEXT_PUBLIC_BASE_PATH is inlined at build time, so this works the same in
 * server and client components.
 */
export function assetPath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
