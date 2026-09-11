import { assetPath } from "@/lib/asset";

/**
 * The publisher's city mark, shown as a square tile on every event row.
 *
 * The tile answers "whose city is this" at a glance, which is the question
 * that matters once the site covers more than one. Sunnyvale's library is a
 * city department, so city and library events carry the same mark and are
 * told apart by the label beside it.
 *
 * A city with no logo on file gets a monogram rather than a broken image or
 * an empty box, so adding a jurisdiction never blocks on artwork.
 */
export function CityLogo({
  logo,
  jurisdiction,
}: {
  logo: string | null;
  jurisdiction: string;
}) {
  // "Sunnyvale, CA" -> "Sunnyvale"
  const city = jurisdiction.split(",")[0].trim();

  return (
    // Smaller on a phone, where the row has 390px to divide between the
    // tile, the title and the time.
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] sm:h-14 sm:w-14">
      {logo ? (
        // A plain img, not next/image: the optimizer needs a server, and at
        // 56px an SVG gains nothing from it.
        <img
          src={assetPath(logo)}
          alt={city}
          width={56}
          height={56}
          loading="lazy"
          decoding="async"
          className="h-[70%] w-[70%] object-contain"
        />
      ) : (
        <span aria-hidden className="text-sm font-semibold text-[var(--muted)] sm:text-lg">
          {monogram(city)}
        </span>
      )}
      {!logo && <span className="sr-only">{city}</span>}
    </div>
  );
}

/** "Mountain View" -> "MV", "Sunnyvale" -> "Su" */
function monogram(city: string): string {
  const words = city.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return city.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}
